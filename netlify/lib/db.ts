/**
 * Shared Postgres connection + Drizzle ORM instance for Netlify Functions.
 *
 * Replaces the raw `pg.Pool` query helper (ADR-0014). The underlying Pool is
 * preserved (connection pooling is still needed for Netlify Functions); a
 * Drizzle `db` instance wraps it for type-safe queries.
 *
 * Usage in functions:
 *   import { db } from '../lib/db';
 *   import { usersTable } from '../../database/schema';
 *   const rows = await db.select().from(usersTable).where(eq(usersTable.phone, phone));
 *
 * The Pool is reused across warm function invocations (Netlify keeps the
 * container warm between requests). A cold start creates a new one.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../database/schema.ts';

const { Pool } = pg;

const globalForPg = globalThis as typeof globalThis & { __pgPool?: pg.Pool; __drizzleDb?: ReturnType<typeof drizzle> };

const pool: pg.Pool =
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

/**
 * Drizzle ORM instance. Use this for all queries. Type-safe against
 * `database/schema.ts` (the single source of truth, ADR-0014).
 */
export const db =
	globalForPg.__drizzleDb ?? drizzle(pool, { schema });

if (process.env.NODE_ENV !== 'production') {
	globalForPg.__drizzleDb = db;
}

/** Underlying Pool — exported for migration tooling and explicit cleanup. */
export { pool };
