/**
 * Database row → TypeScript type mappers.
 *
 * Converts Postgres snake_case rows into the canonical camelCase domain types
 * defined in src/types/index.ts. Used by state-poll, mutations, and any future
 * function that reads from the database.
 */
import type {
	IncidentReport,
	WhitelistUser,
	DispatchDirective,
	IncidentCategory,
	IncidentSeverity,
	IncidentStatus,
	InfoTier,
	StaffSpecialty,
	StaffStatus,
	OperationalRole,
	DispatchStatus,
} from '../../src/types';

// ─── Row interfaces (match column names from the SQL schema) ──────────────────

interface IncidentRow {
	id: string;
	tenant_id: string;
	source: string;
	tier: number;
	status: string;
	raw_text: string;
	category: string | null;
	severity: string | null;
	location_sector: string | null;
	action_required: string | null;
	coord_x: number | null;
	coord_y: number | null;
	created_at: Date;
	updated_at: Date;
}

interface StaffRow {
	id: string;
	tenant_id: string;
	full_name: string;
	role: string;
	specialty: string;
	assigned_zone: string;
	status: string;
	phone_number: string;
	coord_x: number | null;
	coord_y: number | null;
	updated_at: Date;
}

interface DispatchRow {
	id: string;
	tenant_id: string;
	incident_id: string;
	target_staff_phone: string;
	directive_text: string;
	status: string;
	sent_at: Date;
	ack_at: Date | null;
	resolved_at: Date | null;
}

// ─── Mappers ───────────────────────────────────────────────────────────────────

export function mapIncident(row: IncidentRow): IncidentReport {
	return {
		id: row.id,
		tenantId: row.tenant_id,
		source: row.source as IncidentReport['source'],
		tier: row.tier as InfoTier,
		status: row.status as IncidentStatus,
		rawText: row.raw_text,
		timestamp: new Date(row.created_at).getTime(),
		coordinates: {
			x: row.coord_x ?? 500,
			y: row.coord_y ?? 500,
		},
		extractedMetadata: {
			category: (row.category ?? 'ADVISORY') as IncidentCategory,
			severity: (row.severity ?? 'LOW') as IncidentSeverity,
			locationSector: row.location_sector ?? 'UNKNOWN',
			actionRequired: row.action_required ?? undefined,
		},
	};
}

export function mapStaff(row: StaffRow): WhitelistUser {
	return {
		id: row.id,
		tenantId: row.tenant_id,
		fullName: row.full_name,
		role: row.role as OperationalRole,
		specialty: row.specialty as StaffSpecialty,
		assignedZone: row.assigned_zone,
		status: row.status as StaffStatus,
		phoneNumber: row.phone_number,
		currentCoords:
			row.coord_x != null && row.coord_y != null
				? { x: row.coord_x, y: row.coord_y }
				: undefined,
		createdAt: 0, // staff_roster doesn't track creation time in the current schema
	};
}

export function mapDispatch(row: DispatchRow): DispatchDirective {
	return {
		id: row.id,
		tenantId: row.tenant_id,
		incidentId: row.incident_id,
		targetStaffPhone: row.target_staff_phone,
		directiveText: row.directive_text,
		status: row.status as DispatchStatus,
		sentTimestamp: new Date(row.sent_at).getTime(),
		ackTimestamp: row.ack_at ? new Date(row.ack_at).getTime() : undefined,
		resolvedTimestamp: row.resolved_at ? new Date(row.resolved_at).getTime() : undefined,
	};
}
