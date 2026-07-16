/**
 * Minimal migration runner for Netlify Postgres.
 *
 * Executes SQL files in database/migrations/ in lexical order.
 * Tracks applied migrations in a `_migrations` table.
 *
 * Usage:  npm run db:migrate
 * Requires: DATABASE_URL in environment (.env or Netlify env)
 *
 * Note: This is a lightweight local-dev runner. For production hardening
 * (Milestone 8), consider adopting drizzle-kit or node-pg-migrate.
 */
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const { Client } = pg;

const MIGRATIONS_DIR = join(process.cwd(), 'database', 'migrations');

async function main() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		console.error('✘ DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
		process.exit(1);
	}

	const client = new Client({ connectionString });
	await client.connect();

	try {
		// Ensure the migrations tracking table exists.
		await client.query(`
			CREATE TABLE IF NOT EXISTS _migrations (
				filename  TEXT PRIMARY KEY,
				applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
			);
		`);

		const files = (await readdir(MIGRATIONS_DIR))
			.filter((f) => f.endsWith('.sql'))
			.sort();

		console.log(`▶ Found ${files.length} migration file(s).`);

		for (const file of files) {
			const applied = await client.query('SELECT 1 FROM _migrations WHERE filename = $1', [file]);
			if (applied.rowCount && applied.rowCount > 0) {
				console.log(`  ✓ ${file} — already applied, skipping`);
				continue;
			}

			console.log(`  → Applying ${file}...`);
			const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
			await client.query('BEGIN');
			try {
				await client.query(sql);
				await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
				await client.query('COMMIT');
				console.log(`  ✓ ${file} — applied`);
			} catch (err) {
				await client.query('ROLLBACK');
				console.error(`  ✘ ${file} — FAILED:`, err instanceof Error ? err.message : err);
				process.exit(1);
			}
		}

		console.log('✔ All migrations complete.');
	} finally {
		await client.end();
	}
}

main().catch((err) => {
	console.error('✘ Migration runner crashed:', err);
	process.exit(1);
});
