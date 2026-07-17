/**
 * Drizzle ORM schema — single source of truth for the database shape.
 *
 * Implements ADRs:
 *   - 0010 (identity model split: users + tenant_memberships + staff_roster)
 *   - 0011 (DB-driven RBAC: roles + role_permissions + user_permissions)
 *   - 0012 (policies table for OPA-authored Rego)
 *   - 0013 (users.perms_version for staleness detection)
 *   - 0014 (Drizzle adoption; this file replaces hand-written SQL migrations)
 *
 * `drizzle-kit generate` consumes this file to produce SQL migrations under
 * `database/migrations/`. Do not edit generated SQL directly — edit this file
 * and regenerate.
 */
import {
	text,
	uuid,
	boolean,
	integer,
	bigint,
	smallint,
	timestamp,
	doublePrecision,
	jsonb,
	pgTable,
	primaryKey,
	index,
	uniqueIndex,
} from 'drizzle-orm/pg-core';

// All tables live in the default `public` schema.

// ─── Tenants ──────────────────────────────────────────────────────────────────

export const tenantsTable = pgTable('tenants', {
	id: text('id').primaryKey(),
	orgName: text('org_name').notNull(),
	status: text('status').notNull().default('ACTIVE'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	// GPS bounding box (ADR-0002, migration 0002 carried forward)
	bboxMinLat: doublePrecision('bbox_min_lat'),
	bboxMaxLat: doublePrecision('bbox_max_lat'),
	bboxMinLng: doublePrecision('bbox_min_lng'),
	bboxMaxLng: doublePrecision('bbox_max_lng'),
	/**
	 * Map layout configuration (JSONB) — defines floors, zones, and points of
	 * interest for the OptimizedStadiumMapCanvas. Superadmins edit this via
	 * the Tenants tab's "Map Layout" section.
	 *
	 * Structure:
	 *   {
	 *     floors: [{
	 *       id: "ground",
	 *       name: "Ground Level",
	 *       level: 0,
	 *       zones: [{
	 *         id: "zone-a",
	 *         name: "Gate A Concourse",
	 *         polygon: [[x1,y1],[x2,y2],...],  // 0-1000 grid coords
	 *         color: "#3b82f6",
	 *         anchor: { x: 250, y: 250 }
	 *       }],
	 *       pois: [{
	 *         id: "gate-a",
	 *         name: "Gate A",
	 *         type: "entry" | "exit" | "restroom" | "first_aid" |
	 *               "concession" | "security_post" | "elevator" |
	 *               "stairs" | "parking",
	 *         x: 150, y: 100
	 *       }]
	 *     }]
	 *   }
	 */
	mapLayout: jsonb('map_layout'),
});

// ─── Users (global identity — ADR-0010) ───────────────────────────────────────

export const usersTable = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	phone: text('phone').unique(),
	email: text('email').unique(),
	fullName: text('full_name').notNull(),
	globalRole: text('global_role').notNull().default('member'),
	status: text('status').notNull().default('active'),
	permsVersion: integer('perms_version').notNull().default(1),
	authProvider: text('auth_provider').notNull().default('phone_otp'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
	globalRoleIdx: index('idx_users_global_role').on(t.globalRole),
	statusIdx: index('idx_users_status').on(t.status),
}));

// ─── Roles (DB-driven templates — ADR-0011) ───────────────────────────────────

export const rolesTable = pgTable('roles', {
	name: text('name').primaryKey(),
	description: text('description').notNull(),
	isSystem: boolean('is_system').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rolePermissionsTable = pgTable(
	'role_permissions',
	{
		roleName: text('role_name').notNull().references(() => rolesTable.name, { onDelete: 'cascade' }),
		permissionName: text('permission_name').notNull(),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.roleName, t.permissionName] }),
	}),
);

// ─── Tenant Memberships (scoped role bindings — ADR-0010) ─────────────────────

export const tenantMembershipsTable = pgTable(
	'tenant_memberships',
	{
		userId: uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
		tenantId: text('tenant_id').notNull().references(() => tenantsTable.id, { onDelete: 'cascade' }),
		// Array of role names. Validated at app layer against rolesTable.name
		// (Postgres does not support array-element foreign keys cleanly).
		roles: text('roles').notNull().default('{}').array(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.userId, t.tenantId] }),
		tenantIdx: index('idx_memberships_tenant').on(t.tenantId),
	}),
);

// ─── Per-User Permission Grants (additive only — ADR-0011) ────────────────────

export const userPermissionsTable = pgTable(
	'user_permissions',
	{
		userId: uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
		permissionName: text('permission_name').notNull(),
		grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
		grantedBy: uuid('granted_by').references(() => usersTable.id, { onDelete: 'set null' }),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.userId, t.permissionName] }),
		userIdx: index('idx_user_perms_user').on(t.userId),
	}),
);

// ─── Staff Roster (operational state — ADR-0010 refactor) ─────────────────────
// Linked to users via user_id. Only 'member' users with 'staff' role in some
// tenant get a roster row. Admins/superadmins do NOT get rows here.

