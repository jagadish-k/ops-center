/**
 * Drizzle migration runner — applies pending migrations under
 * `database/migrations/`. Replaces the bespoke raw-SQL runner.
 *
 * Usage:  npm run db:migrate
 * Requires: DATABASE_URL in environment (.env or Netlify env)
 *
 * See ADR-0014.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const { Pool } = pg;

async function main(): Promise<void> {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		console.error('✘ DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
		process.exit(1);
	}

	const pool = new Pool({ connectionString });
	const db = drizzle(pool);

	try {
		console.log('▶ Applying pending migrations...');
		await migrate(db, { migrationsFolder: './database/migrations' });
		console.log('✔ All migrations applied.');
	} catch (err) {
		console.error('✘ Migration failed:', err instanceof Error ? err.message : err);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

main().catch((err) => {
	console.error('✘ Migration runner crashed:', err);
	process.exit(1);
});
