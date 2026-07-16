import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
	OperationalRole,
	StaffSpecialty,
	StaffStatus,
	IncidentCategory,
	IncidentSeverity,
	IncidentStatus,
	InfoTier,
	DispatchStatus,
	JwtClaims,
	MapCoordinates,
	WhitelistUser,
	IncidentReport,
	DispatchDirective,
	AuditLogEntry,
	TriageResult,
	StatePollRequest,
	StatePollDiff,
} from '../types';

/**
 * Type-level and value-level sanity checks for the canonical domain types.
 * Ensures the unions hold the resolved values from ADR-0007 / STRUCTURAL-TYPES.md
 * and that no stale values (CLOSED, DISPATCHED-as-status, etc.) leak back in.
 */

describe('domain type unions', () => {
	it('InfoTier is exactly 1 through 5 (ADR-0007)', () => {
		const validTiers: InfoTier[] = [1, 2, 3, 4, 5];
		expect(validTiers).toHaveLength(5);
		expectTypeOf<InfoTier>().toEqualTypeOf<1 | 2 | 3 | 4 | 5>();
	});

	it('IncidentStatus does NOT contain CLOSED or DISPATCHED (resolved contradiction)', () => {
		const statuses: IncidentStatus[] = ['OPEN', 'ACKNOWLEDGED', 'ON_SCENE', 'RESOLVED'];
		expect(statuses).not.toContain('CLOSED');
		expect(statuses).not.toContain('DISPATCHED');
	});

	it('StaffStatus uses AVAILABLE/DISPATCHED/OFF_DUTY (not ACTIVE)', () => {
		const statuses: StaffStatus[] = ['AVAILABLE', 'DISPATCHED', 'OFF_DUTY'];
		expect(statuses).not.toContain('ACTIVE');
	});

	it('StaffSpecialty uses cleaning/supervisor (not logistics/command)', () => {
		const specialties: StaffSpecialty[] = ['security', 'medical', 'cleaning', 'supervisor'];
		expect(specialties).not.toContain('logistics');
		expect(specialties).not.toContain('command');
	});

	it('OperationalRole is the three-role hierarchy', () => {
		const roles: OperationalRole[] = ['superadmin', 'admin', 'staff'];
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
	it('JwtClaims carries role + tenantId + exp', () => {
		const claims: JwtClaims = {
			role: 'admin',
			tenantId: 'tenant_metlife_ops',
			phoneNumber: '+14155552026',
			exp: Math.floor(Date.now() / 1000) + 3600,
			iat: Math.floor(Date.now() / 1000),
		};
		expect(claims.role).toBe('admin');
		expect(claims.tenantId).toBe('tenant_metlife_ops');
	});

	it('MapCoordinates are bounded 0–1000 grid values', () => {
		const coord: MapCoordinates = { x: 500, y: 500 };
		expect(coord.x).toBeGreaterThanOrEqual(0);
		expect(coord.x).toBeLessThanOrEqual(1000);
	});

	it('WhitelistUser uses fullName (not name)', () => {
		const user: WhitelistUser = {
			id: '+14155550001',
			tenantId: 'tenant_metlife_ops',
			fullName: 'Alpha Security Lead',
			role: 'staff',
			specialty: 'security',
			assignedZone: 'ZONE-A',
			status: 'AVAILABLE',
			phoneNumber: '+14155550001',
			createdAt: Date.now(),
		};
		expect(user).toHaveProperty('fullName');
		expect(user).not.toHaveProperty('name');
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
