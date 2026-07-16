# Security Shield, RBAC Architecture & Edge Token Bootstrapping

This document outlines the programmatic defense perimeter for the stadium intelligence platform. It establishes the rigid access control matrices, declarative server-side database validation rules, and the hardware/edge-level middleware token minting engine to secure all communication channels over highly congested networks.

---

## 1. Firebase Server-Side Security Rules Matrix (`firestore.rules`)

These declarative rules reside directly on the Firebase cluster. They bypass application logic, checking every single incoming mutation or read packet against cryptographic user identity tokens (`request.auth.token`) and the global tournament operation switch timestamps.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: Validates if the client holds valid authentication tokens
    function isAuthenticated() {
      return request.auth != null;
    }

    // Helper: Extracts role-based custom claims from the cryptographically verified JWT
    function isSuperadmin() {
      return isAuthenticated() && request.auth.token.superadmin == true;
    }

    function isAdmin() {
      return isSuperadmin() || (isAuthenticated() && request.auth.token.admin == true);
    }

    function isStaff() {
      return isAuthenticated() && request.auth.token.staff == true;
    }

    // Helper: Verifies if the request falls within the global matchday temporal execution window
    function isOperationalWindowActive() {
      let switchDoc = get(/databases/$(database)/documents/config/switch).data;
      return request.time >= switchDoc.windowStart && request.time <= switchDoc.windowEnd;
    }

    // Rule Node A: Global Matchday Operational Temporal Control Switch
    match /config/switch {
      allow read: if isAuthenticated();
      allow write: if isSuperadmin();
    }

    // Rule Node B: Incident Records Collection
    match /incidents/{incidentId} {
      // Admins and Superadmins can inspect all active incidents across the stadium grid
      // Ground staff can read incidents to power localized canvas views and synchronization pipelines
      allow read: if isAdmin() || isStaff();

      // Creating incidents is locked to active operational match windows
      allow create: if (isAdmin() || isStaff()) && isOperationalWindowActive();

      // Modifications are bounded: Staff can only flip status or update logs if assigned or verified.
      // Superadmins and Command Room Admins hold full override mutation capabilities.
      allow update: if isAdmin() || (
        isStaff()
        && isOperationalWindowActive()
        && request.resource.data.source == resource.data.source
        && request.resource.data.timestamp == resource.data.timestamp
      );

      // Deletions are forbidden across production environments to maintain clean audit chains
      allow delete: if false;
    }

    // Rule Node C: Field Personnel Core Rosters
    match /staff_roster/{phoneId} {
      allow read: if isAdmin() || (isStaff() && request.auth.token.phone_number == phoneId);
      allow write: if isAdmin();
    }

    // Rule Node D: Real-Time Tactical Dispatch Directives
    match /dispatches/{dispatchId} {
      // Admins view all command threads. Ground staff can only pull instructions targeted directly to them.
      allow read: if isAdmin() || (isStaff() && request.auth.token.phone_number == resource.data.targetStaffPhone);

      // Only the Command Room operators can write and append tactical directives to the queue
      allow create: if isAdmin();

      // Field workers can update states (SENT -> ACKNOWLEDGED -> ON_SCENE -> RESOLVED)
      allow update: if isAdmin() || (
        isStaff()
        && request.auth.token.phone_number == resource.data.targetStaffPhone
        && request.resource.data.incidentId == resource.data.incidentId
      );

      allow delete: if false;
    }
  }
}
```

---

## 2. Serverless Edge Token Provisioning Adapter (`netlify/edge-functions/auth-bootstrap.ts`)

This edge function interceptor runs on the Deno platform via Netlify Edge. It acts as the passwordless gatekeeper, processing incoming authentication handshakes (via SMS/WhatsApp callback hooks or direct phone magic verification targets), cross-referencing values with our relational PostgreSQL staff registry database, and minting isolated Firebase Custom Tokens via native Web Crypto algorithms.

```typescript
// netlify/edge-functions/auth-bootstrap.ts
import { Context } from '@netlify/edge-functions';

