# Context Glossary

Canonical domain vocabulary for the **Stadium Ops Grid Matrix** platform. All
issues, code, tests, and docs must use these terms exactly — no synonyms.

Architectural decisions live in [`docs/adr/`](docs/adr/). Read the ADRs that
touch an area before working in it.

---

## Platform

- **Stadium Ops Grid Matrix** — The full platform. Do not abbreviate to "SOGM"
  in user-facing text; "the platform" is acceptable in prose.
- **Control Room** — The desktop admin surface (Event Admin / Superadmin). Not
  "dashboard", "console", or "backoffice".
- **Field Client** — The mobile-first PWA surface for ground staff. Not "mobile
  app" or "staff app".

## People & Roles

- **Superadmin** — Global controller; provisions tenants, appoints admins.
  Lives in `users.global_role = 'superadmin'` (ADR-0010). Not "the admin
  role"; the admin role is tenant-scoped. Not "owner" or "root".
- **Event Admin** — Control Room operator scoped to one tenant. Claimed via
  `'admin'` in `tenant_memberships.roles` (ADR-0010). Not "dashboard admin"
  or "backoffice admin".
- **Manager** — Tenant-scoped coordinator. Can reassign staff within a
  tenant and create dispatches. Claimed via `'manager'` in
  `tenant_memberships.roles`. Cannot create staff, transition incidents, or
  promote other users. See ADR-0011 §System roles.
- **Field Staff** — Ground operative using the Field Client. Claimed via
  `'staff'` in `tenant_memberships.roles`. Not "mobile app user" or
  "staff app user".
- **Tenant** — An isolated stadium authority or tournament cluster. Identified
  by `tenantId`. All operational data is partitioned by this key.
- **Membership** — A `(user_id, tenant_id, roles[])` binding in the
  `tenant_memberships` table (ADR-0010). A user has one membership per
  tenant. The `roles` array holds zero or more role names; effective
  permissions are the union across roles. Not "tenant assignment" or "user
  binding".
- **Global Role** — A column on `users` with value `'superadmin'` or
  `'member'` (ADR-0010). Distinct from tenant-scoped roles. A `'member'`
  user has no inherent permissions — all authority flows through their
  memberships. Not "user type" or "account level".

## Permissions & Policy

- **Permission** — A typed capability (e.g. `incident:transition`,
  `tenant:switch`, `staff:reassign`) drawn from the closed `Permission`
  union in `src/lib/permissions.ts`. 15 permissions exist. Checked
  client-side via `usePermissions().can()` and re-enforced server-side via
  `claims.permissions.includes(...)` or via `policy.decide(...)` (see
  Policy). Not "privilege" or "entitlement".
- **Role** — A named bundle of permissions stored in the `roles` table
  (ADR-0011). System roles (`superadmin`, `admin`, `manager`, `staff`) are
  preseeded and non-deletable; custom roles can be created by superadmins.
  Roles are global templates — the same role definition applies in every
  tenant. Not "user type" or "profile".
- **Per-User Grant** — An additive permission override stored in
  `user_permissions(user_id, permission_name)` (ADR-0011). Cannot deny;
  only grant. Effective permissions are the union of role-derived perms and
  per-user grants. Not "override" (too vague) or "exception".
- **Cascade Revoke** — A manual, batched (100 users per transaction) bulk
  removal of per-user grants offered by the UI when a superadmin edits a
  role to remove a permission (ADR-0011 §Cascade Mechanics). Never
  automatic. Not "auto-revoke" or "permission sync".
- **Policy** — A Rego rule that evaluates `(action, subject, resource)`
  tuples to a boolean decision, compiled to WASM and evaluated in-process
  via OPA (ADR-0012). Coexists with RBAC: only 5 of 15 permissions are
  policy-scoped in v1; the rest are flat booleans. Not "rule" or
  "permission rule".
- **Permission Version** — The integer `users.perms_version` column,
  mirrored as the `pv` JWT claim (ADR-0013). Server checks for mismatch on
  every protected request; mismatch → 401 `X-Reason: stale-perms` → client
  calls `/api/auth/refresh`. Not "token version" or "perms revision".
- **Stale Perms** — A 401 response with `X-Reason: stale-perms`, signaling
  the caller's `pv` claim is behind the user's current `perms_version`.
  The client treats this as a silent refresh trigger, not an error.

