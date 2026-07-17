# ADR-0013: Permission Staleness via `perms_version` Stamp

## Status

Accepted — adds JWT staleness detection to the RBAC + ABAC model from
[ADR-0011](0011-db-driven-rbac.md) and [ADR-0012](0012-abac-opa-wasm.md).
Builds on [ADR-0003](0003-edge-jwt-otp-authentication.md)'s JWT shape.

## Context

ADR-0003 mints stateless RS256 JWTs with `JWT_EXPIRES_IN=3600` (1 hour).
ADR-0011 + ADR-0012 add:

- DB-driven roles and per-user grants that can change at any time.
- A bulk-revoke cascade that touches many users at once when a superadmin
  edits a role.
- ABAC policies that may be recompiled and redeployed.

Without a staleness mechanism, a demoted user keeps their old permissions
for up to 1 hour. A superadmin who removes `audit:view` from the `admin`
role cannot trust that change for an hour. This is a real security gap.

The standard solutions each have problems:

- **Short TTL + silent refresh.** Burdens every user with refresh churn even
  when nothing changed.
- **Token denylist.** Unbounded growth; cleanup job required; per-request
  DB query.
- **Re-evaluate from DB on every request.** Kills statelessness; ~3 queries
  per request.

## Decision

Add an integer `perms_version` column to `users` and a `pv` claim to the
JWT. Server checks for mismatch on every protected request.

### Schema

```sql
ALTER TABLE users
  ADD COLUMN perms_version INTEGER NOT NULL DEFAULT 1;
```

Bumped on every event that changes a user's effective permission set:

- Direct grant added/removed (`user_permissions` insert/delete)
- Role assignment changed (`tenant_memberships.roles` update)
- Role definition changed (any `role_permissions` mutation that affects a
  role this user holds — bulk-bumps all affected users in one UPDATE)
- User's `global_role` changed
- User's `status` changed to/from `disabled`

### JWT claim shape

The JWT (extended from ADR-0003) now carries:

```json
{
  "sub": "<user uuid>",
  "global_role": "member",
  "tenant_id": "tenant_metlife_ops",
  "permissions": ["incident:create", "incident:read", "dispatch:read", ...],
  "pv": 7,
  "auth_provider": "phone_otp",
  "iat": 1234567890,
  "exp": 1234571490,
  "iss": "stadium-ops",
  "aud": "stadium-ops-clients"
}
```

`role` (singular, from ADR-0003) is removed; it is replaced by
`global_role` (only `'superadmin' | 'member'`) plus the resolved
`permissions[]` array. Server-side authorization never branches on role
names — only on `permissions.includes(...)` or `policy.decide(...)`.

### Server check (every protected request)

```ts
async function authorize(request, requiredPerm, resource?) {
  const claims = await authenticateRequest(request);
  if (!claims) return 401;

  // Cached lookup (30s TTL in-memory Map on warm instance)
  const currentPv = await getCachedPermsVersion(claims.sub);
  if (currentPv !== claims.pv) {
    return Response.json(
      { error: 'Token permissions are stale.' },
      { status: 401, headers: { 'X-Reason': 'stale-perms' } },
    );
  }

  if (!claims.permissions.includes(requiredPerm)) return 403;

  if (ABAC_SCOPED_ACTIONS.has(requiredPerm)) {
    const ok = await policy.decide(requiredPerm, subjectFrom(claims), resource);
    if (!ok) return 403;
  }

  return null; // authorized
}
```

### Cache

`getCachedPermsVersion(userId)`:

- In-memory `Map<UserId, { pv, fetched_at }>` on the warm function instance.
- TTL: 30 seconds.
- On cache miss or expiry: one indexed query `SELECT perms_version FROM
  users WHERE id = $1`.
- Cache invalidation: `X-Cache-Bust: <random>` header forces a refresh. For
  superadmin debugging only.

This caps DB query overhead at 1 query per 30s per user, not per request.

### Client refresh flow

```
Client receives 401 with X-Reason: stale-perms
  ↓
Client calls POST /api/auth/refresh
  Authorization: Bearer <expired-or-stale-jwt>
  ↓
Server (within 5-minute grace period after exp):
  - Verifies the JWT signature (even if expired)
  - Loads the user's current perms_version and permissions
  - Mints a new JWT with the same sub, fresh permissions[], same or new pv
  - Returns the new token
  ↓
Client retries the original request with the new token
```

### Refresh endpoint specifics

- **Endpoint:** `POST /api/auth/refresh`
- **Authorization:** Bearer JWT (signature must verify; expiry tolerated
  for 5 minutes / 300 seconds post-exp)
- **Rate limit:** 10 calls per minute per user. Enforced via in-memory
  counter on the warm instance. Persisted counters are not required — a
  cold-start resets the counter, which is acceptable since the legitimate
  use pattern is "once after a perms change."
- **Response:** `{ "token": "<new-jwt>", "claims": {...} }`
- **Failure modes:**
  - JWT signature invalid → 401
  - JWT expired >5min ago → 401 with `X-Reason: expired`
  - User now `disabled` → 401 with `X-Reason: user-disabled`
  - Rate limit exceeded → 429

### Cascade interaction

When a superadmin bulk-revokes user grants (ADR-0011 §Cascade Mechanics),
the same transaction bumps `perms_version` for every affected user:

```sql
BEGIN;
DELETE FROM user_permissions
  WHERE user_id = ANY($1::uuid[]) AND permission_name = $2;
UPDATE users SET perms_version = perms_version + 1
  WHERE id = ANY($1::uuid[]);
INSERT INTO audit_ledger (...);
COMMIT;
```

The next request from any of those users returns 401 `stale-perms` and the
client silently refreshes.

### When policies change (ADR-0012)

Policy recompilation does NOT bump `perms_version`. Policies are
server-side state, not user state. A policy change takes effect on the next
function cold-start (which loads the new WASM bundle). Warm instances keep
the old policy until they cold-start; this is acceptable because policy
changes are rare and the next deploy recycles all instances.

## Consequences

**Positive:**

- Demotions take effect within 30 seconds (cache TTL) instead of 1 hour
  (JWT TTL).
- Adds one cached query per 30s per user — negligible.
- No background refresh churn for users whose permissions haven't changed.
- Cascade revocations are atomic with the `perms_version` bump.

**Negative:**

- 30-second window during which a demoted user retains access. Acceptable
  for this platform; for sub-second revocation, a push-based invalidation
  (WebSocket or Server-Sent Events) would be required.
- The 5-minute refresh grace period means a stolen token remains usable
  for 5 minutes after expiry. Mitigated by the 10/min rate limit and the
  fact that the refresh endpoint requires a valid signature.
- In-memory cache means each warm function instance has its own cache. A
  fleet of N instances could in theory delay propagation by 30s × N. In
  practice, Netlify reuses warm instances aggressively and 30s is the
  ceiling.

**Tradeoff accepted:** eventual consistency (30s) in exchange for
stateless JWTs with one cheap cached lookup per request.

## Reference

- Depends on: ADR-0010 (`users` table), ADR-0011 (permission resolution),
  ADR-0003 (JWT signing infrastructure)
- Schema: `users.perms_version`
- Middleware: `netlify/lib/auth.ts` (refactored from inline JWT checks)
- Refresh endpoint: `netlify/functions/auth-refresh.ts`
- Tenant switch (also bumps context): `netlify/functions/auth-switch-tenant.ts`
