/**
 * Database row → TypeScript type mappers.
 *
 * Post-ADR-0010: staff_roster no longer carries role/tenant_id/full_name
 * directly. The mappers JOIN through `users` + `tenant_memberships` and
 * assemble the legacy `WhitelistUser` shape for client compatibility.
 *
 * The `WhitelistUser.id` field is now the stable UUID (users.id), not the
 * phone number. Callers that previously looked up staff by phone must use
 * `phoneNumber` instead of `id`.
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
	SystemScopedRole,
	DispatchStatus,
} from '../../src/types';

// ─── Row interfaces (match column names from the Drizzle schema) ─────────────

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
	floor_id: string | null;
	reported_by: string | null;
	created_at: Date;
	updated_at: Date;
}

/**
 * StaffRow joined with users + tenant_memberships.
 * Used by state-poll and any future function that reads staff.
 */
interface StaffJoinedRow {
	id: string;                  // staff_roster.id (UUID)
	user_id: string;             // users.id
	tenant_id: string;           // from query context
	full_name: string;           // users.full_name
	phone_number: string;        // denormalized on roster
	specialty: string | null;
	assigned_zone: string;
	status: string;
	coord_x: number | null;
	coord_y: number | null;
	floor_id: string | null;
	updated_at: Date;
	created_at: Date;
	roles: string[] | null;      // tenant_memberships.roles for the active tenant
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
		reportedBy: row.reported_by ?? undefined,
		floorId: row.floor_id ?? undefined,
	};
}

export function mapStaff(row: StaffJoinedRow): WhitelistUser {
	return {
		id: row.user_id,                  // UUID — was phone pre-ADR-0010
		userId: row.user_id,
		tenantId: row.tenant_id,
		fullName: row.full_name,
		roles: (row.roles ?? []) as SystemScopedRole[],
		specialty: (row.specialty ?? 'security') as StaffSpecialty,
		assignedZone: row.assigned_zone,
		status: row.status as StaffStatus,
		phoneNumber: row.phone_number,
		currentCoords:
			row.coord_x != null && row.coord_y != null
				? { x: row.coord_x, y: row.coord_y }
				: undefined,
		floorId: row.floor_id ?? undefined,
		createdAt: new Date(row.created_at).getTime(),
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
