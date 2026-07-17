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
	configTable,
} from './schema.ts';
import { seedSuperadmin } from './seed-superadmin.ts';

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

// ─── Users (per plan §A.16 dev seed) ──────────────────────────────────────────

const DEV_USERS = [
	{ phone: '+14155552026', fullName: 'Command Coordinator' },
	{ phone: '+14155552027', fullName: 'Maya the Manager' },
	{ phone: '+14155552028', fullName: 'Mixed Role Morgan' },
	{ phone: '+14155550001', fullName: 'Alpha Security Lead' },
	{ phone: '+14155550002', fullName: 'Beta Medical Triage' },
];

// ─── Memberships ──────────────────────────────────────────────────────────────

const DEV_MEMBERSHIPS = [
	{ phone: '+14155552026', tenantId: 'tenant_metlife_ops', roles: ['admin'] },
	{ phone: '+14155552027', tenantId: 'tenant_metlife_ops', roles: ['manager'] },
	{ phone: '+14155552028', tenantId: 'tenant_metlife_ops', roles: ['staff'] },
	{ phone: '+14155552028', tenantId: 'tenant_sofi_ops', roles: ['manager'] },
	{ phone: '+14155550001', tenantId: 'tenant_metlife_ops', roles: ['staff'] },
	{ phone: '+14155550002', tenantId: 'tenant_metlife_ops', roles: ['staff'] },
];

// ─── Staff roster rows (only for users who actually roam) ─────────────────────

const DEV_ROSTER = [
	{ phone: '+14155552028', tenantId: 'tenant_metlife_ops', specialty: 'security', assignedZone: 'ZONE-A' },
	{ phone: '+14155550001', tenantId: 'tenant_metlife_ops', specialty: 'security', assignedZone: 'ZONE-A' },
	{ phone: '+14155550002', tenantId: 'tenant_metlife_ops', specialty: 'medical', assignedZone: 'ZONE-B' },
];

// ─── Per-user grants (demonstrates P1 override mechanism) ─────────────────────

const DEV_GRANTS = [
	{ phone: '+14155550002', permission: 'audit:view', grantedByPhone: '+14155552026' },
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

	// 7. Staff roster
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
			})
			.onConflictDoUpdate({
				target: [staffRosterTable.userId, staffRosterTable.tenantId],
				set: {
					specialty: r.specialty,
					assignedZone: r.assignedZone,
					phoneNumber: r.phone,
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

	// 9. Operational config
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
