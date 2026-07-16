# Dynamic Edge-Routed Custom Domain Architecture

This document specifies the technical design, network ingress flow, and database mapping strategies required to support fully custom client domains (e.g., `ops.wembley.com`) pointing to the multi-tenant SaaS Stadium Ops core.

---

## 1. High-Level Ingress Flow

Rather than forcing tenants onto standardized subdomains (`wembley.stadiumops.com`), the platform permits external DNS delegation.

```
[ Client Domain: ops.wembley.com ]
                │
                ▼ (DNS CNAME / Anycast IP)
   [ Cloudflare Enterprise / Netlify Ingress ] ◄── (Automated SSL Provisioning)
                │
                ▼ (Pre-routing Request Hook)
     [ Netlify Edge Function Router ] ─── (Queries Cached Domain-to-Tenant Map)
                │
                ▼ (Headers Injected: x-tenant-id, x-tenant-brand)
  [ Multi-Tenant React Core (Vite SPA) ]
                │
                ▼
 [ Web Context Hydrated & Storage Sandboxed ]
```

---

## 2. Dynamic Domain Resolution (Edge Hook)

An Edge Worker intercepts incoming HTTP requests at the network margin, determines the tenant context based on the `Host` header, and passes the resolved context downstream via request headers.

### Edge Function Logic (`netlify/edge-functions/domain-router.ts`)

```typescript
import { Context } from '@netlify/edge-functions';

interface DomainMapping {
	tenantId: string;
	customLogoUrl?: string;
	primaryColor?: string;
	secondaryColor?: string;
}

/**
 * Edge interceptor to resolve custom hostnames to isolated tenant contexts.
 */
export default async function handler(request: Request, context: Context) {
	const url = new URL(request.url);
	const hostname = request.headers.get('host') || '';

	// 1. Bypass asset, static, and API system routes
	if (
		url.pathname.startsWith('/assets/') ||
		url.pathname.startsWith('/api/') ||
		url.pathname.endsWith('.png') ||
		url.pathname.endsWith('.ico')
	) {
		return; // Pass through to standard CDN routing
	}

	try {
		// 2. Fetch the domain-to-tenant mapping from our fast-cache layer (Redis or Firestore Edge Cache)
		// For demo purposes, mapping resolution is emulated below:
		const mapping: DomainMapping | null = await resolveTenantFromHostname(hostname);

		if (!mapping) {
			// Fallback: If domain is unrecognized, serve a 404 or redirect to the primary landing marketing site
			return new Response('Domain Not Configured. Contact Platform Administration.', { status: 404 });
		}

		// 3. Inject resolution context into downstream headers
		const modifiedHeaders = new Headers(request.headers);
		modifiedHeaders.set('x-tenant-id', mapping.tenantId);
		modifiedHeaders.set('x-tenant-brand-primary', mapping.primaryColor || '#0f172a');
		modifiedHeaders.set('x-tenant-brand-secondary', mapping.secondaryColor || '#10b981');

		// Rewrite request dynamically so the SPA receives tenant contextual headers at the root path
		return context.rewrite(url.pathname, {
			headers: modifiedHeaders,
		});
	} catch (error) {
		console.error(`Edge Domain Routing Failure for host: ${hostname}`, error);
		return new Response('Internal Gateway Error', { status: 502 });
	}
}

// Emulated fast-path lookup mapping database
async function resolveTenantFromHostname(hostname: string): Promise<DomainMapping | null> {
	const normalizedHost = hostname.toLowerCase();

	const mockDb: Record<string, DomainMapping> = {
		'ops.wembley.com': {
			tenantId: 'tenant_wembley_london',
			primaryColor: '#00205b', // Wembley Blue
			secondaryColor: '#ffffff',
		},
		'ops.campnou.cat': {
			tenantId: 'tenant_fcb_barcelona',
			primaryColor: '#004d98', // Blaugrana Blue
			secondaryColor: '#a50044', // Blaugrana Deep Red
		},
	};

	return mockDb[normalizedHost] || null;
}
```

---

## 3. Web UI Client Hydration Strategy

Once headers are rewritten at the edge, the single-page application must bootstrap its identity runtime using those parameters.

```typescript
// src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';

interface CustomDomainTenantContext {
  tenantId: string;
  brandColors: {
    primary: string;
    secondary: string;
  };
}

const TenantContext = createContext<CustomDomainTenantContext | null>(null);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenantConfig, setTenantConfig] = useState<CustomDomainTenantContext | null>(null);

  useEffect(() => {
    // 1. Read headers injected dynamically by our Edge function
    // For local development or serverless pass-through, fallback to window.location analysis
    const edgeTenantId = document.documentElement.getAttribute('data-tenant-id')
      || window.HEADERS?.['x-tenant-id']
      || resolveDevelopmentTenant(window.location.hostname);

    const brandPrimary = document.documentElement.getAttribute('data-brand-primary') || "#0f172a";
    const brandSecondary = document.documentElement.getAttribute('data-brand-secondary') || "#10b981";

    if (edgeTenantId) {
      setTenantConfig({
        tenantId: edgeTenantId,
        brandColors: {
          primary: brandPrimary,
          secondary: brandSecondary
        }
      });

      // 2. Hydrate dynamic CSS variables globally to support instant whitelabeling
      document.documentElement.style.setProperty('--brand-primary', brandPrimary);
      document.documentElement.style.setProperty('--brand-secondary', brandSecondary);
    }
  }, []);

  return (
    <TenantContext.Provider value={tenantConfig}>
      {children}
    </TenantContext.Provider>
  );
};

function resolveDevelopmentTenant(hostname: string): string {
  if (hostname.includes("wembley")) return "tenant_wembley_london";
  if (hostname.includes("campnou")) return "tenant_fcb_barcelona";
  return "tenant_default_sandbox"; // Default fallback sandbox
}
```

---

## 4. Operational DNS Setup Instructions for Tenants

For a client to activate their custom domain configuration, they must execute a simple DNS delegation sequence:

1. **Create DNS Record**:
   Inside the client's DNS management panel (Cloudflare, GoDaddy, Route53), configure a CNAME record pointing to our secure platform gateway ingress proxy:

   ```text
   Type: CNAME
   Name: ops (or preferred subdomain)
   Target: ingress.stadiumops.com
   TTL: Automatic / 300 seconds
   ```

2. **Automated SSL Certificate Lifecycle (Let's Encrypt / ACME)**:
   Our cloud ingress gateway listens for new hostname requests. On initial handshake, it dynamically requests, signs, and auto-renews a secure Let's Encrypt SSL/TLS wildcard certificate for the target domain.

3. **Tenant Onboarding Validation**:
   The administrative dashboard must verify the CNAME configuration before enabling dynamic resolution logic to prevent routing hijack attacks.

---

## 5. Security & Isolation Constraints

- **Strict CORS & CSP Rules**: Custom domains must execute strict Content Security Policies (CSP) restricting fetch parameters solely to our platform's authorized real-time databases and serverless endpoints.
- **Firestore Security Rule Verification**: Even if a custom domain attempts to pass a different header, our server-side database engine rejects queries if the underlying `request.auth.token.tenantId` matches a different secure partition.
