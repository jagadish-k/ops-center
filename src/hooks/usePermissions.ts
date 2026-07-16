/**
 * usePermissions — RBAC hook for role-based UI checks.
 *
 * Reads the JWT claims from AuthContext and derives a typed permission set
 * using the declarative model in lib/permissions.ts. Components use this
 * instead of checking `claims.role` directly.
 *
 * Usage:
 *   const { can, isAdmin, isSuperadmin } = usePermissions();
 *   {can('tenant:switch') && <TenantSwitcher />}
 *   {can('incident:transition') && <AcknowledgeButton />}
 *
 * Security note: these checks control UI visibility only. The server
 * re-verifies the JWT and enforces authorization on every request (ADR-0003).
 */
import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { permissionsForRole, type Permission } from '@/lib/permissions';
import type { OperationalRole } from '@/types';

export interface PermissionHelpers {
	/** True if the user holds the given permission. */
	can: (perm: Permission) => boolean;
	/** True if the user holds ANY of the given permissions. */
	canAny: (...perms: Permission[]) => boolean;
	/** True if the user holds ALL of the given permissions. */
	canAll: (...perms: Permission[]) => boolean;
	/** True if the user's role matches. */
	hasRole: (role: OperationalRole) => boolean;
	// ── Convenience booleans ──
	/** Superadmin only. */
	isSuperadmin: boolean;
	/** Admin or superadmin (covers both in one check). */
	isAdmin: boolean;
	/** Staff only. */
	isStaff: boolean;
	/** Any authenticated user. */
	isAuthenticated: boolean;
	// ── Tenant ──
	/** The tenant ID from JWT claims. */
	tenantId: string | undefined;
	/** True if the user belongs to the given tenant. */
	hasTenant: (tenantId: string) => boolean;
	/** The phone number from JWT claims (staff identity). */
	phoneNumber: string | undefined;
}

export function usePermissions(): PermissionHelpers {
	const { claims } = useAuth();

	const permissions = useMemo(
		() => permissionsForRole(claims?.role),
		[claims?.role],
	);

	return useMemo<PermissionHelpers>(() => {
		const role = claims?.role;
		const tenantId = claims?.tenantId;
		const phoneNumber = claims?.phoneNumber;

		return {
			can: (perm: Permission) => permissions.has(perm),
			canAny: (...perms: Permission[]) => perms.some((p) => permissions.has(p)),
			canAll: (...perms: Permission[]) => perms.every((p) => permissions.has(p)),
			hasRole: (r: OperationalRole) => role === r,

			isSuperadmin: role === 'superadmin',
			isAdmin: role === 'admin' || role === 'superadmin',
			isStaff: role === 'staff',
			isAuthenticated: !!claims,

			tenantId,
			hasTenant: (id: string) => tenantId === id,
			phoneNumber,
		};
	}, [permissions, claims]);
}
