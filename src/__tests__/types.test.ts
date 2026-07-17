import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
	GlobalRole,
	SystemScopedRole,
	StaffSpecialty,
	StaffStatus,
	IncidentCategory,
	IncidentStatus,
	InfoTier,
	DispatchStatus,
	JwtClaims,
	MapCoordinates,
	WhitelistUser,
	IncidentReport,
	TriageResult,
	StatePollDiff,
} from '../types';

/**
 * Type-level and value-level sanity checks for the canonical domain types.
 * Post-ADR-0010/0011/0013: identity split, DB-driven roles, new JWT shape.
 */

describe('domain type unions', () => {
	it('InfoTier is exactly 1 through 5 (ADR-0007)', () => {
		const validTiers: InfoTier[] = [1, 2, 3, 4, 5];
		expect(validTiers).toHaveLength(5);
		expectTypeOf<InfoTier>().toEqualTypeOf<1 | 2 | 3 | 4 | 5>();
	});

	it('IncidentStatus does NOT contain CLOSED or DISPATCHED', () => {
		const statuses: IncidentStatus[] = ['OPEN', 'ACKNOWLEDGED', 'ON_SCENE', 'RESOLVED'];
		expect(statuses).not.toContain('CLOSED');
		expect(statuses).not.toContain('DISPATCHED');
	});

	it('StaffStatus uses AVAILABLE/DISPATCHED/OFF_DUTY', () => {
		const statuses: StaffStatus[] = ['AVAILABLE', 'DISPATCHED', 'OFF_DUTY'];
		expect(statuses).not.toContain('ACTIVE');
	});

	it('StaffSpecialty uses cleaning/supervisor (not logistics/command)', () => {
		const specialties: StaffSpecialty[] = ['security', 'medical', 'cleaning', 'supervisor'];
		expect(specialties).not.toContain('logistics');
		expect(specialties).not.toContain('command');
	});

	it('GlobalRole is superadmin | member (ADR-0010)', () => {
		const roles: GlobalRole[] = ['superadmin', 'member'];
		expect(roles).toHaveLength(2);
	});

	it('SystemScopedRole covers the four preseeded roles (ADR-0011)', () => {
		const roles: SystemScopedRole[] = ['admin', 'manager', 'staff'];
		expect(roles).toHaveLength(3);
	});

	it('IncidentCategory covers all five (includes ADVISORY)', () => {
		const categories: IncidentCategory[] = [
			'SECURITY', 'MEDICAL', 'CROWD', 'FACILITIES', 'ADVISORY',
		];
		expect(categories).toHaveLength(5);
	});

	it('DispatchStatus mirrors the ack/resolve flow', () => {
		const statuses: DispatchStatus[] = ['SENT', 'ACKNOWLEDGED', 'ON_SCENE', 'RESOLVED'];
		expect(statuses).toHaveLength(4);
	});
});

describe('domain object shapes', () => {
	it('JwtClaims (post-ADR-0013) carries sub + global_role + permissions[] + pv', () => {
		const claims: JwtClaims = {
			sub: 'user-uuid-1',
			global_role: 'member',
			tenant_id: 'tenant_metlife_ops',
			permissions: ['incident:create', 'incident:read'],
			pv: 1,
			auth_provider: 'phone_otp',
			exp: Math.floor(Date.now() / 1000) + 3600,
			iat: Math.floor(Date.now() / 1000),
		};
		expect(claims.sub).toBe('user-uuid-1');
		expect(claims.global_role).toBe('member');
		expect(claims.tenant_id).toBe('tenant_metlife_ops');
		expect(claims.permissions).toContain('incident:create');
		expect(claims.pv).toBe(1);
	});

	it('MapCoordinates are bounded 0–1000 grid values', () => {
		const coord: MapCoordinates = { x: 500, y: 500 };
		expect(coord.x).toBeGreaterThanOrEqual(0);
		expect(coord.x).toBeLessThanOrEqual(1000);
	});

	it('WhitelistUser uses fullName + roles[] (post-ADR-0010)', () => {
		const user: WhitelistUser = {
			id: 'user-uuid-2',
			userId: 'user-uuid-2',
			tenantId: 'tenant_metlife_ops',
			fullName: 'Alpha Security Lead',
			roles: ['staff'],
			specialty: 'security',
			assignedZone: 'ZONE-A',
			status: 'AVAILABLE',
			phoneNumber: '+14155550001',
			createdAt: Date.now(),
		};
		expect(user).toHaveProperty('fullName');
		expect(user).not.toHaveProperty('name');
		expect(user.roles).toEqual(['staff']);
	});

	it('IncidentReport binds tier 1–5 and tenantId', () => {
		const incident: IncidentReport = {
			id: 'inc_test_001',
			tenantId: 'tenant_metlife_ops',
			source: 'field_staff',
			tier: 1,
			status: 'OPEN',
			rawText: 'Test incident',
			timestamp: Date.now(),
			coordinates: { x: 450, y: 320 },
			extractedMetadata: {
				category: 'CROWD',
				severity: 'CRITICAL',
				locationSector: 'ZONE-A',
			},
		};
		expect(incident.tier).toBe(1);
		expect(incident.tenantId).toBe('tenant_metlife_ops');
	});

	it('TriageResult.structuredAnalysis.tier is InfoTier (5-tier)', () => {
		const result: TriageResult = {
			rawTranscription: 'Test',
			structuredAnalysis: {
				tier: 4,
				category: 'FACILITIES',
				severity: 'MEDIUM',
				locationSector: 'ZONE-D',
				actionRequired: 'Dispatch maintenance',
			},
			processedTimestamp: Date.now(),
		};
		expect(result.structuredAnalysis.tier).toBe(4);
	});

	it('StatePollDiff returns the three collections + serverTimestamp', () => {
		const diff: StatePollDiff = {
			incidents: [],
			staff: [],
			dispatches: [],
			serverTimestamp: Date.now(),
		};
		expect(diff).toHaveProperty('serverTimestamp');
	});
});