## Operational Data

- **Incident** — A reported event with tier, category, severity, coordinates,
  and status. Lives in the `incidents` Postgres table.
- **Dispatch** — A directive pushed from the Control Room to a specific Field
  Staff member. Lives in the `dispatches` Postgres table.
- **Info Tier** — One of five priority levels (1–5). Tier 1 = life safety,
  Tier 5 = advisory. See ADR-0007. Never "priority level" or "severity band".
- **Sector** — A named stadium zone (e.g., `ZONE-A`). Mapped to a fixed
  coordinate anchor on the 0–1000 grid.

## Spatial System

- **Grid** — The normalized 0–1000 coordinate plane onto which all physical
  stadium locations are projected. Not "map space" or "pixel grid".
- **Optimized Stadium Map Canvas** — The offscreen-double-buffered HTML5 Canvas
  component (`OptimizedStadiumMapCanvas`). Not "the map" or "canvas widget".
- **Map Layout** — The `tenants.mapLayout` JSONB column storing a multi-floor
  zone + POI configuration. The TypeScript interface lives in
  `src/lib/map-layout.ts`. Not "map config" or "stadium config".
- **Floor** — A level of the stadium (Ground, Level 200, Suite Level). Each
  floor has its own zones and POIs. Staff and incidents belong to a floor.
  Not "level" (ambiguous with InfoTier) or "deck".
- **Map Zone** — A polygon-bounded area on a specific floor (e.g., ZONE-A
  on the Ground Level). Defined by vertices on the 0–1000 grid. Not
  "sector" (sectors are the legacy 6-zone shorthand from `sectors.ts`;
  zones are the richer per-floor polygon definitions).
- **POI** — Point of Interest on the map: a gate, exit, restroom, first aid
  station, concession, security post, elevator, stairs, parking area, or
  vomitory. Typed via `POIType` (11 types). Not "marker" or "pin".

## Security & Audit

- **Edge JWT** — The RS256-signed JSON Web Token minted at the Netlify Edge,
  carrying `permissions[]` + `pv` + `global_role` + `tenant_id` claims (ADR-0003,
  amended by ADR-0010/0011/0013). See ADR-0003 §JWT Claim Shape. Not "session
  token" or "auth token".
- **OTP** — One-time password delivered via Twilio for Field Staff login.
- **Operational Window** — A time-based guard ("the switch") that rejects
  writes outside configured match hours. Superadmins bypass. Enforced
  server-side in `netlify/lib/operational-window.ts`. Not "time lock" or
  "schedule gate".
- **Audit Chain** — The tamper-evident SHA-256 chained log of every state
  mutation. Stored in Postgres (`audit_ledger` table, ADR-0005). Not "audit log" (that implies
  a mutable append table); "chain" emphasises the cryptographic linkage.
- **WORM** — Write-Once-Read-Many. In this platform, enforced as
  _tamper-evident_ (detectable) not _tamper-proof_ (prevented). See ADR-0005.

## AI Pipeline

- **Voice Triage** — The two-call pipeline: Whisper transcription → Gemini
  structured extraction. See ADR-0006. Not "speech pipeline" or "audio
  ingestion".
- **Triage Result** — The structured JSON returned by the Voice Triage pipeline
  (tier, category, severity, locationSector, actionRequired).

## Real-time

- **State Poll** — The diff-based polling endpoint (`/api/state-poll`) the
  client calls every ~2 seconds. See ADR-0004. Not "sync" or "refresh".
- **Diff Response** — The server response containing only records changed since
  a client-supplied `sinceTimestamp`.
- **Offline Queue** — IndexedDB-backed buffer for mutations when network is
  unavailable. Drained FIFO on reconnect, preserving original client
  timestamps. Implemented in `src/lib/offline-db.ts`. Not "outbox" or
  "mutation cache".

## Tooling

- **Matchday Simulator** — Stress test script (`npm run simulate`) that seeds
  250 staff + 50 incidents and measures query latency + mutation throughput.
  Run before every deploy alongside `npm run verify:deploy`.

## Out of Scope

- **Social Listening** — The crowdsourced social-media clustering pipeline.
  Deferred. See ADR-0008. Do not implement until reopened.
