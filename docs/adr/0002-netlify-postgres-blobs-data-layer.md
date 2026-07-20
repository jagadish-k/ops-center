# ADR-0002: Netlify Postgres + Netlify Blobs Data Layer (No Firebase)

## Status

Accepted — supersedes the Firebase/Firestore assumptions throughout
`docs/ARCHITECTURE.md`, `docs/STATE-MANAGEMENT.md`, `docs/SECURITY-GATING.md`,
`docs/MULTI-TENANT-CONTEXT.md`, and `docs/DEPLOYMENT-RUNBOOK.md`.

## Context

The documentation assumes **Google Firebase** as the entire backend:

- **Firestore** for real-time incident, staff, and dispatch collections.
- **Firebase Realtime Database** for high-frequency WebSocket sync.
- **Firebase Authentication** with Custom Claims for RBAC.
- **`firestore.rules`** for declarative server-side security.
- **Firebase offline persistence** (`persistentLocalCache`) for offline-first
  resilience.

However, **no Firebase dependency is installed** (`package.json` contains zero
Firebase packages), no Firebase project is provisioned, and the platform is
deployed on **Netlify** (confirmed by `netlify.toml`, `vite.config.ts`, and the
`@netlify/vite-plugin-react-router`).

Adopting Firebase would mean introducing a second cloud provider (Google Cloud
Platform) alongside Netlify, duplicating infrastructure, increasing cost, and
adding a vendor dependency that the deployment target doesn't natively support.

Netlify provides managed **Postgres** (relational storage) and **Blobs**
(key-value object storage) that can serve the same needs without a second
provider.

## Decision

Use **Netlify-only infrastructure** for all data:

1. **Netlify Postgres** — relational storage for `tenants`, `staff_roster`,
   `incidents`, `dispatches`, `otp_sessions`, and sector coordinate anchors.
   Multi-tenant isolation is enforced via `tenant_id` columns + indexes, with
   authorization checks in Netlify Functions (not declarative `firestore.rules`).
2. **Netlify Blobs** — append-only key-value storage for the **Audit Chain**
   (`audit/{tenantId}/{eventId}`). Blobs are overwrite-capable, so WORM is
   enforced as tamper-evident, not tamper-proof (see ADR-0005).
3. **Netlify Functions / Edge Functions** — all server-side logic (auth, state
   polling, AI triage, mutations, ledger verification) runs as Netlify
   serverless functions.
4. **No Firebase SDK, no Firestore, no Firebase Auth, no `firestore.rules`.**

### Postgres Schema (authoritative)

```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY, org_name TEXT,
  status TEXT DEFAULT 'ACTIVE', created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE staff_roster (
  id TEXT PRIMARY KEY,                       -- E.164 phone
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  full_name TEXT, role TEXT, specialty TEXT, assigned_zone TEXT,
  status TEXT DEFAULT 'AVAILABLE',
  coord_x INT, coord_y INT,                  -- 0-1000 grid
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE incidents (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tier SMALLINT CHECK (tier BETWEEN 1 AND 5),
  status TEXT DEFAULT 'OPEN',
  raw_text TEXT, category TEXT, severity TEXT, location_sector TEXT,
  action_required TEXT, coord_x INT, coord_y INT,
  source TEXT DEFAULT 'field_staff',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE dispatches (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, incident_id TEXT NOT NULL REFERENCES incidents(id),
  target_staff_phone TEXT NOT NULL, directive_text TEXT, status TEXT DEFAULT 'SENT',
  sent_at TIMESTAMPTZ DEFAULT now(), ack_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ
);
CREATE TABLE otp_sessions (
  phone TEXT PRIMARY KEY, code TEXT, expires_at TIMESTAMPTZ, attempts INT DEFAULT 0
);
CREATE INDEX idx_inc_tenant_updated ON incidents(tenant_id, updated_at);
CREATE INDEX idx_staff_tenant ON staff_roster(tenant_id, status);
CREATE INDEX idx_dispatch_staff ON dispatches(target_staff_phone, status);
```

## Consequences

**Positive:**

- Single cloud provider (Netlify). Simpler billing, deployment, and secrets.
- Postgres gives relational integrity, proper indexing, and SQL query power —
  stronger than Firestore for analytical queries.
- No Firebase vendor lock-in or second-project provisioning.
- Blobs are cheap, simple append storage for the audit chain.

**Negative:**

- **No built-in real-time WebSocket sync.** Firestore's `onSnapshot` is gone.
  Real-time is handled by polling (see ADR-0004).
- **No declarative security rules.** `firestore.rules` is replaced by
  imperative authorization checks inside Netlify Functions. This is more code
  to write and test, and a logic bug could leak cross-tenant data.
- **No built-in offline SDK.** Firebase's `persistentLocalCache` is gone.
  Offline-first must be built manually with IndexedDB (see build plan
  Milestone 7).
- **No built-in auth provider.** Authentication must be built from scratch
  (see ADR-0003).

**Supersedes:** All `firestore.rules` examples in `docs/SECURITY-GATING.md` and
the Firestore `onSnapshot` listeners in `docs/STATE-MANAGEMENT.md` and
`docs/MULTI-TENANT-CONTEXT.md` are now reference-only.
