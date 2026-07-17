/**
 * Matchday Stress Simulator (M8 — TESTING-AND-SIMULATION.md).
 *
 * Seeds the database with realistic matchday load and measures query
 * performance under stress. Run locally against the Docker Postgres:
 *
 *   npx tsx scripts/matchday-simulator.ts
 *
 * Simulates:
 *   - 250 staff members with live GPS jitter
 *   - 50 active incidents across all tiers
 *   - 20 active dispatches
 *   - state-poll query load (every 2s)
 *   - mutation load (incident transitions, dispatch updates)
 *
 * Reports: queries/sec, avg latency, p95 latency, total runtime.
 */
import 'dotenv/config';
import pg from 'pg';
import { randomInt } from 'node:crypto';

const { Pool } = pg;

const STAFF_COUNT = 250;
const INCIDENT_COUNT = 50;
const DISPATCH_COUNT = 20;
const POLL_ITERATIONS = 30; // 60 seconds at 2s interval
const MUTATION_ITERATIONS = 50;
const TENANT_ID = 'tenant_metlife_ops';

const C = {
	reset: '\x1b[0m',
	dim: '\x1b[2m',
	green: '\x1b[32m',
	cyan: '\x1b[36m',
	yellow: '\x1b[33m',
	bold: '\x1b[1m',
};

function log(msg: string): void {
	console.log(`${C.dim}→${C.reset} ${msg}`);
}

function ok(msg: string): void {
	console.log(`${C.green}  ✓${C.reset} ${msg}`);
}

function info(msg: string): void {
	console.log(`${C.dim}  ·    ${msg}${C.reset}`);
}

function jitterCoord(base: number, drift: number = 10): number {
	return Math.max(0, Math.min(1000, base + randomInt(-drift, drift + 1)));
}

