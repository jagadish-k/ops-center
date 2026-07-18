/**
 * POST /api/admin/users
 *
 * Unified admin endpoint for staff CRUD, role assignment, and per-user
 * permission grants within a tenant. Action-based routing (same pattern as
 * mutations.ts) since Netlify Functions are one file per route.
 *
 * All operations are tenant-scoped to `claims.tenant_id` unless the caller is
 * a superadmin with an explicit cross-tenant target. See ADR-0010 / ADR-0011.
 *
 * Actions:
 *   { action: 'list' }
 *   { action: 'create', phone, fullName, specialty?, assignedZone?, roles? }
 *   { action: 'update', userId, fullName?, status? }
 *   { action: 'assign_role', userId, role }
 *   { action: 'revoke_role', userId, role }
 *   { action: 'grant_permission', userId, permission }      // superadmin only
 *   { action: 'revoke_permission', userId, permission }     // superadmin only
 *
 * Required permissions:
 *   - list, create, update, assign_role, revoke_role: `staff:manage`
 *   - grant_permission, revoke_permission: `role:assign-admin`
 */
import { type Config } from '@netlify/functions';
import { authorizeRequest, authResponse } from '../lib/auth.ts';
import {
	authorizeAdminOp,
	AdminHttpError,
	adminErrorResponse,
	auditAndBump,
	isValidE164,
	roleExists,
} from '../lib/admin-helpers.ts';
import { db } from '../lib/db.ts';
import {
	usersTable,
	tenantMembershipsTable,
	staffRosterTable,
	userPermissionsTable,
} from '../../database/schema.ts';
import { eq, and } from 'drizzle-orm';
import { jsonResponse, handlePreflight, badRequest, serverError } from '../lib/http.ts';
import type { Permission } from '../../src/types';

// ─── Action handlers ──────────────────────────────────────────────────────────

async function listUsers(claims: JwtClaims, targetTenantId?: string) {
	const { tenantId } = authorizeAdminOp(claims, 'staff:manage', targetTenantId);

	// List users that have a membership in this tenant.
	const rows = await db
		.select({
			userId: usersTable.id,
			phone: usersTable.phone,
			fullName: usersTable.fullName,
			globalRole: usersTable.globalRole,
			status: usersTable.status,
			permsVersion: usersTable.permsVersion,
			roles: tenantMembershipsTable.roles,
		})
		.from(usersTable)
		.innerJoin(
			tenantMembershipsTable,
			and(
				eq(tenantMembershipsTable.userId, usersTable.id),
				eq(tenantMembershipsTable.tenantId, tenantId),
			),
		)
		.execute();

	return jsonResponse({ users: rows });
}

interface CreateBody {
	phone: string;
	fullName: string;
	specialty?: string;
	assignedZone?: string;
	roles?: string[];
}

async function createUser(claims: JwtClaims, body: CreateBody, targetTenantId?: string) {
	const { tenantId } = authorizeAdminOp(claims, 'staff:manage', targetTenantId);

	if (!body.phone || !body.fullName) {
		throw new AdminHttpError(400, 'bad_request', 'phone and fullName are required.');
	}
	if (!isValidE164(body.phone)) {
		throw new AdminHttpError(400, 'bad_request', 'phone must be E.164 (+digits, 6-15).');
	}

	const roles = body.roles ?? ['staff'];
	for (const r of roles) {
		if (!(await roleExists(r))) {
			throw new AdminHttpError(400, 'bad_request', `Unknown role: ${r}`);
		}
	}

	// 1. Upsert user (idempotent on phone).
	const userRows = await db
		.insert(usersTable)
		.values({
			phone: body.phone,
			fullName: body.fullName,
			globalRole: 'member',
			authProvider: 'phone_otp',
		})
		.onConflictDoUpdate({
			target: usersTable.phone,
			set: { fullName: body.fullName, status: 'active' },
		})
		.returning({ id: usersTable.id })
		.execute();
	const userId = userRows[0]!.id;

	// 2. Create membership.
	await db
		.insert(tenantMembershipsTable)
		.values({ userId, tenantId, roles })
		.onConflictDoUpdate({
			target: [tenantMembershipsTable.userId, tenantMembershipsTable.tenantId],
			set: { roles, updatedAt: new Date() },
		})
		.execute();

	// 3. If 'staff' role present, create roster row.
	if (roles.includes('staff')) {
		await db
			.insert(staffRosterTable)
			.values({
				userId,
				tenantId,
				specialty: (body.specialty ?? 'security') as never,
				assignedZone: body.assignedZone ?? 'ZONE-A',
				phoneNumber: body.phone,
			})
			.onConflictDoUpdate({
				target: [staffRosterTable.userId, staffRosterTable.tenantId],
				set: {
					specialty: (body.specialty ?? 'security') as never,
					assignedZone: body.assignedZone ?? 'ZONE-A',
					phoneNumber: body.phone,
				},
			})
			.execute();
	}

	await auditAndBump({
		claims,
		tenantId,
		action: 'USER_CREATE',
		targetResourceId: userId,
		stateDelta: { before: null, after: { phone: body.phone, fullName: body.fullName, roles } },
		userIds: [userId],
	});

	return jsonResponse({ userId, phone: body.phone, roles });
}