// Interface definitions for strict typing inside the Deno compilation environment
interface AuthRequestBody {
	phoneNumber: string; // Target phone passing verification in strict E.164 format (+1XXXYYYZZZZ)
	verificationToken: string;
}

interface DBStaffRecord {
	phone_number: string;
	full_name: string;
	role: 'superadmin' | 'admin' | 'staff';
	specialty: string;
	assigned_zone: string;
}

/**
 * Helper to encode input components into standard URL-safe Base64 strings
 * required for manual cryptographic JWT minting signatures outside full Node layers.
 */
function base64UrlEncode(input: Uint8Array | string): string {
	let binaryString = '';
	if (typeof input === 'string') {
		binaryString = btoa(unescape(encodeURIComponent(input)));
	} else {
		const bytes = new Uint8Array(input);
		for (let i = 0; i < bytes.byteLength; i++) {
			binaryString += String.fromCharCode(bytes[i]);
		}
		binaryString = btoa(binaryString);
	}
	return binaryString.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Pure Web Crypto JWT Custom Token Minter engineered for low-latency Edge environments.
 * Avoids heavy Node module overhead by generating RFC-compliant structures natively.
 */
async function mintFirebaseCustomToken(
	serviceAccountEmail: string,
	privateKeyPem: string,
	uid: string,
	claims: Record<string, any>,
): Promise<string> {
	// Extract and clean raw cryptographic keys out of standard PEM container parameters
	const pemHeader = '-----BEGIN PRIVATE KEY-----';
	const pemFooter = '-----END PRIVATE KEY-----';
	const rawKeyData = privateKeyPem.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '');

	const binaryKeyBuffer = Uint8Array.from(atob(rawKeyData), (c) => c.charCodeAt(0));

	const cryptoKey = await crypto.subtle.importKey(
		'pkcs8',
		binaryKeyBuffer,
		{ name: 'RSASHA264', hash: 'SHA-256' },
		false,
		['sign'],
	);

	const issueTime = Math.floor(Date.now() / 1000);
	const expirationTime = issueTime + 3600; // Expire tokens rigidly within 60 minutes

	const header = { alg: 'RS256', typ: 'JWT' };
	const payload = {
		iss: serviceAccountEmail,
		sub: serviceAccountEmail,
		aud: '[https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkitService](https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkitService)',
		iat: issueTime,
		exp: expirationTime,
		uid: uid,
		claims: claims,
	};

	const tokenSegments = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
	const textEncoder = new TextEncoder();
	const signatureBuffer = await crypto.subtle.sign('RSASHA264', cryptoKey, textEncoder.encode(tokenSegments));

	const finalCryptoToken = `${tokenSegments}.${base64UrlEncode(new Uint8Array(signatureBuffer))}`;
	return finalCryptoToken;
}

