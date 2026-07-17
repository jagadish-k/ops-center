/**
 * Server-side RBAC resolver.
 *
 * Resolves a user's effective permissions at JWT mint time per ADR-0011
 * §Permission Resolution:
 *
 *   if user.global_role == 'superadmin':
 *     ALL_PERMISSIONS
 *   else:
 *     role_perms  = ⋃ role_permissions for each role in user's memberships
 *                   for the active tenant
 *     user_grants = user_permissions.permission_name for this user
 *     effective   = role_perms ∪ user_grants
 *
 * Caching: the role → permissions map is loaded once per warm function
 * instance and cached. Per-user grants are queried at each mint (one indexed
 * query). Effective permission sets are not cached — they're embedded in the
 * JWT and re-resolved only on refresh.
 */
import { db } from './db.ts';
import {
	usersTable,
	rolePermissionsTable,
	tenantMembershipsTable,
	userPermissionsTable,
	staffRosterTable,
} from '../../database/schema.ts';
import { eq, sql, and } from 'drizzle-orm';
import { ALL_PERMISSIONS, type Permission } from '../../src/lib/permissions.ts';

// ─── Role map cache ───────────────────────────────────────────────────────────

let roleMapCache: Map<string, Set<Permission>> | null = null;
let roleMapCacheAt = 0;
const ROLE_MAP_TTL_MS = 60_000; // 1 min — role definitions change rarely

async function loadRoleMap(): Promise<Map<string, Set<Permission>>> {
	if (roleMapCache && Date.now() - roleMapCacheAt < ROLE_MAP_TTL_MS) {
		return roleMapCache;
	}

	const rows = await db
		.select({
			roleName: rolePermissionsTable.roleName,
			permissionName: rolePermissionsTable.permissionName,
		})
		.from(rolePermissionsTable)
		.execute();

	const map = new Map<string, Set<Permission>>();
	for (const row of rows) {
		let set = map.get(row.roleName);
		if (!set) {
			set = new Set();
			map.set(row.roleName, set);
		}
		set.add(row.permissionName as Permission);
	}

	roleMapCache = map;
	roleMapCacheAt = Date.now();
	return map;
}

/**
 * Force-refresh the role map. Call after a role_permissions mutation
 * (admin editing role definitions) so the next mint reflects the change
 * immediately without waiting for TTL.
 */
export function invalidateRoleMapCache(): void {
	roleMapCache = null;
	roleMapCacheAt = 0;
}

// ─── Permission resolver ──────────────────────────────────────────────────────

export interface ResolvedUser {
	userId: string;
	globalRole: 'superadmin' | 'member';
	status: 'active' | 'disabled';
	permsVersion: number;
}

export interface ResolvedPermissions {
	user: ResolvedUser;
	permissions: Permission[];
}

/**
 * Resolve a user's effective permissions for a specific tenant context.
 *
 * @param userId      UUID from users.id
 * @param tenantId    Active tenant (from login or tenant:switch)
 * @returns           Resolved user info + permission set, or null if not found / disabled
 */