interface UpdateBody {
	userId: string;
	fullName?: string;
	status?: 'active' | 'disabled';
}

async function updateUser(claims: JwtClaims, body: UpdateBody, targetTenantId?: string) {
	const { tenantId } = authorizeAdminOp(claims, 'staff:manage', targetTenantId);

	if (!body.userId) {
		throw new AdminHttpError(400, 'bad_request', 'userId is required.');
	}

	// Verify membership in this tenant (defense in depth).
	const membership = await db
		.select({ userId: tenantMembershipsTable.userId })
		.from(tenantMembershipsTable)
		.where(
			and(
				eq(tenantMembershipsTable.userId, body.userId),
				eq(tenantMembershipsTable.tenantId, tenantId),
			),
		)
		.execute();
	if (membership.length === 0) {
		throw new AdminHttpError(404, 'not_found', 'User not found in this tenant.');
	}

	const beforeRows = await db
		.select({ fullName: usersTable.fullName, status: usersTable.status })
		.from(usersTable)
		.where(eq(usersTable.id, body.userId))
		.execute();
	const before = beforeRows[0] ?? null;

	const updates: Record<string, unknown> = {};
	if (body.fullName !== undefined) updates.fullName = body.fullName;
	if (body.status !== undefined) updates.status = body.status;

	if (Object.keys(updates).length === 0) {
		throw new AdminHttpError(400, 'bad_request', 'Nothing to update.');
	}

	await db
		.update(usersTable)
		.set({ ...updates, updatedAt: new Date() })
		.where(eq(usersTable.id, body.userId))
		.execute();

	await auditAndBump({
		claims,
		tenantId,
		action: 'USER_UPDATE',
		targetResourceId: body.userId,
		stateDelta: { before, after: updates },
		userIds: body.status ? [body.userId] : [],
	});

	return jsonResponse({ userId: body.userId, updated: updates });
}

interface AssignRoleBody {
	userId: string;
	role: string;
}

async function assignRole(claims: JwtClaims, body: AssignRoleBody, targetTenantId?: string) {
	const { tenantId } = authorizeAdminOp(claims, 'staff:manage', targetTenantId);

	if (!body.userId || !body.role) {
		throw new AdminHttpError(400, 'bad_request', 'userId and role are required.');
	}
	if (!(await roleExists(body.role))) {
		throw new AdminHttpError(400, 'bad_request', `Unknown role: ${body.role}`);
	}

	// Admins can only assign staff/manager roles. admin promotion requires superadmin.
	if (body.role === 'admin' && claims.global_role !== 'superadmin') {
		throw new AdminHttpError(403, 'forbidden', 'Only superadmins can assign the admin role.');
	}

	const existing = await db
		.select({ roles: tenantMembershipsTable.roles })
		.from(tenantMembershipsTable)
		.where(
			and(
				eq(tenantMembershipsTable.userId, body.userId),
				eq(tenantMembershipsTable.tenantId, tenantId),
			),
		)
		.execute();

	if (existing.length === 0) {
		throw new AdminHttpError(404, 'not_found', 'User has no membership in this tenant.');
	}

	const currentRoles = existing[0]!.roles ?? [];
	if (currentRoles.includes(body.role)) {
		return jsonResponse({ userId: body.userId, roles: currentRoles, unchanged: true });
	}

	const newRoles = [...currentRoles, body.role];
	await db
		.update(tenantMembershipsTable)
		.set({ roles: newRoles, updatedAt: new Date() })
		.where(
			and(
				eq(tenantMembershipsTable.userId, body.userId),
				eq(tenantMembershipsTable.tenantId, tenantId),
			),
		)
		.execute();

	await auditAndBump({
		claims,
		tenantId,
		action: 'USER_ROLE_ASSIGN',
		targetResourceId: body.userId,
		stateDelta: { before: { roles: currentRoles }, after: { roles: newRoles } },
		userIds: [body.userId],
	});

	return jsonResponse({ userId: body.userId, roles: newRoles });
}

