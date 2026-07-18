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

/**
 * Global role on a user account. Only `superadmin` is special — members have
 * no inherent permissions and derive all authority from `tenant_memberships`.
 *
 * See ADR-0010 §Decision.
 */
export type GlobalRole = 'superadmin' | 'member';

/**
 * Tenant-scoped role names stored in `tenant_memberships.roles[]`. The full
 * set is DB-driven (ADR-0011); this union lists the system-seeded defaults.
 */
export type SystemScopedRole = 'admin' | 'manager' | 'staff';

/**
 * Typed capability drawn from the closed `Permission` union in
 * `src/lib/permissions.ts`. Each permission corresponds to a real server
 * capability. The JWT carries the resolved `permissions[]` array per ADR-0013.
 */
export type Permission =
	// ── Incidents ──
	| 'incident:create'
	| 'incident:transition'
	| 'incident:read'
	// ── Dispatches ──
	| 'dispatch:create'
	| 'dispatch:update'
	| 'dispatch:read'
	// ── Tenancy ──
	| 'tenant:switch'
	| 'tenant:manage'
	// ── Staff ──
	| 'staff:manage'
	| 'staff:reassign'
	// ── Roles ──
	| 'role:assign-admin'
	// ── Audit ──
	| 'audit:view'
	// ── Surfaces ──
	| 'surface:control-room'
	| 'surface:field-client'
	// ── System ──
	| 'config:manage';

/**
 * Claims embedded in the RS256 JWT minted at the edge (ADR-0003).
 *
 * Post-ADR-0013 shape — see ADR-0003 §JWT Claim Shape (post-ADR-0013) for the
 * migration table from the original `{ role, tenantId, phoneNumber }` shape.
 *
 * The client may read these for UI rendering, but every server-side function
 * must re-verify the JWT signature and extract claims itself — never trust
 * client-decoded values for authorization.
 */
export interface JwtClaims {
	/** Stable user UUID (ADR-0010). */
	sub: string;
	/** Global role: superadmin bypasses tenant scoping; member is scoped. */
	global_role: GlobalRole;
	/** Active tenant context. For superadmins this is the switched-to tenant. */
	tenant_id: string;
	/**
	 * Resolved permission union (ADR-0011). Server never branches on role
	 * names; it checks `permissions.includes(requiredPerm)`.
	 */
	permissions: Permission[];
	/** Permission-version stamp (ADR-0013). Mismatch with DB → 401 stale-perms. */
	pv: number;
	/** Auth provider — `phone_otp` (today) or `google_oauth` (M11+). */
	auth_provider: 'phone_otp' | 'google_oauth';
	/** Optional denormalized phone (for UI display only). Not used for auth. */
	phone?: string;
	/** Optional denormalized full name (for UI display only). Not used for auth. */
	full_name?: string;
	// Standard JWT registered claims
	iss?: string;
	aud?: string;
	exp: number;
	iat: number;
}

/**
 * Legacy role union kept for backwards compatibility with `AuditActor.role`
 * in audit-ledger rows written before ADR-0013. New audit entries use the
 * actor's `global_role` + the resolved `permissions[]` at event time.
 *
 * @deprecated since ADR-0010/0013. Use `GlobalRole` for new code.
 */
export type OperationalRole = 'superadmin' | 'admin' | 'staff';

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

/**
 * Field-staff member as seen by the state-poll surface. Joins `users` +
 * `staff_roster` + the user's scoped roles in the active tenant.
 *
 * After ADR-0010, the legacy `role`/`tenantId`/`fullName` fields are still
 * present (denormalized from `users` + `tenant_memberships`) for compatibility
 * with the existing Control Room / Field Client code. They will be removed
 * once the UI migrates to the new identity shape (M9.5).
 */
export interface WhitelistUser {
	id: string; // Stable UUID (users.id) — was E.164 phone pre-ADR-0010
	userId?: string; // Alias of id; populated by post-ADR-0010 mappers
	tenantId: string; // Tenant scoping (from tenant_memberships)
	fullName: string; // From users.full_name
	roles: SystemScopedRole[]; // From tenant_memberships.roles (may be multi)
	specialty: StaffSpecialty;
	assignedZone: string;
	status: StaffStatus;
	phoneNumber: string; // From users.phone (kept on roster for query speed)
	currentCoords?: MapCoordinates;
	/** Floor assignment (references a floor ID from the tenant's mapLayout). */
	floorId?: string;
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
	/** UUID of the staff member who reported this incident (null for social_media source). */
	reportedBy?: string;
	/** Floor this incident occurred on (references floor ID from mapLayout). */
	floorId?: string;
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
	mapLayout?: unknown;
	serverTimestamp: number;
}
