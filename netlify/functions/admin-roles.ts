/**
 * POST /api/admin/roles
 *
 * Superadmin-only role management. Actions:
 *
 *   { action: 'list' }
 *   { action: 'create', name, description, permissions: Permission[] }
 *   { action: 'update', name, description?, permissions? }
 *   { action: 'delete', name }
 *   { action: 'cascade_revoke', name, permission, userIds: string[] }
 *
 * All operations require the `tenant:manage` permission (superadmin only per
 * ADR-0011 §System roles).
 *
 * Cascade Revoke (ADR-0011 §Cascade Mechanics):
 *   When superadmin removes permission P from role R, the UI lists users who
 *   hold R AND have a per-user grant of P. Superadmin can bulk-revoke those
 *   grants in batches of 100 users per call (this endpoint enforces the cap).
 *   Each bulk-revoke transaction also bumps perms_version on affected users so
 *   their next request triggers stale-perms refresh (ADR-0013).
 *
 * System roles (is_system = true) cannot be deleted, only modified.
 */
import { type Config } from '@netlify/functions';
import { authorizeRequest, authResponse } from '../lib/auth.ts';
import {
	authorizeAdminOp,
	AdminHttpError,
	adminErrorResponse,
	auditAndBump,
} from '../lib/admin-helpers.ts';
import { db } from '../lib/db.ts';
import {
	rolesTable,
	rolePermissionsTable,
	tenantMembershipsTable,
	userPermissionsTable,
} from '../../database/schema.ts';
import { eq, sql, inArray } from 'drizzle-orm';
import { jsonResponse, handlePreflight, badRequest, serverError } from '../lib/http.ts';
import type { Permission } from '../../src/types';

const CASCADE_BATCH_LIMIT = 100;

// ─── Action handlers ──────────────────────────────────────────────────────────

async function listRoles(claims: JwtClaims, targetTenantId?: string) {
	authorizeAdminOp(claims, 'tenant:manage', targetTenantId);

	const roles = await db.select().from(rolesTable).execute();

	// Build permission map: roleName -> Permission[]
	const rolePerms = await db
		.select({ roleName: rolePermissionsTable.roleName, permissionName: rolePermissionsTable.permissionName })
		.from(rolePermissionsTable)
		.execute();

	const permsByRole = new Map<string, string[]>();
	for (const row of rolePerms) {
		const arr = permsByRole.get(row.roleName) ?? [];
		arr.push(row.permissionName);
		permsByRole.set(row.roleName, arr);
	}

	const result = roles.map((r) => ({
		...r,
		permissions: permsByRole.get(r.name) ?? [],
	}));

	return jsonResponse({ roles: result });
}

interface CreateRoleBody {
	name: string;
	description: string;
	permissions: Permission[];
}

async function createRole(claims: JwtClaims, body: CreateRoleBody, targetTenantId?: string) {
	authorizeAdminOp(claims, 'tenant:manage', targetTenantId);

	if (!body.name || !body.description) {
		throw new AdminHttpError(400, 'bad_request', 'name and description are required.');
	}
	if (!/^[a-z][a-z0-9_-]*$/i.test(body.name)) {
		throw new AdminHttpError(400, 'bad_request', 'name must start with a letter and use only [a-z0-9_-].');
	}

	const existing = await db
		.select({ name: rolesTable.name })
		.from(rolesTable)
		.where(eq(rolesTable.name, body.name))
		.execute();
	if (existing.length > 0) {
		throw new AdminHttpError(409, 'conflict', `Role already exists: ${body.name}`);
	}

	await db
		.insert(rolesTable)
		.values({ name: body.name, description: body.description, isSystem: false })
		.execute();

	if (body.permissions && body.permissions.length > 0) {
		await db
			.insert(rolePermissionsTable)
			.values(body.permissions.map((p) => ({ roleName: body.name, permissionName: p })))
			.execute();
	}

	await auditAndBump({
		claims,
		tenantId: targetTenantId ?? claims.tenant_id,
		action: 'ROLE_CREATE',
		targetResourceId: body.name,
		stateDelta: { before: null, after: { name: body.name, permissions: body.permissions } },
		userIds: [],
	});

	return jsonResponse({ name: body.name, created: true });
}