async function revokeRole(claims: JwtClaims, body: AssignRoleBody, targetTenantId?: string) {
	const { tenantId } = authorizeAdminOp(claims, 'staff:manage', targetTenantId);

	if (!body.userId || !body.role) {
		throw new AdminHttpError(400, 'bad_request', 'userId and role are required.');
	}

	// Demotion from admin requires superadmin.
	if (body.role === 'admin' && claims.global_role !== 'superadmin') {
		throw new AdminHttpError(403, 'forbidden', 'Only superadmins can revoke the admin role.');
	}

	const existing = await db
		.select({ roles: tenantMembershipsTable.roles })
		.from(tenantMembershipsTable)
		.where(
			and(
				eq(tenantMembershipsTable.userId, body.userId),
				eq(tenantMembershipsTable.tenantId, tenantId),
			),
		)
		.execute();

	if (existing.length === 0) {
		throw new AdminHttpError(404, 'not_found', 'User has no membership in this tenant.');
	}

	const currentRoles = existing[0]!.roles ?? [];
	if (!currentRoles.includes(body.role)) {
		return jsonResponse({ userId: body.userId, roles: currentRoles, unchanged: true });
	}

	const newRoles = currentRoles.filter((r) => r !== body.role);
	await db
		.update(tenantMembershipsTable)
		.set({ roles: newRoles, updatedAt: new Date() })
		.where(
			and(
				eq(tenantMembershipsTable.userId, body.userId),
				eq(tenantMembershipsTable.tenantId, tenantId),
			),
		)
		.execute();

	await auditAndBump({
		claims,
		tenantId,
		action: 'USER_ROLE_REVOKE',
		targetResourceId: body.userId,
		stateDelta: { before: { roles: currentRoles }, after: { roles: newRoles } },
		userIds: [body.userId],
	});

	return jsonResponse({ userId: body.userId, roles: newRoles });
}

interface GrantBody {
	userId: string;
	permission: Permission;
}

async function grantPermission(claims: JwtClaims, body: GrantBody, targetTenantId?: string) {
	const { tenantId } = authorizeAdminOp(claims, 'role:assign-admin', targetTenantId);

	if (!body.userId || !body.permission) {
		throw new AdminHttpError(400, 'bad_request', 'userId and permission are required.');
	}

	await db
		.insert(userPermissionsTable)
		.values({
			userId: body.userId,
			permissionName: body.permission,
			grantedBy: claims.sub,
		})
		.onConflictDoNothing()
		.execute();

	await auditAndBump({
		claims,
		tenantId,
		action: 'USER_PERMISSION_GRANT',
		targetResourceId: body.userId,
		stateDelta: { before: null, after: { permission: body.permission } },
		userIds: [body.userId],
	});

	return jsonResponse({ userId: body.userId, permission: body.permission, granted: true });
}

async function revokePermission(claims: JwtClaims, body: GrantBody, targetTenantId?: string) {
	const { tenantId } = authorizeAdminOp(claims, 'role:assign-admin', targetTenantId);

	if (!body.userId || !body.permission) {
		throw new AdminHttpError(400, 'bad_request', 'userId and permission are required.');
	}

	await db
		.delete(userPermissionsTable)
		.where(
			and(
				eq(userPermissionsTable.userId, body.userId),
				eq(userPermissionsTable.permissionName, body.permission),
			),
		)
		.execute();

	await auditAndBump({
		claims,
		tenantId,
		action: 'USER_PERMISSION_REVOKE',
		targetResourceId: body.userId,
		stateDelta: { before: { permission: body.permission }, after: null },
		userIds: [body.userId],
	});

	return jsonResponse({ userId: body.userId, permission: body.permission, granted: false });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async (request: Request): Promise<Response> => {
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	// Authenticate + staleness check. Permission is enforced per-action below.
	const auth = await authorizeRequest(request);
	const notOk = authResponse(auth);
	if (notOk) return notOk;
	const claims = auth.claims;

	try {
		const body = (await request.json()) as {
			action: string;
			targetTenantId?: string;
			// Action-specific fields:
			phone?: string;
			fullName?: string;
			specialty?: string;
			assignedZone?: string;
			roles?: string[];
			userId?: string;
			role?: string;
			permission?: Permission;
			status?: 'active' | 'disabled';
		};

		const targetTenantId = body.targetTenantId;

		switch (body.action) {
			case 'list':
				return await listUsers(claims, targetTenantId);
			case 'create':
				return await createUser(claims, {
					phone: body.phone ?? '',
					fullName: body.fullName ?? '',
					specialty: body.specialty,
					assignedZone: body.assignedZone,
					roles: body.roles,
				}, targetTenantId);
			case 'update':
				return await updateUser(claims, {
					userId: body.userId ?? '',
					fullName: body.fullName,
					status: body.status,
				}, targetTenantId);
			case 'assign_role':
				return await assignRole(claims, {
					userId: body.userId ?? '',
					role: body.role ?? '',
				}, targetTenantId);
			case 'revoke_role':
				return await revokeRole(claims, {
					userId: body.userId ?? '',
					role: body.role ?? '',
				}, targetTenantId);
			case 'grant_permission':
				return await grantPermission(claims, {
					userId: body.userId ?? '',
					permission: body.permission ?? ('' as Permission),
				}, targetTenantId);
			case 'revoke_permission':
				return await revokePermission(claims, {
					userId: body.userId ?? '',
					permission: body.permission ?? ('' as Permission),
				}, targetTenantId);
			default:
				return badRequest(`Unknown action: ${body.action}`);
		}
	} catch (err) {
		if (err instanceof AdminHttpError) {
			return adminErrorResponse(err);
		}
		console.error('admin-users error:', err);
		return serverError('Admin operation failed.');
	}
};

export const config: Config = {
	path: '/api/admin/users',
};
