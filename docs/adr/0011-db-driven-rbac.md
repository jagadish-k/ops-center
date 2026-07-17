# ADR-0011: DB-Driven RBAC with Roles, Role-Permissions, and Per-User Grants

## Status

Accepted — replaces the hardcoded `ROLE_PERMISSIONS` map in
`src/lib/permissions.ts:58` with a database-driven model. Depends on
[ADR-0010](0010-identity-model-split.md) (identity split). Required by
[ADR-0012](0012-abac-opa-wasm.md) (ABAC) and
[ADR-0013](0013-permission-staleness.md) (staleness).

## Context

The existing `src/lib/permissions.ts` defines:

```ts
export type OperationalRole = 'superadmin' | 'admin' | 'staff';

export const ROLE_PERMISSIONS: Record<OperationalRole, ReadonlySet<Permission>> = {
  superadmin: new Set(ALL_PERMISSIONS),
  admin: new Set([/* 9 permissions */]),
  staff:  new Set([/* 5 permissions */]),
};
```

This has three limitations that block the platform's stated direction:

1. **No runtime flexibility.** Adding a `manager` or `supervisor` role
   requires a TypeScript PR, a CHECK constraint migration, and a deploy.
   Demos and customer onboarding cannot wait for that cycle.

2. **No per-user exceptions.** A senior staff member who should have
   `audit:view` for compliance work must either be promoted to admin
   (over-grants 8 other permissions) or have a new role invented for them.

3. **No audit trail of role definitions.** Changes to `ROLE_PERMISSIONS`
   live in git history, not in the audit chain. A compliance officer cannot
   answer "who changed the manager role's permissions on Tuesday?" from the
   system itself.

The platform requires "fine-grained access control" with the ability to
build new roles without a deploy.

## Decision

Move role definitions to the database. Keep the permission enum in code.

### New tables

```sql
roles
  name            TEXT PK                  -- e.g. 'admin','manager'
  description     TEXT NOT NULL
  is_system       BOOLEAN NOT NULL DEFAULT false
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()

role_permissions
  role_name       TEXT FK REFERENCES roles(name) ON DELETE CASCADE
  permission_name TEXT NOT NULL            -- validated against Permission union in code
  PK (role_name, permission_name)

user_permissions                          -- additive grants only (see §Denials)
  user_id         UUID FK REFERENCES users(id) ON DELETE CASCADE
  permission_name TEXT NOT NULL
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  granted_by      UUID FK REFERENCES users(id)
  PK (user_id, permission_name)
```

### Why permissions stay in code

The `Permission` union (`src/lib/permissions.ts`) enumerates actual server
capabilities: `staff:manage`, `incident:transition`, etc. Each permission
corresponds to a real code path that must exist before the permission is
meaningful. Adding a permission requires a code deploy by definition.

Roles are different — they are **labels for permission bundles**. A new role
is just a different combination of existing permissions. That combination is
data, not code.

This asymmetry is intentional and correct.

### System roles (preseeded)

Four system roles ship as part of the migration seed
(`database/seed.ts`). `is_system = true` means they cannot be deleted (only
modified). The preseeded matrix:

| Permission | superadmin | admin | manager | staff |
|---|:-:|:-:|:-:|:-:|
| `audit:view` | ✓ | ✓ | — | — |
| `config:manage` | ✓ | — | — | — |
| `dispatch:create` | ✓ | ✓ | ✓ | — |
| `dispatch:read` | ✓ | ✓ | ✓ | ✓ |
| `dispatch:update` | ✓ | ✓ | ✓ | ✓ |
| `incident:create` | ✓ | ✓ | ✓ | ✓ |
| `incident:read` | ✓ | ✓ | ✓ | ✓ |
| `incident:transition` | ✓ | ✓ | — | — |
| `role:assign-admin` | ✓ | — | — | — |
| `staff:manage` | ✓ | ✓ | — | — |
| `staff:reassign` | ✓ | ✓ | ✓ | — |
| `surface:control-room` | ✓ | ✓ | ✓ | — |
| `surface:field-client` | ✓ | — | — | ✓ |
| `tenant:manage` | ✓ | — | — | — |
| `tenant:switch` | ✓ | — | — | — |

