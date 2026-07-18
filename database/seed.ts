/**
 * Idempotent seed script — populates the database with the canonical
 * demo/test dataset.
 *
 * Implements the seed matrix from the plan §A.16 / ADR-0011 §System roles:
 *   - 3 tenants (metlife, sofi, hardrock) with bounding boxes
 *   - 4 system roles (superadmin, admin, manager, staff) with permission maps
 *   - 6 users exercising every role + cross-tenant membership
 *   - 1 per-user permission grant (audit:view on Beta Medical Triage)
 *   - 1 operational-window config row (open for 30 days)
 *
 * Usage:
 *   npm run db:seed                 # full seed
 *   npm run db:seed-superadmin      # superadmin only (subset)
 *
 * All inserts use ON CONFLICT DO NOTHING — safe to run repeatedly.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { eq, sql } from 'drizzle-orm';
import {
	tenantsTable,
	usersTable,
	rolesTable,
	rolePermissionsTable,
	tenantMembershipsTable,
	userPermissionsTable,
	staffRosterTable,
	incidentsTable,
	configTable,
} from './schema.ts';
import { seedSuperadmin } from './seed-superadmin.ts';

import { METLIFE_MAP_LAYOUT } from '../src/lib/map-layout.ts';

const { Pool } = pg;

// ─── Permission catalog (must match src/lib/permissions.ts Permission union) ──

export const PERMISSIONS = [
	'incident:create',
	'incident:transition',
	'incident:read',
	'dispatch:create',
	'dispatch:update',
	'dispatch:read',
	'tenant:switch',
	'tenant:manage',
	'staff:manage',
	'staff:reassign',
	'role:assign-admin',
	'audit:view',
	'surface:control-room',
	'surface:field-client',
	'config:manage',
] as const;

// ─── Role → permission matrix (ADR-0011 §System roles) ────────────────────────

const ROLE_MATRIX: Record<string, readonly string[]> = {
	admin: [
		'audit:view',
		'dispatch:create',
		'dispatch:read',
		'dispatch:update',
		'incident:create',
		'incident:read',
		'incident:transition',
		'staff:manage',
		'staff:reassign',
		'surface:control-room',
	],
	manager: [
		'dispatch:create',
		'dispatch:read',
		'dispatch:update',
		'incident:create',
		'incident:read',
		// incident:transition is granted at the flat level so the ABAC policy
		// (ADR-0012) can restrict managers to tier 4-5. Without this grant,
		// the flat check rejects before ABAC runs.
		'incident:transition',
		'staff:reassign',
		'surface:control-room',
	],
	staff: [
		'dispatch:read',
		'dispatch:update',
		'incident:create',
		'incident:read',
		'surface:field-client',
	],
	// Note: superadmin is global_role, not a role_permissions row.
};

const SYSTEM_ROLES: { name: string; description: string }[] = [
	{ name: 'superadmin', description: 'Global controller; bypasses tenant scoping. Granted via users.global_role.' },
	{ name: 'admin', description: 'Control Room operator scoped to one tenant.' },
	{ name: 'manager', description: 'Tenant-scoped coordinator; can reassign staff and create dispatches.' },
	{ name: 'staff', description: 'Field operative using the Field Client.' },
];

// ─── Tenants with bounding boxes (carried from legacy 0002 migration) ─────────

const TENANTS = [
	{
		id: 'tenant_metlife_ops',
		orgName: 'MetLife Stadium Ops Core',
		bboxMinLat: 40.8113, bboxMaxLat: 40.8143,
		bboxMinLng: -74.0757, bboxMaxLng: -74.0727,
	},
	{
		id: 'tenant_sofi_ops',
		orgName: 'SoFi Stadium Command Center',
		bboxMinLat: 33.9527, bboxMaxLat: 33.9557,
		bboxMinLng: -118.3402, bboxMaxLng: -118.3372,
	},
	{
		id: 'tenant_hardrock_ops',
		orgName: 'Hard Rock Tournament Hub',
		bboxMinLat: 25.9577, bboxMaxLat: 25.9607,
		bboxMinLng: -80.2392, bboxMaxLng: -80.2362,
	},
];

// ─── Users (per plan §A.16 dev seed + expanded roster for map testing) ───────

const DEV_USERS = [
	{ phone: '+14155552026', fullName: 'Command Coordinator' },
	{ phone: '+14155552027', fullName: 'Maya the Manager' },
	{ phone: '+14155552028', fullName: 'Mixed Role Morgan' },
	{ phone: '+14155550001', fullName: 'Alpha Security Lead' },
	{ phone: '+14155550002', fullName: 'Beta Medical Triage' },
	// Additional staff for realistic map density
	{ phone: '+14155550003', fullName: 'Gamma Security' },
	{ phone: '+14155550004', fullName: 'Delta Medical' },
	{ phone: '+14155550005', fullName: 'Echo Cleaning' },
	{ phone: '+14155550006', fullName: 'Foxtrot Supervisor' },
	{ phone: '+14155550007', fullName: 'Golf Security' },
	{ phone: '+14155550008', fullName: 'Hotel Medical' },
	{ phone: '+14155550009', fullName: 'India Cleaning' },
];

// ─── Memberships (expanded) ──────────────────────────────────────────────────

const DEV_MEMBERSHIPS = [
	{ phone: '+14155552026', tenantId: 'tenant_metlife_ops', roles: ['admin'] },
	{ phone: '+14155552027', tenantId: 'tenant_metlife_ops', roles: ['manager'] },
	{ phone: '+14155552028', tenantId: 'tenant_metlife_ops', roles: ['staff'] },
	{ phone: '+14155552028', tenantId: 'tenant_sofi_ops', roles: ['manager'] },
	{ phone: '+14155550001', tenantId: 'tenant_metlife_ops', roles: ['staff'] },
	{ phone: '+14155550002', tenantId: 'tenant_metlife_ops', roles: ['staff'] },
	{ phone: '+14155550003', tenantId: 'tenant_metlife_ops', roles: ['staff'] },
	{ phone: '+14155550004', tenantId: 'tenant_metlife_ops', roles: ['staff'] },
	{ phone: '+14155550005', tenantId: 'tenant_metlife_ops', roles: ['staff'] },
	{ phone: '+14155550006', tenantId: 'tenant_metlife_ops', roles: ['staff'] },
	{ phone: '+14155550007', tenantId: 'tenant_metlife_ops', roles: ['staff'] },
	{ phone: '+14155550008', tenantId: 'tenant_metlife_ops', roles: ['staff'] },
	{ phone: '+14155550009', tenantId: 'tenant_metlife_ops', roles: ['staff'] },
];

// ─── Staff roster with positions (spread across the 0–1000 grid) ──────────────
// coord_x/coord_y are on the 0–1000 grid. lat/lng are the raw GPS values
// (within the tenant's bounding box). status varies for realistic map display.

const DEV_ROSTER = [
	// Existing 3 (kept for backwards compat with tests) + expanded to 9 active
	{ phone: '+14155552028', tenantId: 'tenant_metlife_ops', specialty: 'security', assignedZone: 'ZONE-A', status: 'DISPATCHED', coordX: 380, coordY: 310, lat: 40.8135, lng: -74.0740 },
	{ phone: '+14155550001', tenantId: 'tenant_metlife_ops', specialty: 'security', assignedZone: 'ZONE-A', status: 'AVAILABLE', coordX: 320, coordY: 280, lat: 40.8130, lng: -74.0745 },
	{ phone: '+14155550002', tenantId: 'tenant_metlife_ops', specialty: 'medical', assignedZone: 'ZONE-B', status: 'AVAILABLE', coordX: 610, coordY: 420, lat: 40.8120, lng: -74.0735 },
	{ phone: '+14155550003', tenantId: 'tenant_metlife_ops', specialty: 'security', assignedZone: 'ZONE-C', status: 'AVAILABLE', coordX: 750, coordY: 180, lat: 40.8140, lng: -74.0730 },
	{ phone: '+14155550004', tenantId: 'tenant_metlife_ops', specialty: 'medical', assignedZone: 'ZONE-D', status: 'DISPATCHED', coordX: 540, coordY: 640, lat: 40.8115, lng: -74.0750 },
	{ phone: '+14155550005', tenantId: 'tenant_metlife_ops', specialty: 'cleaning', assignedZone: 'ZONE-E', status: 'AVAILABLE', coordX: 720, coordY: 350, lat: 40.8128, lng: -74.0732 },
	{ phone: '+14155550006', tenantId: 'tenant_metlife_ops', specialty: 'supervisor', assignedZone: 'ZONE-F', status: 'AVAILABLE', coordX: 850, coordY: 200, lat: 40.8142, lng: -74.0728 },
	{ phone: '+14155550007', tenantId: 'tenant_metlife_ops', specialty: 'security', assignedZone: 'ZONE-B', status: 'OFF_DUTY', coordX: 580, coordY: 380, lat: 40.8122, lng: -74.0738 },
	{ phone: '+14155550008', tenantId: 'tenant_metlife_ops', specialty: 'medical', assignedZone: 'ZONE-A', status: 'AVAILABLE', coordX: 280, coordY: 540, lat: 40.8118, lng: -74.0748 },
	{ phone: '+14155550009', tenantId: 'tenant_metlife_ops', specialty: 'cleaning', assignedZone: 'ZONE-D', status: 'AVAILABLE', coordX: 500, coordY: 700, lat: 40.8113, lng: -74.0755 },
];

// ─── Per-user grants (demonstrates P1 override mechanism) ─────────────────────

const DEV_GRANTS = [
	{ phone: '+14155550002', permission: 'audit:view', grantedByPhone: '+14155552026' },
];

// ─── Seed incidents (various tiers + positions for map testing) ───────────────
// Each incident is linked to the staff member who reported it via reportedBy.
// The reportedBy field is populated during seeding by looking up the userId
// from the phone number.

const DEV_INCIDENTS = [
	{
		id: 'inc_seed_001', tenantId: 'tenant_metlife_ops',
		tier: 1, status: 'OPEN', source: 'field_staff',
		reportedByPhone: '+14155550001', // Alpha Security Lead
		rawText: 'Section 112 — crowd surge against the perimeter railing. Multiple patrons at risk of crush injury.',
		category: 'CROWD', severity: 'CRITICAL', locationSector: 'ZONE-B',
		coordX: 610, coordY: 410, actionRequired: 'Deploy riot line + triage team immediately.',
	},
	{
		id: 'inc_seed_002', tenantId: 'tenant_metlife_ops',
		tier: 2, status: 'ACKNOWLEDGED', source: 'field_staff',
		reportedByPhone: '+14155550003', // Gamma Security
		rawText: 'Physical altercation in upper deck, Section 308. Two individuals, no weapons observed.',
		category: 'SECURITY', severity: 'HIGH', locationSector: 'ZONE-D',
		coordX: 540, coordY: 630, actionRequired: 'Security team to SEC-308 to de-escalate.',
	},
	{
		id: 'inc_seed_003', tenantId: 'tenant_metlife_ops',
		tier: 3, status: 'OPEN', source: 'field_staff',
		reportedByPhone: '+14155550002', // Beta Medical Triage
		rawText: 'Unresponsive male near Gate C, possible cardiac event. AED requested.',
		category: 'MEDICAL', severity: 'HIGH', locationSector: 'ZONE-A',
		coordX: 330, coordY: 270, actionRequired: 'AED + paramedic to Gate C concourse.',
	},
	{
		id: 'inc_seed_004', tenantId: 'tenant_metlife_ops',
		tier: 4, status: 'ON_SCENE', source: 'field_staff',
		reportedByPhone: '+14155550005', // Echo Cleaning
		rawText: 'Overflowing restroom fixture causing standing water in corridor. Slip hazard.',
		category: 'FACILITIES', severity: 'MEDIUM', locationSector: 'ZONE-E',
		coordX: 720, coordY: 350, actionRequired: 'Facilities crew + wet-floor signage.',
	},
	{
		id: 'inc_seed_005', tenantId: 'tenant_metlife_ops',
		tier: 5, status: 'OPEN', source: 'field_staff',
		reportedByPhone: '+14155550008', // Hotel Medical
		rawText: 'Long concession queues at Section 200 causing congestion. Advisory only.',
		category: 'ADVISORY', severity: 'LOW', locationSector: 'ZONE-C',
		coordX: 750, coordY: 180, actionRequired: 'Monitor; open auxiliary point if congestion worsens.',
	},
	// Additional incidents for richer staff→report linkage
	{
		id: 'inc_seed_006', tenantId: 'tenant_metlife_ops',
		tier: 3, status: 'RESOLVED', source: 'field_staff',
		reportedByPhone: '+14155550001', // Alpha Security Lead
		rawText: 'Intoxicated patron escorted from Section 105. No injuries.',
		category: 'SECURITY', severity: 'MEDIUM', locationSector: 'ZONE-A',
		coordX: 280, coordY: 540, actionRequired: 'Resolved — patron handed to PD.',
	},
	{
		id: 'inc_seed_007', tenantId: 'tenant_metlife_ops',
		tier: 2, status: 'ACKNOWLEDGED', source: 'field_staff',
		reportedByPhone: '+14155550004', // Delta Medical (DISPATCHED)
		rawText: 'Patron collapsed in vomitory Section 312. Delta Medical en route.',
		category: 'MEDICAL', severity: 'HIGH', locationSector: 'ZONE-D',
		coordX: 500, coordY: 700, actionRequired: 'Delta Medical dispatched. AED on standby.',
	},
	{
		id: 'inc_seed_008', tenantId: 'tenant_metlife_ops',
		tier: 4, status: 'OPEN', source: 'field_staff',
		reportedByPhone: '+14155550009', // India Cleaning
		rawText: 'Spilled beverages in concourse near Section 300. Multiple spill points.',
		category: 'FACILITIES', severity: 'LOW', locationSector: 'ZONE-D',
		coordX: 450, coordY: 680, actionRequired: 'Cleaning crew dispatched.',
	},
	{
		id: 'inc_seed_009', tenantId: 'tenant_metlife_ops',
		tier: 5, status: 'RESOLVED', source: 'field_staff',
		reportedByPhone: '+14155550006', // Foxtrot Supervisor
		rawText: 'Lost child reunited with family at Guest Services. No further action needed.',
		category: 'ADVISORY', severity: 'LOW', locationSector: 'ZONE-F',
		coordX: 850, coordY: 200, actionRequired: 'Resolved.',
	},
	{
		id: 'inc_seed_010', tenantId: 'tenant_metlife_ops',
		tier: 1, status: 'ACKNOWLEDGED', source: 'field_staff',
		reportedByPhone: '+14155552028', // Mixed Role Morgan (DISPATCHED)
		rawText: 'Structural crack observed in railing at Section 112 upper level. Immediate evacuation risk.',
		category: 'FACILITIES', severity: 'CRITICAL', locationSector: 'ZONE-A',
		coordX: 380, coordY: 310, actionRequired: 'Evacuate Section 112 upper. Engineering assessment.',
	},
];

// ─── Seed runner ──────────────────────────────────────────────────────────────

export async function seed(db: ReturnType<typeof drizzle>): Promise<void> {
	// 1. Tenants
	console.log('  → Tenants...');
	await db
		.insert(tenantsTable)
		.values(TENANTS)
		.onConflictDoNothing({ target: tenantsTable.id })
		.execute();

	// 2. System roles
	console.log('  → System roles...');
	await db
		.insert(rolesTable)
		.values(SYSTEM_ROLES.map((r) => ({ ...r, isSystem: true })))
		.onConflictDoUpdate({
			target: rolesTable.name,
			set: { description: sql`EXCLUDED.description`, isSystem: true },
		})
		.execute();

	// 3. Role → permission mappings
	console.log('  → Role permissions...');
	const rolePermRows = Object.entries(ROLE_MATRIX).flatMap(([role, perms]) =>
		perms.map((p) => ({ roleName: role, permissionName: p })),
	);
	for (const row of rolePermRows) {
		await db
			.insert(rolePermissionsTable)
			.values(row)
			.onConflictDoNothing()
			.execute();
	}

	// 4. Superadmin (from env var)
	console.log('  → Superadmin (from SUPERADMIN_PHONE env)...');
	await seedSuperadmin(db);

	// 5. Dev users
	console.log('  → Dev users...');
	await db
		.insert(usersTable)
		.values(DEV_USERS.map((u) => ({ ...u, globalRole: 'member' as const, authProvider: 'phone_otp' as const })))
		.onConflictDoUpdate({
			target: usersTable.phone,
			set: { fullName: sql`EXCLUDED.full_name` },
		})
		.execute();

	// 6. Memberships — need user IDs first
	console.log('  → Tenant memberships...');
	const allUsers = await db.select().from(usersTable).execute();
	const phoneToId = new Map(allUsers.map((u) => [u.phone, u.id]));
	for (const m of DEV_MEMBERSHIPS) {
		const userId = phoneToId.get(m.phone);
		if (!userId) {
			console.warn(`    ⚠ skipping membership for unknown phone ${m.phone}`);
			continue;
		}
		await db
			.insert(tenantMembershipsTable)
			.values({ userId, tenantId: m.tenantId, roles: m.roles })
			.onConflictDoUpdate({
				target: [tenantMembershipsTable.userId, tenantMembershipsTable.tenantId],
				set: { roles: m.roles, updatedAt: new Date() },
			})
			.execute();
	}

	// 7. Staff roster (with positions for map visualization)
	console.log('  → Staff roster...');
	for (const r of DEV_ROSTER) {
		const userId = phoneToId.get(r.phone);
		if (!userId) continue;
		await db
			.insert(staffRosterTable)
			.values({
				userId,
				tenantId: r.tenantId,
				specialty: r.specialty,
				assignedZone: r.assignedZone,
				phoneNumber: r.phone,
				status: (r as { status?: string }).status ?? 'AVAILABLE',
				coordX: (r as { coordX?: number }).coordX,
				coordY: (r as { coordY?: number }).coordY,
				latitude: (r as { lat?: number }).lat,
				longitude: (r as { lng?: number }).lng,
			})
			.onConflictDoUpdate({
				target: [staffRosterTable.userId, staffRosterTable.tenantId],
				set: {
					specialty: r.specialty,
					assignedZone: r.assignedZone,
					phoneNumber: r.phone,
					status: (r as { status?: string }).status ?? 'AVAILABLE',
					coordX: (r as { coordX?: number }).coordX,
					coordY: (r as { coordY?: number }).coordY,
					latitude: (r as { lat?: number }).lat,
					longitude: (r as { lng?: number }).lng,
				},
			})
			.execute();
	}

	// 8. Per-user grants
	console.log('  → Per-user grants...');
	for (const g of DEV_GRANTS) {
		const userId = phoneToId.get(g.phone);
		const grantedBy = phoneToId.get(g.grantedByPhone);
		if (!userId || !grantedBy) continue;
		await db
			.insert(userPermissionsTable)
			.values({ userId, permissionName: g.permission, grantedBy })
			.onConflictDoNothing()
			.execute();
	}

	// 9. Seed incidents (for map visualization + staff→report linkage)
	console.log('  → Seed incidents...');
	for (const inc of DEV_INCIDENTS) {
		const reportedBy = inc.reportedByPhone ? (phoneToId.get(inc.reportedByPhone) ?? null) : null;
		// Strip the helper field before insert.
		const { reportedByPhone, ...incData } = inc;
		void reportedByPhone;
		await db
			.insert(incidentsTable)
			.values({
				...incData,
				reportedBy,
			})
			.onConflictDoNothing()
			.execute();
	}

	// 10. Map layouts (multi-floor zone/POI config per tenant)
	console.log('  → Map layouts...');
	await db
		.update(tenantsTable)
		.set({ mapLayout: METLIFE_MAP_LAYOUT as never })
		.where(eq(tenantsTable.id, 'tenant_metlife_ops'))
		.execute();

	// 11. Operational config
	console.log('  → Operational config...');
	await db
		.insert(configTable)
		.values({
			id: 'switch',
			windowStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
			windowEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			operational: true,
		})
		.onConflictDoNothing()
		.execute();

	console.log('✔ Seed complete.');
}

// CLI entrypoint
async function main(): Promise<void> {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		console.error('✘ DATABASE_URL is not set.');
		process.exit(1);
	}

	const pool = new Pool({ connectionString });
	const db = drizzle(pool);

	try {
		console.log('▶ Seeding database...');
		await seed(db);
	} catch (err) {
		console.error('✘ Seed failed:', err instanceof Error ? err.message : err);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
	main();
}
