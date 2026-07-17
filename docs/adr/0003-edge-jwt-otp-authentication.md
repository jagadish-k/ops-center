# ADR-0003: Edge JWT Authentication with Twilio OTP

## Status

Accepted — supersedes the authentication approaches in
`docs/EDGE-GATEWAY.md`, `docs/SECURITY-GATING.md` (§2), `docs/MASTER-SHELL.md`
(§1), and `docs/STATE-MANAGEMENT.md` (§1), which describe mutually
contradictory and/or insecure auth implementations.

**Amended** by [ADR-0010](0010-identity-model-split.md) (identity split),
[ADR-0011](0011-db-driven-rbac.md) (DB-driven RBAC), and
[ADR-0013](0013-permission-staleness.md) (staleness via `perms_version`).
The JWT claim shape has changed; see §JWT Claim Shape (post-ADR-0013) below.
The signing algorithm, key handling, and verification infrastructure in this
ADR remain authoritative.

## Context

The documentation contains **three different, incompatible implementations** of
the same `auth-bootstrap.ts` edge function:

1. **`docs/EDGE-GATEWAY.md`** — Mints "tokens" as
   `wm2026_saas_live_${btoa(JSON.stringify(claims))}`. This is an **unsigned,
   base64-encoded string** — trivially forgeable by anyone. It also hardcodes
   OTPs (`otp === '123456'`).
2. **`docs/SECURITY-GATING.md` §2** — Mints real Firebase Custom Tokens via Web
   Crypto RS256 signing. Better, but (a) depends on Firebase (rejected by
   ADR-0002), and (b) contains a **critical crypto bug**: it uses
   `{ name: 'RSASHA264' }` which is not a valid Web Crypto algorithm name (the
   correct value is `{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }`).
3. **`docs/MASTER-SHELL.md` §1** — Reads the base64 token from `localStorage`
   and **trusts the client-decoded claims** for authorization. Pure client-side
   trust — any user can edit `localStorage` to escalate to `superadmin`.

None of these are acceptable for a real production system. Per ADR-0002, there
is no Firebase Auth to lean on either.

## Decision

Implement **edge-based JWT authentication** with the following properties:

1. **OTP delivery via raw Twilio SMS with self-generated codes.** The edge
   function generates a 6-digit code, stores it in the `otp_sessions` Postgres
   table (with expiry + attempt count), sends it via Twilio SMS, and verifies
   it server-side. We own the security logic (cooldown, attempt limits, expiry).
   _Previously considered: Twilio Verify (managed) — rejected in favor of more
   control and lower per-verification cost._
2. **Whitelist verification** — the edge function queries `staff_roster` in
   Postgres to confirm the phone number is authorized and resolve its role +
   tenant.
3. **RS256 JWT minting via Web Crypto** at the edge, with the **correct**
   algorithm identifier: `{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }`.
   The JWT payload contains:
   ```json
   { "role": "admin|staff|superadmin", "tenantId": "...", "phoneNumber": "...", "iat": ..., "exp": ... }
   ```
4. **Server-side verification on every request** — every Netlify Function
   verifies the JWT signature (using the public key) and extracts claims
   server-side. **Client-decoded claims are never trusted for authorization.**
   The client may decode claims for UI rendering only.
5. **Private key** stored as a Netlify environment variable (`JWT_PRIVATE_KEY`,
   PEM format). Public key embedded for verification.

### Known reference-code bugs to fix

| Location | Bug | Fix |
| --- | --- | --- |
| `docs/SECURITY-GATING.md:157` | `{ name: 'RSASHA264', hash: 'SHA-256' }` | `{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }` |
| `docs/SECURITY-GATING.md:178` | `sign('RSASHA264', ...)` | `sign('RSASSA-PKCS1-v1_5', ...)` |
| `docs/EDGE-GATEWAY.md:97` | Unsigned `btoa(claims)` token | Real RS256 JWT via Web Crypto |
| `docs/MASTER-SHELL.md:42-58` | Trusts `localStorage` claims for authz | Verify JWT signature server-side on every request |

## Consequences

**Positive:**

- Real cryptographic authentication — no forgeable tokens.
- No Firebase Auth dependency; stays on Netlify-only infra (per ADR-0002).
- Twilio Verify offloads OTP security (rate limits, cooldown, fraud) to a
  managed service.

**Negative:**

- More code to write and secure than using a managed auth provider (Firebase
  Auth, Supabase Auth, Clerk). Every authorization check must be implemented
  imperatively in each function.
- Key management: the RSA private key is a critical secret. If it leaks, all
  tokens are forgeable. Must be rotated periodically.
- JWT revocation is hard (JWTs are stateless). Mitigate with short expiry
  (1 hour) + a denylist table if immediate revocation is needed.

**Related:** ADR-0002 (data layer), ADR-0004 (real-time — JWT verified on every
poll).

## JWT Claim Shape (post-ADR-0013)

The original JWT payload specified in §Decision item 3 was:

```json
{ "role": "admin|staff|superadmin", "tenantId": "...", "phoneNumber": "...", "iat": ..., "exp": ... }
```

That shape assumed a single role per user, no per-user permission overrides,
and no staleness signal. ADR-0010 (identity split), ADR-0011 (DB-driven
RBAC), and ADR-0013 (staleness) collectively replace it with:

```json
{
  "sub": "<user uuid>",
  "global_role": "superadmin|member",
  "tenant_id": "tenant_metlife_ops",
  "permissions": ["incident:create", "incident:read", "dispatch:read", ...],
  "pv": 7,
  "auth_provider": "phone_otp|google_oauth",
  "iat": 1234567890,
  "exp": 1234571490,
  "iss": "stadium-ops",
  "aud": "stadium-ops-clients"
}
```

### What changed and why

| Original field | New field | Reason |
|---|---|---|
| `role: 'admin'\|'staff'\|'superadmin'` | `global_role: 'superadmin'\|'member'` + `permissions[]` | A user can hold multiple tenant-scoped roles; `permissions[]` is the resolved union (ADR-0011). Server never branches on role names — only on `permissions.includes(...)`. |
| `tenantId` | `tenant_id` | Same semantics, naming aligned with snake_case JSON convention. |
| `phoneNumber` | `sub` (UUID) + `auth_provider` | Phone is no longer the primary identifier (ADR-0010). `sub` is the stable user UUID; `auth_provider` indicates phone-OTP vs Google-OAuth (future). |
| _(none)_ | `pv` (permission version) | ADR-0013 staleness signal. Server compares `claims.pv` to `users.perms_version`; mismatch → 401 `X-Reason: stale-perms`, client refreshes. |

### What did NOT change

- **Signing algorithm:** RS256 via Web Crypto / `jose`. The
  `{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }` identifier is correct.
- **Key management:** Private key in `JWT_PRIVATE_KEY` env (PEM); public key
  in `JWT_PUBLIC_KEY` env (PEM).
- **Server-side verification on every request:** Client-decoded claims are
  never trusted for authorization.
- **OTP delivery via raw Twilio SMS** with self-generated codes.
- **Issuer / audience:** `stadium-ops` / `stadium-ops-clients`.

### New endpoints required by this change

- `POST /api/auth/refresh` — re-mints the JWT after a `stale-perms` 401
  (ADR-0013).
- `POST /api/auth/switch-tenant` — superadmin context switch (re-mints
  with new `tenant_id`, recomputes `permissions[]` for that tenant).

These do not change the original OTP handshake (`/api/auth/request-otp`,
`/api/auth/verify-otp`) — those endpoints still produce the initial JWT,
now in the new shape.
