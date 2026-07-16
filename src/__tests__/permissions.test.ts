import { describe, it, expect } from 'vitest';
import { ROLE_PERMISSIONS, permissionsForRole, type Permission } from '@/lib/permissions';
import type { OperationalRole } from '@/types';

/**
 * Tests for the declarative RBAC permission model (src/lib/permissions.ts).
 * Validates the role-to-permission mapping against the ARCHITECTURE.md §4
 * RBAC Rules Matrix.
 */

const ALL_PERMS: Permission[] = [
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

describe('ROLE_PERMISSIONS', () => {
	it('superadmin has every permission', () => {
		const perms = ROLE_PERMISSIONS.superadmin;
		for (const p of ALL_PERMS) {
			expect(perms.has(p)).toBe(true);
		}
	});

	it('admin has operational permissions but not tenant/system management', () => {
		const perms = ROLE_PERMISSIONS.admin;
		// Can do operational tasks
		expect(perms.has('incident:create')).toBe(true);
		expect(perms.has('incident:transition')).toBe(true);
		expect(perms.has('dispatch:create')).toBe(true);
		expect(perms.has('dispatch:update')).toBe(true);
		expect(perms.has('staff:manage')).toBe(true);
		expect(perms.has('audit:view')).toBe(true);
		expect(perms.has('surface:control-room')).toBe(true);
		// Cannot manage tenants or system config
		expect(perms.has('tenant:switch')).toBe(false);
		expect(perms.has('tenant:manage')).toBe(false);
		expect(perms.has('config:manage')).toBe(false);
	});

	it('staff can file reports and manage own dispatches but cannot transition incidents', () => {
		const perms = ROLE_PERMISSIONS.staff;
		// Can file + read
		expect(perms.has('incident:create')).toBe(true);
		expect(perms.has('incident:read')).toBe(true);
		// Can update own dispatch
		expect(perms.has('dispatch:update')).toBe(true);
		expect(perms.has('dispatch:read')).toBe(true);
		// Cannot transition incidents or create dispatches
		expect(perms.has('incident:transition')).toBe(false);
		expect(perms.has('dispatch:create')).toBe(false);
		// Cannot access control room
		expect(perms.has('surface:control-room')).toBe(false);
		// Can access field client
		expect(perms.has('surface:field-client')).toBe(true);
		// Cannot manage tenants/staff/config
		expect(perms.has('tenant:switch')).toBe(false);
		expect(perms.has('staff:manage')).toBe(false);
		expect(perms.has('config:manage')).toBe(false);
	});

	it('staff cannot view audit log', () => {
		expect(ROLE_PERMISSIONS.staff.has('audit:view')).toBe(false);
	});
});

describe('permissionsForRole', () => {
	it('returns the correct set for each role', () => {
		for (const role of ['superadmin', 'admin', 'staff'] as OperationalRole[]) {
			const perms = permissionsForRole(role);
			expect(perms).toBe(ROLE_PERMISSIONS[role]);
		}
	});

	it('returns empty set for null/undefined', () => {
		expect(permissionsForRole(null).size).toBe(0);
		expect(permissionsForRole(undefined).size).toBe(0);
	});
});
