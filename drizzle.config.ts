/**
 * Drizzle Kit configuration — consumes `database/schema.ts` and emits SQL
 * migrations to `database/migrations/`.
 *
 * Usage:
 *   npm run db:generate   # Generate a new migration from schema changes
 *   npm run db:migrate    # Apply pending migrations
 *   npm run db:studio     # Open Drizzle Studio (local DB browser)
 *
 * See ADR-0014 for context.
 */
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './database/schema.ts',
	out: './database/migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
	verbose: true,
	strict: true,
});