export async function resolveUserPermissions(
	userId: string,
	tenantId: string,
): Promise<ResolvedPermissions | null> {
	// 1. Load user row
	const userRows = await db
		.select({
			id: usersTable.id,
			globalRole: usersTable.globalRole,
			status: usersTable.status,
			permsVersion: usersTable.permsVersion,
		})
		.from(usersTable)
		.where(eq(usersTable.id, userId))
		.execute();

	if (userRows.length === 0) return null;
	const userRow = userRows[0]!;

	if (userRow.status === 'disabled') return null;

	const user: ResolvedUser = {
		userId: userRow.id,
		globalRole: userRow.globalRole as 'superadmin' | 'member',
		status: userRow.status as 'active' | 'disabled',
		permsVersion: userRow.permsVersion,
	};

	// 2. Superadmin fast path — gets every permission regardless of memberships.
	if (user.globalRole === 'superadmin') {
		return { user, permissions: [...ALL_PERMISSIONS] };
	}

	// 3. Member path: load roles for the active tenant + per-user grants.
	const roleMap = await loadRoleMap();

	const membershipRows = await db
		.select({
			tenantId: tenantMembershipsTable.tenantId,
			roles: tenantMembershipsTable.roles,
		})
		.from(tenantMembershipsTable)
		.where(
			and(
				eq(tenantMembershipsTable.userId, userId),
				eq(tenantMembershipsTable.tenantId, tenantId),
			),
		)
		.execute();

	const roles = membershipRows[0]?.roles ?? [];

	// 3a. Union role permissions
	const permissions = new Set<Permission>();
	for (const role of roles) {
		const rolePerms = roleMap.get(role);
		if (rolePerms) {
			for (const p of rolePerms) permissions.add(p);
		}
	}

	// 3b. Add per-user grants (additive only per ADR-0011 §Per-User Grants)
	const grantRows = await db
		.select({ permissionName: userPermissionsTable.permissionName })
		.from(userPermissionsTable)
		.where(eq(userPermissionsTable.userId, userId))
		.execute();

	for (const row of grantRows) {
		permissions.add(row.permissionName as Permission);
	}

	return { user, permissions: [...permissions] };
}

/**
 * Fetch a user's tenant-scoped roles + assigned zone for ABAC policy inputs.
 * Returns {roles, assignedZone} for the active tenant. Used by netlify/lib/policy.ts
 * to populate PolicySubject.
 */
export async function fetchSubjectContext(
	userId: string,
	tenantId: string,
): Promise<{ roles: string[]; assignedZone?: string }> {
	const membershipRows = await db
		.select({
			roles: tenantMembershipsTable.roles,
		})
		.from(tenantMembershipsTable)
		.where(
			and(
				eq(tenantMembershipsTable.userId, userId),
				eq(tenantMembershipsTable.tenantId, tenantId),
			),
		)
		.execute();

	const roles = membershipRows[0]?.roles ?? [];

	// Look up assigned_zone only if the user has a staff-like role on roster.
	const rosterRows = await db
		.select({ zone: staffRosterTable.assignedZone })
		.from(staffRosterTable)
		.where(
			and(
				eq(staffRosterTable.userId, userId),
				eq(staffRosterTable.tenantId, tenantId),
			),
		)
		.execute();

	return {
		roles,
		assignedZone: rosterRows[0]?.zone,
	};
}

// `and` re-exported for callers (Drizzle's logical-and combinator).
export { and };

// ─── Perms-version stamping (ADR-0013) ────────────────────────────────────────

/**
 * Bump perms_version for one user. Call after any change to that user's
 * effective permissions (grant added/removed, role changed, status changed).
 */
export async function bumpPermsVersion(userId: string): Promise<void> {
	await db
		.update(usersTable)
		.set({ permsVersion: sql`perms_version + 1`, updatedAt: new Date() })
		.where(eq(usersTable.id, userId))
		.execute();
}

/**
 * Bulk-bump perms_version for many users. Use after a role_permissions change
 * that affects the role they hold.
 *
 * Caps batch size at 100 users per call (ADR-0011 §Cascade Mechanics).
 * Split larger arrays into multiple calls.
 *
 * Implementation note: per-row UPDATE loop. Slow for very large batches but
 * correct under Drizzle's query builder. If this becomes hot, switch to a
 * parameterized `UPDATE ... WHERE id = ANY($1::uuid[])` via the pool.
 */
export async function bulkBumpPermsVersion(userIds: string[]): Promise<void> {
	if (userIds.length === 0) return;
	if (userIds.length > 100) {
		throw new Error(
			`bulkBumpPermsVersion: batch exceeds 100 users (got ${userIds.length}). Split the call.`,
		);
	}

	for (const id of userIds) {
		await db
			.update(usersTable)
			.set({ permsVersion: sql`perms_version + 1`, updatedAt: new Date() })
			.where(eq(usersTable.id, id))
			.execute();
	}
}
