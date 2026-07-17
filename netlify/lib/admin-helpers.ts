/**
 * Shared helpers for admin endpoints.
 *
 * Provides tenant-scoped authorization, audit logging wrappers, and common
 * response shapes used by every `/api/admin/*` function.
 *
 * Conventions (ADR-0010 / ADR-0011):
 *   - Every admin operation is scoped to `claims.tenant_id` unless the caller
 *     is a superadmin exercising an explicit cross-tenant capability.
 *   - Every state-changing operation produces an `audit_ledger` entry.
 *   - Every state-changing operation that affects a user's permissions must
 *     bump `users.perms_version` (ADR-0013).
 */
import { db } from './db.ts';
import { usersTable } from '../../database/schema.ts';
import { eq, sql } from 'drizzle-orm';
import { commitAuditLog, type AuditActor } from './auditLogger.ts';
import { bumpPermsVersion } from './rbac.ts';
import type { JwtClaims, Permission } from '../../src/types';

/** Build an AuditActor from JWT claims (post-ADR-0013 shape). */
export function actorFromClaims(claims: JwtClaims, phone?: string): AuditActor {
	return {
		uid: claims.sub,
		role: claims.global_role,
		phoneOrEmail: phone ?? claims.phone ?? claims.sub,
	};
}

/** Fetch the caller's phone (for audit-log readability). */
export async function fetchUserPhone(userId: string): Promise<string | undefined> {
	const rows = await db
		.select({ phone: usersTable.phone })
		.from(usersTable)
		.where(eq(usersTable.id, userId))
		.execute();
	return rows[0]?.phone ?? undefined;
}

export interface AdminOpContext {
	claims: JwtClaims;
	/** Required permission for the calling endpoint. */
	requiredPermission: Permission;
	/** Tenant the operation targets (defaults to the caller's active tenant). */
	targetTenantId?: string;
}

export interface AdminAuthResult {
	ok: true;
	claims: JwtClaims;
	tenantId: string;
	actor: AuditActor;
}

/**
 * Authorize an admin operation: permission check + tenant scoping.
 *
 * Returns the resolved target tenant (either the caller's active tenant or
 * the explicitly-requested one for superadmins).
 */
export function authorizeAdminOp(
	claims: JwtClaims,
	requiredPermission: Permission,
	requestedTenantId?: string,
): AdminAuthResult {
	const hasPerm = claims.permissions.includes(requiredPermission);
	if (!hasPerm) {
		throw new AdminHttpError(403, 'forbidden', `Missing permission: ${requiredPermission}`);
	}

	// Superadmins can target any tenant. Members can only target their own.
	const isCrossTenant = requestedTenantId && requestedTenantId !== claims.tenant_id;
	if (isCrossTenant && claims.global_role !== 'superadmin') {
		throw new AdminHttpError(403, 'forbidden', 'Cannot operate on a different tenant.');
	}

	const tenantId = requestedTenantId ?? claims.tenant_id;
	const actor = actorFromClaims(claims);

	return { ok: true, claims, tenantId, actor };
}

/** Custom error that carries an HTTP status + reason. */
export class AdminHttpError extends Error {
	constructor(
		public readonly status: number,
		public readonly reason: string,
		message: string,
	) {
		super(message);
	}
}

/** Convert an AdminHttpError (or any error) to a JSON Response. */
export function adminErrorResponse(err: unknown): Response {
	if (err instanceof AdminHttpError) {
		return new Response(
			JSON.stringify({ error: err.message }),
			{
				status: err.status,
				headers: {
					'Content-Type': 'application/json',
					'X-Reason': err.reason,
				},
			},
		);
	}
	console.error('admin op error:', err);
	return new Response(
		JSON.stringify({ error: 'Internal server error.' }),
		{ status: 500, headers: { 'Content-Type': 'application/json' } },
	);
}

export interface AuditWriteParams {
	claims: JwtClaims;
	tenantId: string;
	action: string;
	targetResourceId: string;
	stateDelta: { before: unknown | null; after: unknown | null };
}

/**
 * Convenience wrapper: commit an audit entry + nothing else. Use after the
 * primary mutation has succeeded. Errors here are logged but non-fatal (the
 * mutation has already applied).
 */
export async function auditWrite(params: AuditWriteParams): Promise<void> {
	try {
		const phone = await fetchUserPhone(params.claims.sub);
		await commitAuditLog({
			tenantId: params.tenantId,
			actor: actorFromClaims(params.claims, phone),
			action: params.action,
			targetResourceId: params.targetResourceId,
			stateDelta: params.stateDelta,
		});
	} catch (err) {
		console.error('auditWrite failed (non-fatal):', err);
	}
}

/**
 * Audit + bump-perms-version in one call. Use after any state change that
 * affects a user's effective permissions (role assignment, grant, status).
 */
export async function auditAndBump(
	params: AuditWriteParams & { userIds: string[] },
): Promise<void> {
	await auditWrite(params);
	for (const userId of params.userIds) {
		try {
			await bumpPermsVersion(userId);
		} catch (err) {
			console.error(`bumpPermsVersion(${userId}) failed:`, err);
		}
	}
}

/**
 * Validate a phone number in E.164 format (loose: + followed by 6-15 digits).
 * Used by user-create endpoints before DB write.
 */
export function isValidE164(phone: string): boolean {
	return /^\+\d{6,15}$/.test(phone);
}

/**
 * Validate that a role name exists in the roles table. Used before assigning
 * or revoking a role membership. (App-layer validation per ADR-0011, since
 * tenant_memberships.roles array elements have no array-element FK.)
 */
export async function roleExists(roleName: string): Promise<boolean> {
	const { rolesTable } = await import('../../database/schema.ts');
	const rows = await db
		.select({ name: rolesTable.name })
		.from(rolesTable)
		.where(eq(rolesTable.name, roleName))
		.limit(1)
		.execute();
	return rows.length > 0;
}

// `sql` import kept for callers that need it via this module; suppress warning.
void sql;
