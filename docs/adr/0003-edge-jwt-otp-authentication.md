# ADR-0003: Edge JWT Authentication with Twilio OTP

## Status

Accepted — supersedes the authentication approaches in
`docs/EDGE-GATEWAY.md`, `docs/SECURITY-GATING.md` (§2), `docs/MASTER-SHELL.md`
(§1), and `docs/STATE-MANAGEMENT.md` (§1), which describe mutually
contradictory and/or insecure auth implementations.

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