export const staffRosterTable = pgTable(
	'staff_roster',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
		tenantId: text('tenant_id').notNull().references(() => tenantsTable.id),
		specialty: text('specialty'),
		assignedZone: text('assigned_zone').notNull(),
		status: text('status').notNull().default('AVAILABLE'),
		phoneNumber: text('phone_number').notNull(),
		coordX: integer('coord_x'),
		coordY: integer('coord_y'),
		latitude: doublePrecision('latitude'),
		longitude: doublePrecision('longitude'),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		userTenantUniq: uniqueIndex('idx_staff_user_tenant').on(t.userId, t.tenantId),
		tenantStatusIdx: index('idx_staff_tenant').on(t.tenantId, t.status),
	}),
);

// ─── Incidents ────────────────────────────────────────────────────────────────

export const incidentsTable = pgTable('incidents', {
	id: text('id').primaryKey(),
	tenantId: text('tenant_id').notNull().references(() => tenantsTable.id),
	source: text('source').notNull().default('field_staff'),
	tier: smallint('tier').notNull(),
	status: text('status').notNull().default('OPEN'),
	rawText: text('raw_text').notNull(),
	category: text('category'),
	severity: text('severity'),
	locationSector: text('location_sector'),
	actionRequired: text('action_required'),
	coordX: integer('coord_x'),
	coordY: integer('coord_y'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
	tenantUpdatedIdx: index('idx_inc_tenant_updated').on(t.tenantId, t.updatedAt),
}));

// ─── Dispatches ───────────────────────────────────────────────────────────────

export const dispatchesTable = pgTable('dispatches', {
	id: text('id').primaryKey(),
	tenantId: text('tenant_id').notNull().references(() => tenantsTable.id),
	incidentId: text('incident_id').notNull().references(() => incidentsTable.id),
	targetStaffPhone: text('target_staff_phone').notNull(),
	directiveText: text('directive_text').notNull(),
	status: text('status').notNull().default('SENT'),
	sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
	ackAt: timestamp('ack_at', { withTimezone: true }),
	resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (t) => ({
	staffIdx: index('idx_dispatch_staff').on(t.targetStaffPhone, t.status),
	tenantIdx: index('idx_dispatch_tenant').on(t.tenantId, t.status),
}));

// ─── OTP Sessions (Twilio SMS — ADR-0003) ─────────────────────────────────────

export const otpSessionsTable = pgTable('otp_sessions', {
	phone: text('phone').primaryKey(),
	code: text('code').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	attempts: integer('attempts').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Config (operational window — the "switch") ───────────────────────────────

export const configTable = pgTable('config', {
	id: text('id').primaryKey().default('switch'),
	windowStart: timestamp('window_start', { withTimezone: true }),
	windowEnd: timestamp('window_end', { withTimezone: true }),
	operational: boolean('operational').notNull().default(false),
});

// ─── Audit Ledger (WORM tamper-evident — ADR-0005, ADR-0009) ──────────────────
// Append-only enforced at the SQL level via triggers; see seed migration for
// trigger definitions. Drizzle defines the shape; the trigger is part of the
// generated initial migration.

export const auditLedgerTable = pgTable('audit_ledger', {
	eventId: text('event_id').primaryKey(),
	tenantId: text('tenant_id').notNull().references(() => tenantsTable.id),
	// Milliseconds since Unix epoch (Date.now()). BIGINT — overflows integer around 1973.
	timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
	actorUid: text('actor_uid').notNull(),
	actorRole: text('actor_role').notNull(),
	actorPhoneEmail: text('actor_phone_email'),
	action: text('action').notNull(),
	targetResourceId: text('target_resource_id').notNull(),
	stateDelta: jsonb('state_delta'),
	deltaSha: text('delta_sha').notNull(),
	chainedPriorHash: text('chained_prior_hash').notNull(),
	cryptographicHash: text('cryptographic_hash').notNull(),
}, (t) => ({
	tenantTsIdx: index('idx_audit_tenant_ts').on(t.tenantId, t.timestamp),
}));

// ─── Policies (Rego source — ADR-0012) ────────────────────────────────────────
// UI-authored Rego policies live here. System default policies live as files
// in policies/stadium/*.rego. The build step compiles both into a single
// WASM bundle. Empty in v1; populated by M10 (Policies UI tab).

export const policiesTable = pgTable('policies', {
	name: text('name').primaryKey(),
	description: text('description').notNull().default(''),
	source: text('source').notNull(),
	enabled: boolean('enabled').notNull().default(true),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	updatedBy: uuid('updated_by').references(() => usersTable.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Convenience re-exports ───────────────────────────────────────────────────

export const schema = {
	tenants: tenantsTable,
	users: usersTable,
	roles: rolesTable,
	rolePermissions: rolePermissionsTable,
	tenantMemberships: tenantMembershipsTable,
	userPermissions: userPermissionsTable,
	staffRoster: staffRosterTable,
	incidents: incidentsTable,
	dispatches: dispatchesTable,
	otpSessions: otpSessionsTable,
	config: configTable,
	auditLedger: auditLedgerTable,
	policies: policiesTable,
};

export type Database = typeof import('drizzle-orm/node-postgres').drizzle;
