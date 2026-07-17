/**
 * Idempotent superadmin seeder.
 *
 * Reads `SUPERADMIN_PHONE` from the environment and upserts a user with
 * `global_role = 'superadmin'`. Per ADR-0010 §Superadmin Bootstrap and
 * ADR-0014 §Migration strategy (M1+M2):
 *
 *   - Safe to run repeatedly (idempotent upsert).
 *   - Re-asserts global_role on each run (in case the row was demoted).
 *   - Removing the env var does NOT demote an existing superadmin. To
 *     demote, update the users table directly.
 *   - The same `seedSuperadmin()` function is called from `database/seed.ts`
 *     (post-migration step) and from `npm run db:seed-superadmin` (CLI).
 *
 * Usage:  npm run db:seed-superadmin
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { usersTable } from './schema.ts';

const { Pool } = pg;

const DEFAULT_SUPERADMIN_PHONE = '+14155550000';
const DEFAULT_SUPERADMIN_NAME = 'Default Superadmin';

export async function seedSuperadmin(
	db: ReturnType<typeof drizzle>,
	phoneOverride?: string,
): Promise<{ phone: string; created: boolean }> {
	const phone = phoneOverride ?? process.env.SUPERADMIN_PHONE ?? DEFAULT_SUPERADMIN_PHONE;

	// Upsert: create the user if missing, assert superadmin role either way.
	const result = await db
		.insert(usersTable)
		.values({
			phone,
			fullName: DEFAULT_SUPERADMIN_NAME,
			globalRole: 'superadmin',
			authProvider: 'phone_otp',
		})
		.onConflictDoUpdate({
			target: usersTable.phone,
			set: { globalRole: 'superadmin', updatedAt: new Date() },
		})
		.returning({ id: usersTable.id });

	return { phone, created: result.length > 0 };
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
		const result = await seedSuperadmin(db);
		console.log(`✔ Superadmin ensured: phone=${result.phone}`);
	} catch (err) {
		console.error('✘ seed-superadmin failed:', err instanceof Error ? err.message : err);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

// Run if invoked directly via `tsx database/seed-superadmin.ts`.
// Avoid running when imported by seed.ts.
if (process.argv[1] && process.argv[1].endsWith('seed-superadmin.ts')) {
	main();
}
