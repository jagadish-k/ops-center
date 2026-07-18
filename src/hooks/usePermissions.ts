/**
 * usePermissions — RBAC hook for permission-based UI checks.
 *
 * Post-ADR-0013: the JWT carries `permissions[]` directly (resolved server-side
 * at mint time per ADR-0011). The hook reads from the claims' permission array
 * instead of mapping a role locally.
 *
 * Components should call `can(perm)` instead of checking role names. The
 * server re-verifies the JWT and enforces authorization on every request
 * (ADR-0003 + ADR-0013) — these client checks control UI visibility only.
 *
 * Usage:
 *   const { can, isSuperadmin, tenantId } = usePermissions();
 *   {can('tenant:switch') && <TenantSwitcher />}
 *   {can('incident:transition') && <AcknowledgeButton />}
 */
import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { permissionsForClaim, type Permission } from '@/lib/permissions';
import type { SystemScopedRole } from '@/types';

export interface PermissionHelpers {
	/** True if the user holds the given permission. */
	can: (perm: Permission) => boolean;
	/** True if the user holds ANY of the given permissions. */
	canAny: (...perms: Permission[]) => boolean;
	/** True if the user holds ALL of the given permissions. */
	canAll: (...perms: Permission[]) => boolean;
	/** True if the user's global_role is superadmin. */
	isSuperadmin: boolean;
	/** True if the user has `surface:control-room` permission. */
	hasControlRoom: boolean;
	/** True if the user has `surface:field-client` permission. */
	hasFieldClient: boolean;
	/** Any authenticated user. */
	isAuthenticated: boolean;
	/** Roles derived for the active tenant (from `tenant_memberships.roles[]`).
	 *  Empty for superadmins unless they hold explicit memberships. */
	scopedRoles: SystemScopedRole[];
	/** True if the user holds a specific scoped role in the active tenant. */
	hasScopedRole: (role: SystemScopedRole) => boolean;
	// ── Tenant ──
	/** The active tenant ID from JWT claims. */
	tenantId: string | undefined;
	/** True if the active tenant matches the given ID. */
	hasTenant: (tenantId: string) => boolean;
	// ── Operator identity (denormalized, UI display only — ADR-0013) ──
	/** Operator's phone number from JWT (UI display only). */
	phone: string | undefined;
	/** Operator's full name from JWT (UI display only). */
	fullName: string | undefined;
	/** Stable user UUID (the canonical identity post-ADR-0010). */
	userId: string | undefined;
}

export function usePermissions(): PermissionHelpers {
	const { claims } = useAuth();

	const permissions = useMemo(
		() => permissionsForClaim(claims?.permissions),
		[claims?.permissions],
	);

	return useMemo<PermissionHelpers>(() => {
		const globalRole = claims?.global_role;
		const tenantId = claims?.tenant_id;

		return {
			can: (perm: Permission) => permissions.has(perm),
			canAny: (...perms: Permission[]) => perms.some((p) => permissions.has(p)),
			canAll: (...perms: Permission[]) => perms.every((p) => permissions.has(p)),

			isSuperadmin: globalRole === 'superadmin',
			hasControlRoom: permissions.has('surface:control-room'),
			hasFieldClient: permissions.has('surface:field-client'),
			isAuthenticated: !!claims,

			scopedRoles: [],
			hasScopedRole: () => false,

			tenantId,
			hasTenant: (id: string) => tenantId === id,

			phone: claims?.phone,
			fullName: claims?.full_name,
			userId: claims?.sub,
		};
	}, [permissions, claims]);
}