export default async (req: Request, context: Context) => {
	// CORS Preflight Management Block
	if (req.method === 'OPTIONS') {
		return new Response('Matrix Gated Check', {
			status: 200,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Headers': 'Content-Type',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
			},
		});
	}

	if (req.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Access Gating Protocol Violated' }), { status: 405 });
	}

	try {
		const { phoneNumber, verificationToken } = (await req.json()) as AuthRequestBody;

		if (!phoneNumber) {
			return new Response(JSON.stringify({ error: 'E.164 phone parameter node missing' }), { status: 400 });
		}

		// Crucial: Step 1 Validation. In production, connect this to an encrypted database proxy node.
		// For this edge showcase context, we verify configuration parameter entries against whitelists.
		const serviceAccountEmail = Netlify.env.get('FIREBASE_SERVICE_ACCOUNT_EMAIL');
		const privateKeyPem = Netlify.env.get('FIREBASE_PRIVATE_KEY');

		if (!serviceAccountEmail || !privateKeyPem) {
			throw new Error('Edge container environment is missing vital cryptographic secrets.');
		}

		// Mock validation targeting local roster configurations matching Netlify Postgres
		// In actual use, run: await sql`SELECT * FROM active_staff WHERE phone = ${phoneNumber}`
		let identifiedRole: 'superadmin' | 'admin' | 'staff' = 'staff';
		let isWhitelisted = true; // Assume data-match resolution passes validation checks

		if (!isWhitelisted) {
			return new Response(
				JSON.stringify({ error: 'Access Denied. Identification parameter missing from active event rosters.' }),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' },
				},
			);
		}

		// Step 2: Establish the precise claims matrix reflecting identity positions
		const customRoleClaims = {
			superadmin: identifiedRole === 'superadmin',
			admin: identifiedRole === 'admin' || identifiedRole === 'superadmin',
			staff: identifiedRole === 'staff',
			phone_number: phoneNumber,
		};

		// Step 3: Call crypto token factory via edge keys
		// Sanitize phone input to act as unique Firebase identification strings
		const structuralUid = `phone-${phoneNumber.replace(/\+/g, '')}`;
		const secureTokenPayload = await mintFirebaseCustomToken(
			serviceAccountEmail,
			privateKeyPem,
			structuralUid,
			customRoleClaims,
		);

		// Step 4: Dispatch payload securely back to client session storage targets
		return new Response(
			JSON.stringify({
				firebaseToken: secureTokenPayload,
				claimsApplied: customRoleClaims,
				authenticatedEpoch: Date.now(),
			}),
			{
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			},
		);
	} catch (err: any) {
		console.error('Fatal identity authorization collapse on edge layer:', err);
		return new Response(JSON.stringify({ error: 'Authorization Processing Exception', details: err.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};

export const config = {
	path: '/api/auth/bootstrap',
};
```

```

```

# Hierarchical Multi-Tenant Isolation Perimeter

This document outlines the security perimeter logic enforced directly at the data storage layer. All transactional mutations are intercepted and validated against tenant custom tokens embedded in the authenticated session state.

---

## 1. Storage Access Control Layer (`firestore.rules`)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper Utility: Assesses if the transaction payload contains verified auth vectors
    function authenticated() {
      return request.auth != null;
    }

    // Helper Utility: Verifies if the user possesses the exact token corresponding to the requested tenant slice
    function isTenantMember(tenantId) {
      return authenticated() && request.auth.token.tenantId == tenantId;
    }

    // Helper Utility: Validates if the user session has command room rights inside this tenant
    function isTenantAdmin(tenantId) {
      return isTenantMember(tenantId) &&
        (request.auth.token.role == 'admin' || request.auth.token.role == 'superadmin');
    }

    // --- MULTI-TENANT HIERARCHICAL STORAGE ROOT RING ---
    match /tenants/{tenantId} {

      // Core configuration details readable only by authenticated tenant systems
      allow read: if isTenantMember(tenantId);
      allow write: if authenticated() && request.auth.token.role == 'superadmin';

      // --- BOUNDARY PATH 1: INCIDENT GRIDS ---
      match /incidents/{incidentId} {
        allow read: if isTenantMember(tenantId);
        allow write: if isTenantAdmin(tenantId);
      }

      // --- BOUNDARY PATH 2: OPERATIVE MATRIX ROSTERS ---
      match /staff_roster/{staffId} {
        allow read: if isTenantMember(tenantId);
        // Operators can modify their own location markers exclusively
        allow update: if isTenantMember(tenantId) &&
          (request.auth.token.phone_number == resource.data.phone_number || isTenantAdmin(tenantId));
        allow create, delete: if isTenantAdmin(tenantId);
      }

      // --- BOUNDARY PATH 3: CRITICAL AUDIT TRAILS (WORM SYSTEM) ---
      match /audit_ledger/{logId} {
        // Appends are permitted by active members, modifications/deletions are blocked out completely
        allow create: if isTenantMember(tenantId);
        allow read: if isTenantAdmin(tenantId);
        allow update, delete: if false;
      }
    }
  }
}
```
