/**
 * Shared Postgres connection pool for Netlify Functions.
 *
 * Uses a single Pool instance reused across function invocations to avoid
 * connection storms. Configured via DATABASE_URL (ADR-0002).
 */
import pg from 'pg';

const { Pool } = pg;

// Reuse the pool across warm function invocations (Netlify keeps the
// container warm between requests). A cold start creates a new one.
const globalForPg = globalThis as typeof globalThis & { __pgPool?: pg.Pool };

export const pool: pg.Pool =
	globalForPg.__pgPool ??
	new Pool({
		connectionString: process.env.DATABASE_URL,
		// Netlify Functions have a 10s default timeout — keep pool lean.
		max: 5,
		idleTimeoutMillis: 30000,
		connectionTimeoutMillis: 5000,
	});

if (process.env.NODE_ENV !== 'production') {
	globalForPg.__pgPool = pool;
}

/** Convenience query helper that returns typed rows. */
export async function query<T = Record<string, unknown>>(
	text: string,
	params?: unknown[],
): Promise<T[]> {
	const result = await pool.query(text, params);
	return result.rows as T[];
}