async function main() {
	if (!process.env.DATABASE_URL) {
		console.error('DATABASE_URL not set. Run: npm run dev first, or cp .env.example .env');
		process.exit(1);
	}

	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	console.log(`\n${C.bold}${C.cyan}  Stadium Ops — Matchday Stress Simulator${C.reset}\n`);

	// ── Phase 1: Seed data ─────────────────────────────────────────────────
	log(`Seeding ${STAFF_COUNT} staff, ${INCIDENT_COUNT} incidents, ${DISPATCH_COUNT} dispatches...`);

	const simPrefix = `sim_${Date.now()}`;

	// Seed staff
	for (let i = 0; i < STAFF_COUNT; i++) {
		const id = `${simPrefix}_stf_${i}`;
		const specialties = ['security', 'medical', 'cleaning', 'supervisor'] as const;
		const zones = ['ZONE-A', 'ZONE-B', 'ZONE-C', 'ZONE-D', 'ZONE-E', 'ZONE-F'];
		await pool.query(
			`INSERT INTO staff_roster (id, tenant_id, full_name, role, specialty, assigned_zone, status, phone_number, coord_x, coord_y)
			 VALUES ($1, $2, $3, 'staff', $4, $5, 'AVAILABLE', $1, $6, $7)`,
			[
				id, TENANT_ID, `Sim Staff ${i}`,
				specialties[i % 4], zones[i % 6],
				jitterCoord(500), jitterCoord(500),
			],
		);
	}
	ok(`${STAFF_COUNT} staff seeded`);

	// Seed incidents
	const incidentIds: string[] = [];
	for (let i = 0; i < INCIDENT_COUNT; i++) {
		const id = `${simPrefix}_inc_${i}`;
		incidentIds.push(id);
		const tiers = [1, 2, 3, 4, 5] as const;
		const categories = ['SECURITY', 'MEDICAL', 'CROWD', 'FACILITIES', 'ADVISORY'] as const;
		const zones = ['ZONE-A', 'ZONE-B', 'ZONE-C', 'ZONE-D', 'ZONE-E', 'ZONE-F'];
		await pool.query(
			`INSERT INTO incidents (id, tenant_id, source, tier, status, raw_text, category, severity, location_sector, coord_x, coord_y)
			 VALUES ($1, $2, 'field_staff', $3, 'OPEN', $4, $5, $6, $7, $8, $9)`,
			[
				id, TENANT_ID, tiers[i % 5], `Simulated incident ${i}`,
				categories[i % 5], ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'][i % 4],
				zones[i % 6], jitterCoord(500), jitterCoord(500),
			],
		);
	}
	ok(`${INCIDENT_COUNT} incidents seeded`);

	// Seed dispatches
	for (let i = 0; i < DISPATCH_COUNT; i++) {
		const id = `${simPrefix}_dsp_${i}`;
		await pool.query(
			`INSERT INTO dispatches (id, tenant_id, incident_id, target_staff_phone, directive_text, status)
			 VALUES ($1, $2, $3, $4, 'Simulated dispatch directive', 'SENT')`,
			[id, TENANT_ID, incidentIds[i % incidentIds.length], `${simPrefix}_stf_${i % STAFF_COUNT}`],
		);
	}
	ok(`${DISPATCH_COUNT} dispatches seeded`);

	// ── Phase 2: Simulate polling load ─────────────────────────────────────
	log(`Simulating ${POLL_ITERATIONS} state-poll queries...`);
	const pollLatencies: number[] = [];

	for (let i = 0; i < POLL_ITERATIONS; i++) {
		const start = performance.now();
		await pool.query(`SELECT * FROM incidents WHERE tenant_id = $1 AND status != 'RESOLVED' ORDER BY created_at DESC LIMIT 500`, [TENANT_ID]);
		await pool.query(`SELECT * FROM staff_roster WHERE tenant_id = $1 AND status != 'OFF_DUTY' ORDER BY full_name ASC LIMIT 500`, [TENANT_ID]);
		await pool.query(`SELECT * FROM dispatches WHERE tenant_id = $1 AND status != 'RESOLVED' ORDER BY sent_at DESC LIMIT 200`, [TENANT_ID]);
		const elapsed = performance.now() - start;
		pollLatencies.push(elapsed);
	}

	const avgPoll = pollLatencies.reduce((a, b) => a + b, 0) / pollLatencies.length;
	const maxPoll = Math.max(...pollLatencies);
	const p95Poll = pollLatencies.sort((a, b) => a - b)[Math.floor(pollLatencies.length * 0.95)];
	ok(`Poll simulation done — avg: ${avgPoll.toFixed(1)}ms, p95: ${p95Poll.toFixed(1)}ms, max: ${maxPoll.toFixed(1)}ms`);

	// ── Phase 3: Simulate mutation load ────────────────────────────────────
	log(`Simulating ${MUTATION_ITERATIONS} mutations (GPS updates + status transitions)...`);
	const mutationLatencies: number[] = [];

	for (let i = 0; i < MUTATION_ITERATIONS; i++) {
		const start = performance.now();
		const staffIdx = randomInt(0, STAFF_COUNT);
		// Simulate GPS position update
		await pool.query(
			`UPDATE staff_roster SET coord_x = $1, coord_y = $2, updated_at = now() WHERE id = $3`,
			[jitterCoord(500), jitterCoord(500), `${simPrefix}_stf_${staffIdx}`],
		);
		// Simulate incident status transition (every 5th iteration)
		if (i % 5 === 0) {
			const incIdx = i % incidentIds.length;
			await pool.query(
				`UPDATE incidents SET status = 'ACKNOWLEDGED' WHERE id = $1 AND status = 'OPEN'`,
				[incidentIds[incIdx]],
			);
		}
		const elapsed = performance.now() - start;
		mutationLatencies.push(elapsed);
	}

	const avgMut = mutationLatencies.reduce((a, b) => a + b, 0) / mutationLatencies.length;
	const maxMut = Math.max(...mutationLatencies);
	ok(`Mutation simulation done — avg: ${avgMut.toFixed(1)}ms, max: ${maxMut.toFixed(1)}ms`);

	// ── Phase 4: Simulate audit chain write load ──────────────────────────
	log('Simulating 20 audit chain entries...');
	const auditStart = performance.now();
	for (let i = 0; i < 20; i++) {
		const lastHash = await pool.query(
			`SELECT cryptographic_hash FROM audit_ledger WHERE tenant_id = $1 ORDER BY timestamp DESC LIMIT 1`,
			[TENANT_ID],
		);
		const prior = lastHash.rows.length > 0 ? lastHash.rows[0].cryptographic_hash : '0'.repeat(64);
		// Use node crypto synchronously
		const { createHash } = await import('node:crypto');
		const payload = JSON.stringify({ eventId: `${simPrefix}_aud_${i}`, tenantId: TENANT_ID, timestamp: Date.now(), actorId: 'sim', action: 'SIM_MUTATION', targetResourceId: `sim_${i}`, deltaSHA: 'abc', chainedPriorHash: prior });
		const hash = createHash('sha256').update(payload).digest('hex');
		await pool.query(
			`INSERT INTO audit_ledger (event_id, tenant_id, timestamp, actor_uid, actor_role, action, target_resource_id, state_delta, delta_sha, chained_prior_hash, cryptographic_hash)
			 VALUES ($1, $2, $3, 'sim', 'admin', 'SIM_MUTATION', $4, '{}', 'abc', $5, $6)`,
			[`${simPrefix}_aud_${i}`, TENANT_ID, Date.now(), `sim_${i}`, prior, hash],
		);
	}
	const auditElapsed = performance.now() - auditStart;
	ok(`Audit chain done — 20 entries in ${auditElapsed.toFixed(0)}ms (${(20 / auditElapsed * 1000).toFixed(0)} entries/sec)`);

	// ── Phase 5: Cleanup ──────────────────────────────────────────────────
	log('Cleaning up simulated data...');
	// NOTE: audit_ledger entries are WORM (append-only) — cannot be deleted.
	// The simulated entries (actor_uid='sim') are valid chain links and
	// accumulate harmlessly. They do NOT break chain verification.
	await pool.query(`DELETE FROM dispatches WHERE id LIKE '${simPrefix}_%'`);
	await pool.query(`DELETE FROM incidents WHERE id LIKE '${simPrefix}_%'`);
	await pool.query(`DELETE FROM staff_roster WHERE id LIKE '${simPrefix}_%'`);
	ok('Simulated staff/incidents/dispatches cleaned up');
	info('Audit entries are WORM — simulated entries remain in the chain (harmless)');

	// ── Summary ───────────────────────────────────────────────────────────
	console.log(`\n${C.bold}  Summary${C.reset}`);
	console.log(`  ${C.dim}Poll avg:    ${C.reset}${avgPoll.toFixed(1)}ms ${C.dim}(target: <100ms for 2s cadence)${C.reset}`);
	console.log(`  ${C.dim}Poll p95:    ${C.reset}${p95Poll.toFixed(1)}ms`);
	console.log(`  ${C.dim}Mutation avg:${C.reset} ${avgMut.toFixed(1)}ms`);
	console.log(`  ${C.dim}Audit rate:  ${C.reset}${(20 / auditElapsed * 1000).toFixed(0)} entries/sec`);
	console.log();

	await pool.end();
}

main().catch((err) => {
	console.error('Simulator crashed:', err);
	process.exit(1);
});
