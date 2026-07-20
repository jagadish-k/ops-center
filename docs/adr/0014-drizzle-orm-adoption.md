# ADR-0014: Drizzle ORM Adoption (Replaces Raw `pg` Query Helper)

## Status

Accepted — replaces the raw `pg.Pool` query helper in `netlify/lib/db.ts`
and the bespoke migration runner in `database/migrate.ts` with the canonical
Drizzle ORM stack (`drizzle-orm` + `drizzle-kit`). Wipes legacy raw-SQL
migrations and consolidates them into one Drizzle-generated initial
migration.

## Context

The codebase today uses:

- `pg@8.22.0` for the Postgres driver (via `netlify/lib/db.ts`).
- A bespoke migration runner (`database/migrate.ts`) that reads `.sql`
  files in lexical order and tracks applied migrations in a `_migrations`
  table.
- Three hand-written SQL migrations: `0001_init.sql`,
  `0002_gps_tracking.sql`, `0003_audit_ledger.sql`.
- Inline `query<T>(sql, params)` calls in 12+ locations across
  `netlify/lib/` and `netlify/functions/`.

The migration runner's own header comment says:

> Note: This is a lightweight local-dev runner. For production hardening
> (Milestone 8), consider adopting drizzle-kit or node-pg-migrate.

Milestone 8 shipped without that adoption. The platform owner has
explicitly refused to continue writing raw SQL.

### Problems with the current setup

1. **Schema drift.** The Drizzle schema and the migration SQL are two
   separate sources of truth. They can — and do — drift.
2. **No type safety.** `query<T>(sql, params)` returns whatever `T` the
   caller claims. There is no compile-time check that the SQL matches the
   schema.
3. **Hand-rolled migration ordering.** Lexical filename ordering works but
   offers no dependency graph, no down-migrations, no introspection.
4. **Hard to evolve.** Adding a column means writing the migration SQL,
   updating `src/types/index.ts` to match, and updating every call site.
   Drizzle generates the SQL from TS schema changes; types flow from the
   schema.

## Decision

Adopt **both halves** of the Drizzle stack (full adoption, H3):

- `drizzle-orm` for queries (replaces `query<T>(sql, params)`)
- `drizzle-kit` for migrations (replaces the bespoke runner)

And **wipe the legacy migrations** (M1 strategy):

- Delete `database/migrations/0001_init.sql`,
  `0002_gps_tracking.sql`, `0003_audit_ledger.sql`.
- Define the full schema in `database/schema.ts`.
- Run `drizzle-kit generate` to produce one consolidated
  `database/migrations/0000_initial.sql`.
- Wipe local dev databases via `npm run dev:db:reset`.

### Directory layout

```
database/
  schema.ts              ← Drizzle TS schema (source of truth)
  migrations/            ← drizzle-kit output
    meta/
    0000_initial.sql
    ...
  seed.ts                ← idempotent data seed (tenants, users, roles)
  seed-superadmin.ts     ← superadmin upsert from SUPERADMIN_PHONE env
  migrate.ts             ← thin wrapper around drizzle-orm/migrator
drizzle.config.ts        ← drizzle-kit config (schema path, dialect, out)
```

### Configuration (`drizzle.config.ts`)

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './database/schema.ts',
  out: './database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;
```

### Migration runner (`database/migrate.ts`)

```ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('✘ DATABASE_URL is not set.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './database/migrations' });
  await pool.end();
}

main().catch((err) => {
  console.error('✘ Migration failed:', err);
  process.exit(1);
});
```

### Query helper (`netlify/lib/db.ts`)

The Pool is preserved (connection pooling is still needed for Netlify
Functions). The query helper is replaced by a Drizzle instance:

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../database/schema';

const { Pool } = pg;

const globalForPg = globalThis as typeof globalThis & { __pgPool?: pg.Pool };
const pool: pg.Pool = globalForPg.__pgPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

if (process.env.NODE_ENV !== 'production') {
  globalForPg.__pgPool = pool;
}

export const db = drizzle(pool, { schema });
```

Call sites change from `query<T>(sql, params)` to typed Drizzle queries:

```ts
// Before
const rows = await query<UserRow>(
  `SELECT id, phone, global_role FROM users WHERE phone = $1`,
  [phoneNumber],
);

// After
const rows = await db.select()
  .from(users)
  .where(eq(users.phone, phoneNumber))
  .execute();
```

### Migration strategy (M1 — wipe)

The platform is pre-production. Dev databases contain only seeded test
data. Wiping is safe.

- `npm run dev:db:reset` wipes the Docker volume.
- The next `npm run dev` invokes `database/migrate.ts`, which applies the
  single consolidated `0000_initial.sql`.
- The seed script runs as a post-migration step.

If a production deploy with real data ever exists, M1 is unsafe and must
be replaced with M2 (replay legacy, then layer new migrations). Today M1
is correct.

### npm scripts (updated `package.json`)

```json
{
  "scripts": {
    "dev": "tsx scripts/dev.ts",
    "dev:db": "docker compose up -d",
    "dev:db:stop": "docker compose down",
    "dev:db:reset": "docker compose down -v && docker compose up -d",
    "build": "npm run prebuild && tsc -b && vite build",
    "prebuild": "tsx scripts/build-policies.ts",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run && bin/opa test policies/",
    "test:watch": "vitest",
    "test:policy": "bin/opa test policies/",
    "db:migrate": "tsx database/migrate.ts",
    "db:seed": "tsx database/seed.ts",
    "db:seed-superadmin": "tsx database/seed-superadmin.ts",
    "db:generate": "drizzle-kit generate",
    "db:studio": "drizzle-kit studio",
    "simulate": "tsx scripts/matchday-simulator.ts",
    "verify:deploy": "tsx scripts/verify-deploy.ts"
  }
}
```

### New dependencies

- `drizzle-orm` — query builder + migrator runtime
- `drizzle-kit` (devDep) — schema → SQL generator, studio UI
- `@open-policy-agent/opa-wasm` — see ADR-0012

`pg` stays as the underlying driver (Drizzle's `node-postgres` adapter
wraps it).

## Consequences

**Positive:**

- Schema lives in one TS file. Migrations are generated.
- Type-safe queries: refactoring a column name breaks the build, not the
  runtime.
- `drizzle-kit studio` provides a local DB browser.
- The migration runner is maintained by the Drizzle team, not us.
- New developers learn one mental model (TS schema), not two (TS types +
  SQL migrations).

**Negative:**

- All 12+ `query<T>(sql, params)` call sites must be rewritten. This is
  ~1 day of mechanical work undertaken in M9.1.
- Drizzle adds ~200KB to the function bundle. Negligible.
- `drizzle-kit generate` produces SQL that is not human-friendly by
  default (uses `CREATE TABLE` with full type signatures). Reviewable
  but verbose.
- Migration rollbacks are not automatic. Drizzle generates up-migrations
  only; down-migrations are manual if ever needed.

**Tradeoff accepted:** mechanical rewrite of every query in exchange for
type safety, single source of truth, and no hand-written SQL.

## Reference

- Depends on: ADR-0010 (schema shape), ADR-0011 (RBAC tables), ADR-0012
  (policies table)
- Replaces: `database/migrate.ts` (legacy runner), `netlify/lib/db.ts`
  (raw `pg` helper)
- Schema source of truth: `database/schema.ts`
- Migration runner: `database/migrate.ts` (rewritten)
- Scripts updated: `scripts/dev.ts`, `package.json`