Superadmins get the full set by virtue of `users.global_role = 'superadmin'`
(ADR-0010), not via role_permissions rows.

### Custom roles

Superadmins can create custom roles via the UI (M9.5). Custom roles have
`is_system = false` and can be deleted if no user holds them.

### Permission resolution (server-side, at JWT mint time)

```
effective_permissions(user, tenant) =
  if user.global_role == 'superadmin':
    ALL_PERMISSIONS
  else:
    role_perms    = ⋃ { role_permissions(p) | r ∈ user.memberships[tenant].roles, p ∈ r.permissions }
    user_grants   = { p.permission_name | p ∈ user_permissions WHERE user_id = user.id }
    return role_perms ∪ user_grants
```

The resolved set is embedded in the JWT (`permissions[]` claim — see
ADR-0013). Server-side authorization checks become
`claims.permissions.includes(required_perm)`.

### Per-user grants: additive only, no denials

`user_permissions` is **additive**. There is no denial mechanism.

Rationale:
- Denial semantics (AWS IAM-style explicit-deny-wins) double the UI surface
  (3-state matrix per permission: inherit / grant / deny) and complicate
  audit (record mode alongside permission).
- The use case stated by the platform owner is "give a staff member an extra
  permission" — additive grants cover this directly.
- Removing a permission a user got via their role is achieved by editing the
  role, not by adding a per-user denial.

### Cascade mechanics when a role changes

When a superadmin removes a permission from a role, three things happen:

1. **Role-derived permissions change naturally.** The next JWT mint for any
   user with that role will not include the removed permission. Existing JWTs
   are stale (handled by ADR-0013's `perms_version` bump).

2. **Per-user grants are NOT auto-revoked.** A user with a direct grant of
   the removed permission keeps it. Direct grants are independent facts.

3. **The UI offers manual bulk-revoke.** When superadmin saves a role edit
   that removed permission P, the UI lists users who have direct grants of
   P (filtered to users who hold the edited role). Superadmin can
   multi-select and revoke in batches of 100 users per transaction. The bulk
   revoke endpoint is transactional per batch — partial failure rolls back
   the batch but completed batches persist.

Bulk-revoke is **never automatic**. Auto-revocation would silently change
user capabilities based on role-template edits — a security footgun.

### In-memory cache

Cold-start loads `roles` + `role_permissions` (~150 rows for the default
4-role, 15-permission system) into an in-memory `Map<RoleName,
Set<Permission>>`. The cache lives for the lifetime of the warm Netlify
Function instance. Cache invalidation: rebuild on cold-start; for warm
instances, an `X-Cache-Bust` header forces a refresh (superadmin debugging).

### Application-layer validation of role names

`tenant_memberships.roles` array elements cannot have a FK to `roles(name)`
(Postgres limitation on array-element FKs). The server validates each role
name exists in `roles` before writing a membership. Rejected inserts are
logged.

## Consequences

**Positive:**

- Adding a role is `INSERT INTO roles`, `INSERT INTO role_permissions` — no
  deploy.
- Per-user grants enable "this staff member can also view audit" without
  inventing a new role.
- Every role change is auditable via the existing `audit_ledger` chain
  (ADR-0005 / ADR-0009).
- The existing `usePermissions().can()` client hook works unchanged — it
  already consumes a permission array.

**Negative:**

- `OperationalRole` TypeScript union becomes "string" at the type level for
  role names stored in the DB. Type safety on role names is a runtime check.
  The `Permission` union stays strongly typed.
- ~3 extra queries at JWT mint time (roles → role_permissions →
  user_permissions). Mitigated by in-memory cache for the role map;
  user_permissions is one indexed query per mint.
- The hardcoded `ROLE_PERMISSIONS` map and its 9 unit tests are deleted and
  replaced with DB-seeded fixtures. Tests must seed their own role data.

**Tradeoff accepted:** runtime flexibility for a small per-mint-query cost
and weaker type safety on role names.

## Reference

- Depends on: ADR-0010 (identity split, `tenant_memberships.roles[]`)
- Required by: ADR-0012 (ABAC consumes the resolved permission set),
  ADR-0013 (staleness tracking)
- Schema: `database/schema.ts`
- Preseed: `database/seed.ts`
- Server resolver: `netlify/lib/rbac.ts`
