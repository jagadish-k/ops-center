# ADR-0009: Audit Ledger in Postgres with Append-Only Triggers (Not Netlify Blobs)

## Status

Accepted — amends [ADR-0005](0005-tamper-evident-audit-chain.md) §Decision item 2
(storage medium).

## Context

ADR-0005 specified that the SHA-256 audit chain would be stored in **Netlify
Blobs** at key `audit/{tenantId}/{eventId}`, keeping it out of the mutable
relational store.

During M6 implementation, two practical issues emerged:

1. **Local development friction.** Netlify Blobs requires a linked Netlify
   site and the `@netlify/blobs` package. For local dev with Docker Postgres
   (no Netlify site linked), Blobs is unavailable — the audit pipeline would
   be untestable locally.

2. **Operational complexity.** Maintaining a chain-head pointer in Blobs
   (`audit/{tenantId}/_head`) introduces race conditions and additional
   read-before-write latency on every mutation. Postgres can enforce the chain
   within the same transaction as the mutation.

## Decision

Store the audit chain in a dedicated **`audit_ledger` table in Postgres** with
**append-only triggers** that reject `UPDATE` and `DELETE`:

```sql
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_ledger
    FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_ledger
    FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
```

The trigger function raises an exception:

```sql
RAISE EXCEPTION 'audit_ledger is append-only (WORM)';
```

This means:
- Application code can only `INSERT` (create new entries).
- Any attempt to modify or delete a historical entry fails at the database level.
- A DBA with PostgreSQL superuser access can bypass triggers (`ALTER TABLE ...
  DISABLE TRIGGER`), but this action is itself auditable in PostgreSQL logs.

The SHA-256 chain computation, verification logic, and tamper-evidence
guarantees from ADR-0005 remain unchanged — only the storage medium differs.

## Consequences

**Positive:**

- No `@netlify/blobs` dependency or linked-site requirement for local dev.
- The audit INSERT runs in the same logical flow as the mutation — no
  cross-store consistency concerns.
- The `verifyLedgerChain()` query is a single SQL `SELECT ... ORDER BY
  timestamp` — no need to list + sort Blobs keys.
- Works identically in Docker, Netlify, and any other Postgres provider.

**Negative:**

- **Less tamper-proof than object storage.** A PostgreSQL superuser can
  disable triggers, modify entries, and re-enable triggers. ADR-0005 already
  acknowledged the system is "tamper-evident, not tamper-proof" — Postgres
  triggers are consistent with that stance.
- **No native retention lock.** Unlike S3 Object Lock, nothing prevents a
  superuser from `TRUNCATE audit_ledger`. Mitigation: PostgreSQL query logging
  + off-site backups of the audit table.

**Upgrade path:** If legal-grade immutability is ever required, add a nightly
mirror job that copies new `audit_ledger` rows to object storage with retention
policies (AWS S3 Object Lock). The chain format is storage-agnostic.

**Amends:** ADR-0005 §Decision item 2 — replace "Netlify Blobs" with "Postgres
`audit_ledger` table with append-only triggers." All other ADR-0005 decisions
(server-side hashing, chain format, tamper-evident verification) remain
unchanged.

## Reference

- Migration: `database/migrations/0003_audit_ledger.sql`
- Logger: `netlify/lib/auditLogger.ts`
- Verifier endpoint: `netlify/functions/audit-ledger.ts`
- Performance: 945 entries/sec measured by `npm run simulate`
