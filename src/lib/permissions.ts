/**
 * Declarative RBAC permission model.
 *
 * Maps each OperationalRole to a set of Permissions. The mapping is the
 * single source of truth for what the UI shows/hides — components call
 * `usePermissions().can('permission')` instead of checking `claims.role`
 * directly.
 *
 * The JWT carries only `role`; permissions are derived client-side for UI
 * rendering. The SERVER re-verifies the JWT and enforces authorization on
 * every request (ADR-0003) — these client-side checks are convenience, not
 * security.
 *
 * Reference: ARCHITECTURE.md §4 RBAC Rules Matrix.
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
	| 'tenant:manage' // create / suspend tenants
	// ── Staff ──
	| 'staff:manage' // manage staff roster (add / remove / import)
	// ── Audit ──
	| 'audit:view' // view compliance / forensic log
	// ── Surfaces ──
	| 'surface:control-room' // access control room dashboard
	| 'surface:field-client' // access field client
	// ── System ──
	| 'config:manage'; // change operational window / system config

import type { OperationalRole } from '@/types';

const ALL_PERMISSIONS: Permission[] = [
	'incident:create',
	'incident:transition',
	'incident:read',
	'dispatch:create',
	'dispatch:update',
	'dispatch:read',
	'tenant:switch',
	'tenant:manage',
	'staff:manage',
	'audit:view',
	'surface:control-room',
	'surface:field-client',
	'config:manage',
];

/** Role → permission set. This is the authoritative RBAC matrix. */
export const ROLE_PERMISSIONS: Record<OperationalRole, ReadonlySet<Permission>> = {
	superadmin: new Set(ALL_PERMISSIONS),

	admin: new Set<Permission>([
		'incident:create',
		'incident:transition',
		'incident:read',
		'dispatch:create',
		'dispatch:update',
		'dispatch:read',
		'staff:manage',
		'audit:view',
		'surface:control-room',
	]),

	staff: new Set<Permission>([
		'incident:create',
		'incident:read',
		'dispatch:update', // can ack/resolve own dispatches
		'dispatch:read', // can read own dispatches
		'surface:field-client',
	]),
};

/** Returns the permission set for a role (empty if unknown/null). */
export function permissionsForRole(role: OperationalRole | null | undefined): Set<Permission> {
	if (!role) return new Set();
	return ROLE_PERMISSIONS[role] ?? new Set();
}
