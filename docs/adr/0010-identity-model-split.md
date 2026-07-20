# ADR-0010: Identity Model Split (`users` + `tenant_memberships` + `staff_roster`)

## Status

Accepted — supersedes the implicit identity model in [ADR-0003](0003-edge-jwt-otp-authentication.md)
where `staff_roster.id = phone_number` was the user identity. Introduces a normalized
identity layer required by ADR-0011 (DB-driven RBAC) and ADR-0012 (ABAC).

## Context

ADR-0003 specifies an Edge JWT minted after Twilio OTP verification. The JWT
carries `{ role, tenantId, phoneNumber }`. The user record was conflated with
the operational record: `staff_roster.id` is the E.164 phone number, and
`staff_roster` also holds operational fields (`specialty`, `assigned_zone`,
`coord_x`, `coord_y`, `status`). This conflation has three concrete problems:

1. **Superadmin does not fit the roster.** A superadmin has no specialty, no
   assigned zone, and no single home tenant (they `tenant:switch`). Forcing a
   superadmin row into `staff_roster` requires fake values for `specialty`
   (CHECK constraint blocks anything outside `security/medical/cleaning/
   supervisor`) and a fake tenant_id.

2. **Single-tenant assumption.** `staff_roster.tenant_id` is `NOT NULL` with
   an FK. A user who legitimately operates across multiple tenants (e.g., a
   regional manager covering two stadiums) cannot be modeled without
   duplicate phone-PK rows.

3. **Google OAuth forward incompatibility.** The phone-as-PK convention has
   no place for an email-identified user. When sign-in-with-Google lands, the
   schema would need an awkward parallel identifier column or a parallel
   table.

The permission model in `src/lib/permissions.ts:58` already treats
`superadmin` as "all permissions" and admin/staff as scoped roles, but the
schema cannot express that distinction cleanly.

## Decision

Split identity into three tables, each with a single responsibility:

### `users` — global identity (no tenant, no operational state)

```sql
users
  id              UUID PK DEFAULT gen_random_uuid()
  phone           TEXT UNIQUE              -- E.164; nullable for Google OAuth users
  email           TEXT UNIQUE              -- nullable for phone-only users
  full_name       TEXT NOT NULL
  global_role     TEXT NOT NULL DEFAULT 'member'
                  CHECK (global_role IN ('superadmin','member'))
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','disabled'))
  perms_version   INTEGER NOT NULL DEFAULT 1   -- see ADR-0013
  auth_provider   TEXT NOT NULL DEFAULT 'phone_otp'
                  CHECK (auth_provider IN ('phone_otp','google_oauth'))
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

- `global_role = 'superadmin'` is the only global flag. It grants every
  permission (see ADR-0011 §Permission Resolution).
- `global_role = 'member'` users have no inherent permissions; all of their
  authority is tenant-scoped via `tenant_memberships`.
- Admins and superadmins **do not** get `staff_roster` entries — they don't
  roam, don't have a zone, don't appear on the map.

### `tenant_memberships` — scoped role bindings (many-to-many)

```sql
tenant_memberships
  user_id         UUID FK REFERENCES users(id) ON DELETE CASCADE
  tenant_id       TEXT FK REFERENCES tenants(id) ON DELETE CASCADE
  roles           TEXT[] NOT NULL DEFAULT '{}'  -- role names; app-layer validated
  PK (user_id, tenant_id)
```

- A user can have one membership row per tenant.
- `roles` is a Postgres array because a user can hold multiple roles in the
  same tenant (e.g., `[manager, staff]`). Effective permission set is the
  union across roles (see ADR-0011).
- A user can have memberships in multiple tenants (e.g., admin in tenant A,
  staff in tenant B). The JWT carries the active tenant (see ADR-0013).
- Array elements are validated at write time (server checks each role name
  exists in the `roles` table). No array-element FK — Postgres does not
  support that cleanly.

### `staff_roster` — operational state (refactored)

```sql
staff_roster
  id              UUID PK DEFAULT gen_random_uuid()
  user_id         UUID FK REFERENCES users(id) ON DELETE CASCADE
  tenant_id       TEXT FK REFERENCES tenants(id)
  specialty       TEXT CHECK (specialty IN ('security','medical','cleaning','supervisor'))
  assigned_zone   TEXT NOT NULL
  status          TEXT DEFAULT 'AVAILABLE' CHECK (...)
  phone_number    TEXT NOT NULL              -- denormalized for query speed
  coord_x, coord_y, latitude, longitude, updated_at
  UNIQUE (user_id, tenant_id)
```

- Only `users.global_role = 'member'` AND at least one `staff` role in
  `tenant_memberships` get a roster row.
- `user_id` replaces `id` as the link to identity. `phone_number` is kept
  denormalized for state-poll query speed (avoids a join on the hot path).
- One user can have roster rows in multiple tenants (matches multi-tenant
  membership).

## Consequences

**Positive:**

- Superadmin is a first-class concept with no fake values anywhere.
- Multi-tenant membership is a row, not a schema change.
- Google OAuth adds a column value (`email`, `auth_provider='google_oauth'`)
  — no schema change required when that feature lands.
- The `tenant_memberships.roles[]` array supports multi-role users without
  schema evolution.
- Operational queries (`state-poll`) join through `staff_roster` and are
  unaffected by the identity split.

**Negative:**

- Auth flow (`auth-verify-otp`) gains a join: `users → tenant_memberships →
  role_permissions`. JWT mint latency grows by ~3 queries. Mitigated by the
  30s in-memory role cache (ADR-0011).
- The legacy `claims.role === 'admin'` pattern (used in ~15 call sites) no
  longer works under multi-role. Every check must become a permission check:
  `claims.permissions.includes('staff:manage')`. This is a coordinated
  rewrite undertaken in M9.2.
- `staff_roster.id` is no longer the phone number. Any code that did
  `WHERE id = $phone` (e.g., `auth-verify-otp.ts:59`) must be rewritten to
  query `users WHERE phone = $1` and join to the roster.

**Tradeoff accepted:** bigger initial refactor in exchange for a model that
survives the next three feature additions (Google OAuth, multi-tenant
operators, custom roles) without another schema change.

## Reference

- Supersedes: ADR-0003 implicit identity model (`staff_roster` as user table)
- Required by: ADR-0011 (DB-driven RBAC), ADR-0012 (ABAC), ADR-0013
  (Permission staleness)
- Schema: `database/schema.ts` (M9.1)
- Migration type: destructive (M1 — wipe legacy migrations, see ADR-0014)