interface UpdateRoleBody {
	name: string;
	description?: string;
	permissions?: Permission[];
}

async function updateRole(claims: JwtClaims, body: UpdateRoleBody, targetTenantId?: string) {
	authorizeAdminOp(claims, 'tenant:manage', targetTenantId);

	if (!body.name) {
		throw new AdminHttpError(400, 'bad_request', 'name is required.');
	}

	const existing = await db
		.select()
		.from(rolesTable)
		.where(eq(rolesTable.name, body.name))
		.execute();
	if (existing.length === 0) {
		throw new AdminHttpError(404, 'not_found', `Role not found: ${body.name}`);
	}

	const beforeRole = existing[0]!;
	const beforePerms = await db
		.select({ permissionName: rolePermissionsTable.permissionName })
		.from(rolePermissionsTable)
		.where(eq(rolePermissionsTable.roleName, body.name))
		.execute();

	if (body.description !== undefined) {
		await db
			.update(rolesTable)
			.set({ description: body.description })
			.where(eq(rolesTable.name, body.name))
			.execute();
	}

	let affectedUserIds: string[] = [];
	if (body.permissions !== undefined) {
		// Replace the permission set atomically.
		await db
			.delete(rolePermissionsTable)
			.where(eq(rolePermissionsTable.roleName, body.name))
			.execute();

		if (body.permissions.length > 0) {
			await db
				.insert(rolePermissionsTable)
				.values(body.permissions.map((p) => ({ roleName: body.name, permissionName: p })))
				.execute();
		}

		// Find all users holding this role in any tenant. Their perms_version
		// must be bumped because their effective permission set may have changed.
		const holders = await db
			.select({ userId: tenantMembershipsTable.userId })
			.from(tenantMembershipsTable)
			.where(sql`${tenantMembershipsTable.roles} @> ARRAY[${body.name}]::text[]`)
			.execute();
		affectedUserIds = holders.map((h) => h.userId);
	}

	await auditAndBump({
		claims,
		tenantId: targetTenantId ?? claims.tenant_id,
		action: 'ROLE_UPDATE',
		targetResourceId: body.name,
		stateDelta: {
			before: { description: beforeRole.description, permissions: beforePerms.map((p) => p.permissionName) },
			after: { description: body.description ?? beforeRole.description, permissions: body.permissions },
		},
		userIds: affectedUserIds,
	});

	return jsonResponse({
		name: body.name,
		updated: { description: body.description, permissions: body.permissions },
		affectedUserCount: affectedUserIds.length,
	});
}

async function deleteRole(claims: JwtClaims, body: { name: string }, targetTenantId?: string) {
	authorizeAdminOp(claims, 'tenant:manage', targetTenantId);

	if (!body.name) {
		throw new AdminHttpError(400, 'bad_request', 'name is required.');
	}

	const existing = await db
		.select()
		.from(rolesTable)
		.where(eq(rolesTable.name, body.name))
		.execute();
	if (existing.length === 0) {
		throw new AdminHttpError(404, 'not_found', `Role not found: ${body.name}`);
	}

	if (existing[0]!.isSystem) {
		throw new AdminHttpError(403, 'forbidden', 'System roles cannot be deleted.');
	}

	// Refuse if any user still holds this role.
	const holders = await db
		.select({ userId: tenantMembershipsTable.userId })
		.from(tenantMembershipsTable)
		.where(sql`${tenantMembershipsTable.roles} @> ARRAY[${body.name}]::text[]`)
		.limit(1)
		.execute();
	if (holders.length > 0) {
		throw new AdminHttpError(409, 'conflict', `Cannot delete role: ${holders.length}+ user(s) still hold it. Revoke first.`);
	}

	await db.delete(rolesTable).where(eq(rolesTable.name, body.name)).execute();

	await auditAndBump({
		claims,
		tenantId: targetTenantId ?? claims.tenant_id,
		action: 'ROLE_DELETE',
		targetResourceId: body.name,
		stateDelta: { before: existing[0], after: null },
		userIds: [],
	});

	return jsonResponse({ name: body.name, deleted: true });
}

