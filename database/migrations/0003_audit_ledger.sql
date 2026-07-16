-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0003: WORM Audit Ledger (M6 — ADR-0005, PRD §2.4/§8)
--
-- Append-only SHA-256 chained audit log. Postgres triggers enforce WORM
-- (Write-Once-Read-Many) by rejecting UPDATE and DELETE. The chain is
-- tamper-evident: any modification breaks the hash sequence, which the
-- verify-ledger endpoint detects.
--
-- ADR-0005 note: This is tamper-evident (detectable), not tamper-proof
-- (a DBA with superuser access can bypass triggers). True immutability
-- requires object-storage with retention policies (future upgrade).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_ledger (
    event_id            TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenants(id),
    timestamp           BIGINT NOT NULL,
    actor_uid           TEXT NOT NULL,
    actor_role          TEXT NOT NULL,
    actor_phone_email   TEXT,
    action              TEXT NOT NULL,
    target_resource_id  TEXT NOT NULL,
    state_delta         JSONB,
    delta_sha           TEXT NOT NULL,
    chained_prior_hash  TEXT NOT NULL,
    cryptographic_hash  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_ts ON audit_ledger (tenant_id, timestamp);

-- ── Append-only enforcement (WORM) ───────────────────────────────────────────
-- Triggers that reject UPDATE and DELETE on audit_ledger.

CREATE OR REPLACE FUNCTION reject_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_ledger is append-only (WORM) — modifications are forbidden';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_no_update ON audit_ledger;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_ledger
    FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

DROP TRIGGER IF EXISTS audit_no_delete ON audit_ledger;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_ledger
    FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
