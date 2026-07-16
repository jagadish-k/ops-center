/**
 * Canonical domain types for the Stadium Ops Grid Matrix.
 *
 * This file is the SINGLE source of truth for all type contracts.
 * See docs/STRUCTURAL-TYPES.md for the resolution notes and
 * docs/adr/0007-five-tier-information-system.md for the 5-tier decision.
 *
 * No runtime implicit types (`any`) are permitted — use `unknown` + narrowing
 * where a value shape is genuinely dynamic.
 */

// ─── Role & Identity ──────────────────────────────────────────────────────────

export type OperationalRole = 'superadmin' | 'admin' | 'staff';

/**
 * Claims embedded in the RS256 JWT minted at the edge (ADR-0003).
 * The client may read these for UI rendering, but every server-side function
 * must re-verify the JWT signature and extract claims itself — never trust
 * client-decoded values for authorization.
 */
export interface JwtClaims {
	role: OperationalRole;
	tenantId: string;
	phoneNumber?: string;
	email?: string;
	exp: number; // Unix seconds
	iat: number; // Unix seconds
}

// ─── Spatial System ───────────────────────────────────────────────────────────

/**
 * Normalized coordinate on the 0–1000 stadium grid.
 * All physical locations are projected onto this plane (ADR-referenced in
 * docs/ARCHITECTURE.md §2).
 */
export interface MapCoordinates {
	x: number; // 0 to 1000
	y: number; // 0 to 1000
}

// ─── Tenancy ──────────────────────────────────────────────────────────────────

export interface TenantConfig {
	tenantId: string;
	orgName: string;
	createdAt: number;
	status: 'ACTIVE' | 'SUSPENDED';
}

// ─── Field Staff ──────────────────────────────────────────────────────────────

export type StaffSpecialty = 'security' | 'medical' | 'cleaning' | 'supervisor';
export type StaffStatus = 'AVAILABLE' | 'DISPATCHED' | 'OFF_DUTY';

export interface WhitelistUser {
	id: string; // E.164 phone number (e.g. +14155552671)
	tenantId: string; // SaaS isolation boundary
	fullName: string;
	role: OperationalRole;
	specialty: StaffSpecialty;
	assignedZone: string;
	status: StaffStatus;
	phoneNumber: string;
	currentCoords?: MapCoordinates;
	createdAt: number;
}

// ─── Incidents ────────────────────────────────────────────────────────────────

export type IncidentCategory =
	| 'SECURITY'
	| 'MEDICAL'
	| 'CROWD'
	| 'FACILITIES'
	| 'ADVISORY';

export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'ON_SCENE' | 'RESOLVED';

/**
 * Five-tier information classification (ADR-0007).
 * 1 = Life Safety & Crisis … 5 = Operational Advisory.
 */
export type InfoTier = 1 | 2 | 3 | 4 | 5;

export interface IncidentExtractedMetadata {
	category: IncidentCategory;
	severity: IncidentSeverity;
	locationSector: string;
	actionRequired?: string;
}

export interface IncidentReport {
	id: string;
	tenantId: string;
	source: 'field_staff' | 'social_media';
	tier: InfoTier;
	status: IncidentStatus;
	rawText: string;
	timestamp: number;
	coordinates: MapCoordinates;
	extractedMetadata: IncidentExtractedMetadata;
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export type DispatchStatus = 'SENT' | 'ACKNOWLEDGED' | 'ON_SCENE' | 'RESOLVED';

export interface DispatchDirective {
	id: string;
	tenantId: string;
	incidentId: string;
	targetStaffPhone: string;
	directiveText: string;
	status: DispatchStatus;
	sentTimestamp: number;
	ackTimestamp?: number;
	resolvedTimestamp?: number;
}

// ─── Audit Chain (WORM — tamper-evident, ADR-0005) ────────────────────────────

export interface AuditActor {
	uid: string;
	role: OperationalRole;
	phoneOrEmail: string;
	deviceFingerprint: string;
	ipAddress: string;
}

export interface AuditLogEntry {
	eventId: string;
	tenantId: string;
	timestamp: number;
	actor: AuditActor;
	action: string; // e.g. "INCIDENT_STATUS_MUTATION"
	targetResourceId: string;
	stateDelta: {
		before: Record<string, unknown> | null;
		after: Record<string, unknown> | null;
	};
	cryptographicHash: string; // SHA-256 chain link
}

// ─── AI Triage Result (Whisper + Gemini pipeline, ADR-0006) ───────────────────

export interface TriageResult {
	rawTranscription: string;
	structuredAnalysis: {
		tier: InfoTier;
		category: IncidentCategory;
		severity: IncidentSeverity;
		locationSector: string;
		actionRequired: string;
	};
	processedTimestamp: number;
}

// ─── Polling (diff-based, ADR-0004) ───────────────────────────────────────────

export interface StatePollRequest {
	tenantId: string;
	sinceTimestamp: number;
}

export interface StatePollDiff {
	incidents: IncidentReport[];
	staff: WhitelistUser[];
	dispatches: DispatchDirective[];
	serverTimestamp: number;
}
