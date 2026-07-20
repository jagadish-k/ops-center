/**
 * Matchday Stress Simulator (updated for ADR-0010+ schema).
 *
 * Seeds the database with realistic matchday load and measures query
 * performance under stress. Run locally against the Docker Postgres:
 *
 *   npx tsx scripts/matchday-simulator.ts                          # default tenant
 *   npx tsx scripts/matchday-simulator.ts --tenant tenant_sofi_ops # specific tenant
 *   npx tsx scripts/matchday-simulator.ts --count 50               # fewer incidents
 *
 * Simulates:
 *   - N staff members with live GPS jitter (creates users + memberships + roster)
 *   - M active incidents across all tiers (linked to simulated staff)
 *   - state-poll query load (every 2s)
 *
 * Reports: queries/sec, avg latency, p95 latency, total runtime.
 *
 * Usage:  npm run simulate  [-- --tenant <id> --count <n>]
 */
import 'dotenv/config';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Pool } = pg;

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let TENANT_ID = 'tenant_metlife_ops';
let STAFF_COUNT = 50;
let INCIDENT_COUNT = 30;
let POLL_ITERATIONS = 15;

for (let i = 0; i < args.length; i++) {
	if (args[i] === '--tenant' && args[i + 1]) TENANT_ID = args[i + 1];
	if (args[i] === '--staff' && args[i + 1]) STAFF_COUNT = Number(args[i + 1]);
	if (args[i] === '--count' && args[i + 1]) INCIDENT_COUNT = Number(args[i + 1]);
	if (args[i] === '--polls' && args[i + 1]) POLL_ITERATIONS = Number(args[i + 1]);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function jitterCoord(base: number, drift = 10): number {
	return Math.max(0, Math.min(1000, base + Math.floor(Math.random() * (2 * drift + 1)) - drift));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	if (!process.env.DATABASE_URL) {
		console.error('DATABASE_URL not set. Run: npm run dev first, or cp .env.example .env');
		process.exit(1);
	}

	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	console.log(`\n${C.bold}${C.cyan}  Stadium Ops — Matchday Stress Simulator${C.reset}\n`);
	console.log(`  Tenant: ${TENANT_ID}`);
	console.log(`  Staff:  ${STAFF_COUNT}`);
	console.log(`  Incidents: ${INCIDENT_COUNT}`);
	console.log(`  Poll iterations: ${POLL_ITERATIONS}`);
	console.log('');

	const simPrefix = `sim_${Date.now()}`;
	const createdUserIds: string[] = [];
	const createdIncidentIds: string[] = [];

	try {
		// ── Phase 1: Seed staff (users + memberships + roster) ────────────────
		log(`Seeding ${STAFF_COUNT} staff...`);

		const specialties = ['security', 'medical', 'cleaning', 'supervisor'] as const;
		const zones = ['ZONE-A', 'ZONE-B', 'ZONE-C', 'ZONE-D', 'ZONE-E', 'ZONE-F'];

		for (let i = 0; i < STAFF_COUNT; i++) {
			const userId = randomUUID();
			const phone = `+1${simPrefix.slice(-7)}${String(i).padStart(3, '0')}`;
			createdUserIds.push(userId);

			// Create user
			await pool.query(
				`INSERT INTO users (id, phone, full_name, global_role, status, auth_provider)
				 VALUES ($1, $2, $3, 'member', 'active', 'phone_otp')`,
				[userId, phone, `Sim Staff ${i}`],
			);

			// Create membership
			await pool.query(
				`INSERT INTO tenant_memberships (user_id, tenant_id, roles)
				 VALUES ($1, $2, '{staff}')`,
				[userId, TENANT_ID],
			);

			// Create roster entry with position
			await pool.query(
				`INSERT INTO staff_roster (user_id, tenant_id, specialty, assigned_zone, status, phone_number, coord_x, coord_y, latitude, longitude)
				 VALUES ($1, $2, $3, $4, 'AVAILABLE', $5, $6, $7, $8, $9)`,
				[
					userId, TENANT_ID,
					specialties[i % 4], zones[i % 6],
					phone,
					jitterCoord(500, 300), jitterCoord(500, 300),
					40.81 + Math.random() * 0.01, -74.07 + Math.random() * 0.01,
				],
			);
		}
		ok(`${STAFF_COUNT} staff seeded`);

		// ── Phase 2: Seed incidents ───────────────────────────────────────────
		log(`Seeding ${INCIDENT_COUNT} incidents...`);

		const tiers = [1, 2, 3, 4, 5] as const;
		const categories = ['SECURITY', 'MEDICAL', 'CROWD', 'FACILITIES', 'ADVISORY'] as const;
		const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
		const statuses = ['OPEN', 'ACKNOWLEDGED', 'ON_SCENE'] as const;

		for (let i = 0; i < INCIDENT_COUNT; i++) {
			const incId = `${simPrefix}_inc_${i}`;
			const reporterIdx = i % createdUserIds.length;
			createdIncidentIds.push(incId);

			await pool.query(
				`INSERT INTO incidents (id, tenant_id, source, tier, status, raw_text, category, severity, location_sector, coord_x, coord_y, reported_by)
				 VALUES ($1, $2, 'field_staff', $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
				[
					incId, TENANT_ID,
					tiers[i % 5], statuses[i % 3],
					`Simulated incident ${i} — ${categories[i % 5]} at ${zones[i % 6]}`,
					categories[i % 5], severities[i % 4], zones[i % 6],
					jitterCoord(500, 300), jitterCoord(500, 300),
					createdUserIds[reporterIdx],
				],
			);
		}
		ok(`${INCIDENT_COUNT} incidents seeded`);

		// ── Phase 3: Poll latency test ────────────────────────────────────────
		log(`Running ${POLL_ITERATIONS} state-poll iterations...`);

		const latencies: number[] = [];
		for (let i = 0; i < POLL_ITERATIONS; i++) {
			const start = performance.now();
			const result = await pool.query(
				`SELECT * FROM incidents WHERE tenant_id = $1 AND status != 'RESOLVED' ORDER BY tier, created_at DESC LIMIT 500`,
				[TENANT_ID],
			);
			const staffResult = await pool.query(
				`SELECT * FROM staff_roster WHERE tenant_id = $1 AND status != 'OFF_DUTY' LIMIT 500`,
				[TENANT_ID],
			);
			const elapsed = performance.now() - start;
			latencies.push(elapsed);
			void result; void staffResult;
		}

		latencies.sort((a, b) => a - b);
		const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
		const p95 = latencies[Math.floor(latencies.length * 0.95)];

		ok(`Poll test complete`);
		info(`Avg latency: ${avg.toFixed(1)}ms`);
		info(`P95 latency: ${p95.toFixed(1)}ms`);
		info(`Queries/sec: ${(1000 / avg).toFixed(1)}`);

		// ── Phase 4: Mutation test ────────────────────────────────────────────
		log(`Running mutation test (10 incident transitions)...`);

		const mutLatencies: number[] = [];
		for (let i = 0; i < 10 && i < createdIncidentIds.length; i++) {
			const start = performance.now();
			await pool.query(
				`UPDATE incidents SET status = 'ACKNOWLEDGED' WHERE id = $1`,
				[createdIncidentIds[i]],
			);
			mutLatencies.push(performance.now() - start);
		}

		if (mutLatencies.length > 0) {
			const mutAvg = mutLatencies.reduce((s, v) => s + v, 0) / mutLatencies.length;
			ok(`Mutation test complete`);
			info(`Avg mutation latency: ${mutAvg.toFixed(1)}ms`);
		}

		// ── Summary ──────────────────────────────────────────────────────────
		console.log(`\n${C.bold}${C.green}  ✔ Simulation complete.${C.reset}\n`);
		info(`Total staff in tenant: ${STAFF_COUNT + 10} (seed + sim)`);
		info(`Total incidents in tenant: ${INCIDENT_COUNT + 8} (seed + sim)`);
		info(`Simulated data prefix: ${simPrefix}`);
		console.log(`\n${C.dim}  To clean up: DELETE FROM users WHERE id IN ${C.reset}`);
		console.log(`${C.dim}    (SELECT id FROM users WHERE full_name LIKE 'Sim Staff %')${C.reset}`);
		console.log(`${C.dim}  Or run: npm run dev:db:reset && npm run dev${C.reset}\n`);

	} catch (err) {
		console.error(`\n${C.yellow}  Simulator crashed:${C.reset}`, err);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

main();
