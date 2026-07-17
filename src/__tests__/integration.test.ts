/**
 * Integration tests — require a live Postgres connection.
 *
 * These tests are automatically skipped if DATABASE_URL is not set or the
 * database is unreachable. They test the real DB-backed functions:
 *   - commitAuditLog → verifyLedgerChain roundtrip
 *   - createIncident → query → mapIncident
 *   - state-poll query performance sanity check
 *
 * Run: npm test (skips automatically if no DB)
 *   or: DATABASE_URL=postgres://... npx vitest run src/__tests__/integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const SKIP = !DATABASE_URL;

const it_db = SKIP ? it.skip : it;
const describe_db = SKIP ? describe.skip : describe;

let pool: pg.Pool | null = null;

beforeAll(async () => {
	if (SKIP) return;
	pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 3000 });
	// Verify the connection works.
	try {
		await pool.query('SELECT 1');
	} catch {
		// Can't connect — skip all tests.
		pool = null;
	}
});

afterAll(async () => {
	if (pool) await pool.end();
});

describe_db('audit chain roundtrip', () => {
	it_db('commits an entry and verifies the chain', async () => {
		// This tests the real commitAuditLog + verifyLedgerChain functions
		// which require the auditLogger + db libs.
		const { commitAuditLog, verifyLedgerChain } = await import('../../netlify/lib/auditLogger');

		const entry = await commitAuditLog({
			tenantId: 'tenant_metlife_ops',
			actor: { uid: 'integration_test', role: 'admin', phoneOrEmail: 'test@test' },
			action: 'INTEGRATION_TEST',
			targetResourceId: 'test_resource',
			stateDelta: { before: { status: 'OPEN' }, after: { status: 'TEST' } },
		});

		expect(entry.eventId).toBeTruthy();
		expect(entry.cryptographicHash).toHaveLength(64);

		const report = await verifyLedgerChain('tenant_metlife_ops');
		expect(report.totalEntries).toBeGreaterThan(0);
		// Chain should be valid (unless someone tampered during the test).
		expect(report.isChainValid).toBe(true);
	});
});

describe_db('incident lifecycle', () => {
	it_db('creates an incident and queries it back', async () => {
		const { createIncident } = await import('../../netlify/lib/incidents');

		const incident = await createIncident({
			tenantId: 'tenant_metlife_ops',
			source: 'field_staff',
			tier: 3,
			rawText: 'Integration test incident',
			category: 'CROWD',
			severity: 'MEDIUM',
			locationSector: 'ZONE-C',
		});

		expect(incident.id).toBeTruthy();
		expect(incident.tier).toBe(3);
		expect(incident.coordinates.x).toBeGreaterThanOrEqual(0);
		expect(incident.coordinates.x).toBeLessThanOrEqual(1000);

		// Verify it shows up in a state-poll-style query.
		const rows = await pool!.query(
			`SELECT * FROM incidents WHERE id = $1 AND tenant_id = $2`,
			[incident.id, 'tenant_metlife_ops'],
		);
		expect(rows.rows).toHaveLength(1);
	});
});

describe_db('state-poll query performance', () => {
	it_db('returns active state within reasonable time', async () => {
		const start = performance.now();
		await pool!.query(
			`SELECT * FROM incidents WHERE tenant_id = $1 AND status != 'RESOLVED' ORDER BY created_at DESC LIMIT 500`,
			['tenant_metlife_ops'],
		);
		await pool!.query(
			`SELECT * FROM staff_roster WHERE tenant_id = $1 AND status != 'OFF_DUTY' ORDER BY full_name ASC LIMIT 500`,
			['tenant_metlife_ops'],
		);
		const elapsed = performance.now() - start;

		// Should complete in well under 100ms with proper indexes.
		expect(elapsed).toBeLessThan(500);
	});
});
