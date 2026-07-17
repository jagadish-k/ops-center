/**
 * Permission catalog — the closed set of typed server capabilities.
 *
 * Post-ADR-0011: the role → permission mapping is **database-driven** (table
 * `role_permissions`), not hardcoded here. The `Permission` union stays in
 * code because each value corresponds to a real server code path; adding a
 * new permission requires a deploy by definition. Adding a new *role* is a
 * pure DB insert.
 *
 * The system-role × permission matrix is preseeded by `database/seed.ts`
 * (see `ROLE_MATRIX` there) and visualized in ADR-0011 §System roles. The
 * authoritative source for "what does role X have?" is the DB, not this file.
 *
 * Client-side usage: the JWT carries `permissions[]` (the resolved union of
 * role-derived perms + per-user grants per ADR-0011 §Permission Resolution).
 * Use `usePermissions().can(perm)` for UI gating — never check role names.
 *
 * Server-side usage: re-verify the JWT and check `claims.permissions.includes(perm)`
 * for flat booleans, or call `policy.decide(...)` (ADR-0012) for the 5
 * attribute-aware ABAC policies.
 */

export type Permission =
	// ── Incidents ──
	| 'incident:create' // file new incidents (voice / manual triage)
	| 'incident:transition' // change incident status (acknowledge / resolve)
	| 'incident:read' // view incident queue + details
	// ── Dispatches ──
	| 'dispatch:create' // push dispatch directives to staff
	| 'dispatch:update' // update dispatch status (ack / on-scene / resolve)
	| 'dispatch:read' // view dispatch directives
	// ── Tenancy ──
	| 'tenant:switch' // switch active tenant context (superadmin only)
	| 'tenant:manage' // create / suspend tenants + manage roles
	// ── Staff ──
	| 'staff:manage' // manage staff roster (add / remove / import)
	| 'staff:reassign' // change zone/dispatch assignments (manager+)
	// ── Roles ──
	| 'role:assign-admin' // promote/demote admins (superadmin only)
	// ── Audit ──
	| 'audit:view' // view compliance / forensic log
	// ── Surfaces ──
	| 'surface:control-room' // access control room dashboard
	| 'surface:field-client' // access field client
	// ── System ──
	| 'config:manage'; // change operational window / system config

/** The full set, useful for migrations and for superadmin wildcard grants. */
export const ALL_PERMISSIONS: readonly Permission[] = [
	'incident:create',
	'incident:transition',
	'incident:read',
	'dispatch:create',
	'dispatch:update',
	'dispatch:read',
	'tenant:switch',
	'tenant:manage',
	'staff:manage',
	'staff:reassign',
	'role:assign-admin',
	'audit:view',
	'surface:control-room',
	'surface:field-client',
	'config:manage',
] as const;

/**
 * The 5 ABAC-scoped permissions (ADR-0012 §v1 scope). These permissions are
 * evaluated via `policy.decide(action, subject, resource)` — the flat
 * `claims.permissions.includes(...)` check is necessary but not sufficient.
 *
 * The other 10 permissions are flat booleans: presence in `claims.permissions`
 * is sufficient.
 */
export const ABAC_SCOPED_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
	'incident:transition', // tier-gated (manager: 4-5; admin: any)
	'incident:read', // tenant-gated (already enforced via claims.tenant_id)
	'dispatch:create', // zone-gated for managers
	'dispatch:update', // self-or-admin (or target staff)
	'staff:reassign', // zone-gated for managers
]);

/**
 * Default-resolver for client-side `usePermissions()`. Accepts the JWT
 * `permissions[]` claim directly. The server resolves from the DB at mint
 * time (ADR-0011 §Permission Resolution); the client trusts the JWT.
 */
export function permissionsForClaim(
	permissions: Permission[] | readonly Permission[] | null | undefined,
): Set<Permission> {
	if (!permissions) return new Set();
	return new Set(permissions);
}