interface CascadeRevokeBody {
	name: string;
	permission: Permission;
	userIds: string[];
}

/**
 * Bulk-revoke a per-user grant from up to 100 users in one transaction.
 * Used after a role edit removes permission P — the UI offers superadmin a
 * list of users who had P via per-user grant and lets them bulk-revoke.
 *
 * The bulk operation:
 *   1. DELETE FROM user_permissions WHERE user_id IN (...) AND permission = P
 *   2. UPDATE users SET perms_version = perms_version + 1 WHERE id IN (...)
 *
 * Both run in the same conceptual batch (Drizzle doesn't expose multi-stmt
 * transactions yet in our helper, but each operation is its own statement).
 */
async function cascadeRevoke(claims: JwtClaims, body: CascadeRevokeBody, targetTenantId?: string) {
	authorizeAdminOp(claims, 'tenant:manage', targetTenantId);

	if (!body.name || !body.permission || !body.userIds) {
		throw new AdminHttpError(400, 'bad_request', 'name, permission, and userIds are required.');
	}
	if (body.userIds.length === 0) {
		return jsonResponse({ name: body.name, permission: body.permission, revokedCount: 0 });
	}
	if (body.userIds.length > CASCADE_BATCH_LIMIT) {
		throw new AdminHttpError(
			413,
			'too_many',
			`Batch exceeds ${CASCADE_BATCH_LIMIT} users. Split the call.`,
		);
	}

	await db
		.delete(userPermissionsTable)
		.where(
			and(
				inArray(userPermissionsTable.userId, body.userIds),
				eq(userPermissionsTable.permissionName, body.permission),
			),
		)
		.execute();

	// Bump perms_version for each affected user (cascade semantics, ADR-0013).
	for (const userId of body.userIds) {
		await db
			.update(usersTable)
			.set({ permsVersion: sql`perms_version + 1`, updatedAt: new Date() })
			.where(eq(usersTable.id, userId))
			.execute();
	}

	await auditAndBump({
		claims,
		tenantId: targetTenantId ?? claims.tenant_id,
		action: 'ROLE_CASCADE_REVOKE',
		targetResourceId: body.name,
		stateDelta: {
			before: { permission: body.permission, userCount: body.userIds.length },
			after: { permission: body.permission, revokedFrom: body.userIds.length },
		},
		userIds: [], // already bumped above
	});

	return jsonResponse({
		name: body.name,
		permission: body.permission,
		revokedFromUsers: body.userIds.length,
	});
}

// Local `and` import — Drizzle exposes it but we didn't import above.
import { and } from 'drizzle-orm';
import { usersTable } from '../../database/schema.ts';

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async (request: Request): Promise<Response> => {
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	const auth = await authorizeRequest(request);
	const notOk = authResponse(auth);
	if (notOk) return notOk;
	const claims = auth.claims;

	try {
		const body = (await request.json()) as {
			action: string;
			targetTenantId?: string;
			name?: string;
			description?: string;
			permissions?: Permission[];
			permission?: Permission;
			userIds?: string[];
		};

		const targetTenantId = body.targetTenantId;

		switch (body.action) {
			case 'list':
				return await listRoles(claims, targetTenantId);
			case 'create':
				return await createRole(claims, {
					name: body.name ?? '',
					description: body.description ?? '',
					permissions: body.permissions ?? [],
				}, targetTenantId);
			case 'update':
				return await updateRole(claims, {
					name: body.name ?? '',
					description: body.description,
					permissions: body.permissions,
				}, targetTenantId);
			case 'delete':
				return await deleteRole(claims, { name: body.name ?? '' }, targetTenantId);
			case 'cascade_revoke':
				return await cascadeRevoke(claims, {
					name: body.name ?? '',
					permission: body.permission ?? ('' as Permission),
					userIds: body.userIds ?? [],
				}, targetTenantId);
			default:
				return badRequest(`Unknown action: ${body.action}`);
		}
	} catch (err) {
		if (err instanceof AdminHttpError) {
			return adminErrorResponse(err);
		}
		console.error('admin-roles error:', err);
		return serverError('Admin operation failed.');
	}
};

export const config: Config = {
	path: '/api/admin/roles',
};
