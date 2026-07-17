import { describe, it, expect } from 'vitest';
import { mapIncident, mapStaff, mapDispatch } from '../../netlify/lib/mappers';
import type { IncidentReport, WhitelistUser, DispatchDirective } from '../types';

/**
 * Tests for the DB row → domain type mappers (netlify/lib/mappers.ts).
 *
 * These are pure functions — no DB connection needed. We pass mock row objects
 * matching the Postgres column schema and verify the output matches the
 * canonical TypeScript types.
 */

describe('mapIncident', () => {
	const mockRow = {
		id: 'inc_test_001',
		tenant_id: 'tenant_metlife_ops',
		source: 'field_staff',
		tier: 1,
		status: 'OPEN',
		raw_text: 'Crowd crush at Gate B',
		category: 'CROWD',
		severity: 'CRITICAL',
		location_sector: 'ZONE-B',
		action_required: 'Deploy relief cordons',
		coord_x: 720,
		coord_y: 210,
		created_at: new Date('2026-07-16T12:00:00Z'),
		updated_at: new Date('2026-07-16T12:01:00Z'),
	};

	it('maps all fields correctly', () => {
		const result = mapIncident(mockRow);
		expect(result.id).toBe('inc_test_001');
		expect(result.tenantId).toBe('tenant_metlife_ops');
		expect(result.source).toBe('field_staff');
		expect(result.tier).toBe(1);
		expect(result.status).toBe('OPEN');
		expect(result.rawText).toBe('Crowd crush at Gate B');
		expect(result.timestamp).toBe(new Date('2026-07-16T12:00:00Z').getTime());
		expect(result.coordinates).toEqual({ x: 720, y: 210 });
		expect(result.extractedMetadata.category).toBe('CROWD');
		expect(result.extractedMetadata.severity).toBe('CRITICAL');
		expect(result.extractedMetadata.locationSector).toBe('ZONE-B');
		expect(result.extractedMetadata.actionRequired).toBe('Deploy relief cordons');
	});

	it('defaults null coordinates to grid center', () => {
		const result = mapIncident({ ...mockRow, coord_x: null, coord_y: null });
		expect(result.coordinates).toEqual({ x: 500, y: 500 });
	});

	it('defaults null metadata to safe fallbacks', () => {
		const result = mapIncident({
			...mockRow,
			category: null,
			severity: null,
			location_sector: null,
			action_required: null,
		});
		expect(result.extractedMetadata.category).toBe('ADVISORY');
		expect(result.extractedMetadata.severity).toBe('LOW');
		expect(result.extractedMetadata.locationSector).toBe('UNKNOWN');
		expect(result.extractedMetadata.actionRequired).toBeUndefined();
	});

	it('produces a valid IncidentReport', () => {
		const result = mapIncident(mockRow);
		// Type-level check — if this compiles, the shape is correct.
		const _: IncidentReport = result;
		expect(_).toBeDefined();
	});
});

describe('mapStaff', () => {
	// Post-ADR-0010: staff_roster.id is a UUID; user_id is the stable identity.
	// The mapper joins through users + tenant_memberships.
	const mockRow = {
		id: 'roster-uuid-1',
		user_id: 'user-uuid-1',
		tenant_id: 'tenant_metlife_ops',
		full_name: 'Alpha Security Lead',
		phone_number: '+14155550001',
		specialty: 'security',
		assigned_zone: 'ZONE-A',
		status: 'AVAILABLE',
		coord_x: 450,
		coord_y: 320,
		updated_at: new Date('2026-07-16T12:00:00Z'),
		created_at: new Date('2026-07-16T11:00:00Z'),
		roles: ['staff'],
	};

	it('maps all fields correctly', () => {
		const result = mapStaff(mockRow);
		expect(result.id).toBe('user-uuid-1'); // users.id, not phone
		expect(result.userId).toBe('user-uuid-1');
		expect(result.tenantId).toBe('tenant_metlife_ops');
		expect(result.fullName).toBe('Alpha Security Lead');
		expect(result.roles).toEqual(['staff']);
		expect(result.specialty).toBe('security');
		expect(result.assignedZone).toBe('ZONE-A');
		expect(result.status).toBe('AVAILABLE');
		expect(result.phoneNumber).toBe('+14155550001');
		expect(result.currentCoords).toEqual({ x: 450, y: 320 });
	});

	it('sets currentCoords to undefined when coords are null', () => {
		const result = mapStaff({ ...mockRow, coord_x: null, coord_y: null });
		expect(result.currentCoords).toBeUndefined();
	});

	it('defaults roles to empty array when null', () => {
		const result = mapStaff({ ...mockRow, roles: null });
		expect(result.roles).toEqual([]);
	});

	it('produces a valid WhitelistUser', () => {
		const result = mapStaff(mockRow);
		const _: WhitelistUser = result;
		expect(_).toBeDefined();
	});
});

describe('mapDispatch', () => {
	const mockRow = {
		id: 'disp_test_001',
		tenant_id: 'tenant_metlife_ops',
		incident_id: 'inc_test_001',
		target_staff_phone: '+14155550001',
		directive_text: 'Proceed to Gate B immediately',
		status: 'SENT',
		sent_at: new Date('2026-07-16T12:05:00Z'),
		ack_at: null,
		resolved_at: null,
	};

	it('maps all fields correctly', () => {
		const result = mapDispatch(mockRow);
		expect(result.id).toBe('disp_test_001');
		expect(result.tenantId).toBe('tenant_metlife_ops');
		expect(result.incidentId).toBe('inc_test_001');
		expect(result.targetStaffPhone).toBe('+14155550001');
		expect(result.directiveText).toBe('Proceed to Gate B immediately');
		expect(result.status).toBe('SENT');
		expect(result.sentTimestamp).toBe(new Date('2026-07-16T12:05:00Z').getTime());
		expect(result.ackTimestamp).toBeUndefined();
		expect(result.resolvedTimestamp).toBeUndefined();
	});

	it('maps ack_at and resolved_at when present', () => {
		const result = mapDispatch({
			...mockRow,
			status: 'RESOLVED',
			ack_at: new Date('2026-07-16T12:06:00Z'),
			resolved_at: new Date('2026-07-16T12:15:00Z'),
		});
		expect(result.status).toBe('RESOLVED');
		expect(result.ackTimestamp).toBe(new Date('2026-07-16T12:06:00Z').getTime());
		expect(result.resolvedTimestamp).toBe(new Date('2026-07-16T12:15:00Z').getTime());
	});

	it('produces a valid DispatchDirective', () => {
		const result = mapDispatch(mockRow);
		const _: DispatchDirective = result;
		expect(_).toBeDefined();
	});
});
