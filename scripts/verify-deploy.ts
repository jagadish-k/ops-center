/**
 * Production Deploy Verification (M8).
 *
 * Verifies that all infrastructure is correctly configured before going live.
 * Run after deploying to Netlify:
 *
 *   npx tsx scripts/verify-deploy.ts
 *
 * Or against a local dev server:
 *
 *   npx tsx scripts/verify-deploy.ts --local
 */
import 'dotenv/config';

const C = {
	reset: '\x1b[0m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
};

const isLocal = process.argv.includes('--local');
const baseUrl = isLocal ? 'http://localhost:8888' : (process.env.DEPLOY_URL ?? 'https://stadium-ops.netlify.app');

let passed = 0;
let failed = 0;

function ok(msg: string): void {
	passed++;
	console.log(`${C.green}  PASS${C.reset} ${msg}`);
}

function fail(msg: string): void {
	failed++;
	console.log(`${C.red}  FAIL${C.reset} ${msg}`);
}

function info(msg: string): void {
	console.log(`${C.dim}  ·${C.reset}    ${msg}`);
}

async function check(label: string, fn: () => Promise<boolean>): Promise<void> {
	try {
		const result = await fn();
		if (result) ok(label);
		else fail(label);
	} catch (err) {
		fail(`${label} — ${err instanceof Error ? err.message : err}`);
	}
}

async function main() {
	console.log(`\n${C.bold}${C.cyan}  Stadium Ops — Deploy Verification${C.reset}`);
	console.log(`${C.dim}  Target: ${baseUrl}${C.reset}\n`);

	// ── Environment variables ──────────────────────────────────────────────
	console.log(`${C.bold}  Environment Variables${C.reset}`);

	const requiredVars = [
		'DATABASE_URL',
		'JWT_PRIVATE_KEY',
		'JWT_PUBLIC_KEY',
	];

	for (const key of requiredVars) {
		await check(`${key} is set`, async () => !!process.env[key]);
	}

	const optionalVars = [
		'TWILIO_ACCOUNT_SID',
		'TWILIO_AUTH_TOKEN',
		'TWILIO_FROM_NUMBER',
		'OPENAI_API_KEY',
		'GEMINI_API_KEY',
		'CORS_ALLOWED_ORIGINS',
	];

	for (const key of optionalVars) {
		const isSet = !!process.env[key];
		if (isSet) ok(`${key} is set`);
		else info(`${key} not set (optional — dev mode will emulate)`);
	}

	// ── Database connectivity ──────────────────────────────────────────────
	console.log(`\n${C.bold}  Database${C.reset}`);

	if (process.env.DATABASE_URL) {
		await check('Postgres connection works', async () => {
			const pg = (await import('pg')).default;
			const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
			try {
				await pool.query('SELECT 1');
				return true;
			} finally {
				await pool.end();
			}
		});

		await check('All migrations applied', async () => {
			const pg = (await import('pg')).default;
			const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
			try {
				const result = await pool.query(`
					SELECT COUNT(*) as count FROM information_schema.tables
					WHERE table_name IN ('tenants', 'staff_roster', 'incidents', 'dispatches', 'otp_sessions', 'config', 'audit_ledger')
				`);
				return parseInt(result.rows[0].count) === 7;
			} finally {
				await pool.end();
			}
		});

		await check('Seed data present', async () => {
			const pg = (await import('pg')).default;
			const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
			try {
				const result = await pool.query(`SELECT COUNT(*) as count FROM staff_roster`);
				return parseInt(result.rows[0].count) > 0;
			} finally {
				await pool.end();
			}
		});
	}

	// ── API endpoints ──────────────────────────────────────────────────────
	console.log(`\n${C.bold}  API Endpoints${C.reset}`);

	await check('Auth request-otp endpoint responds', async () => {
		const res = await fetch(`${baseUrl}/api/auth/request-otp`, { method: 'OPTIONS' });
		return res.ok;
	});

	await check('State-poll endpoint rejects unauthenticated', async () => {
		const res = await fetch(`${baseUrl}/api/state-poll`, { method: 'POST', body: '{}' });
		return res.status === 401;
	});

	await check('Mutations endpoint rejects unauthenticated', async () => {
		const res = await fetch(`${baseUrl}/api/mutations`, { method: 'POST', body: '{}' });
		return res.status === 401;
	});

	await check('Audit-ledger endpoint rejects unauthenticated', async () => {
		const res = await fetch(`${baseUrl}/api/audit-ledger`, { method: 'GET' });
		return res.status === 401;
	});

	// ── JWT keys ───────────────────────────────────────────────────────────
	console.log(`\n${C.bold}  JWT Keys${C.reset}`);

	if (process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY) {
		await check('JWT sign + verify roundtrip', async () => {
			const { generateKeyPairSync } = await import('node:crypto');
			const { SignJWT, jwtVerify, importPKCS8, importSPKI } = await import('jose');

			const privPem = process.env.JWT_PRIVATE_KEY!.replace(/\\n/g, '\n');
			const pubPem = process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n');

			const privKey = await importPKCS8(privPem, 'RS256');
			const pubKey = await importSPKI(pubPem, 'RS256');

			const token = await new SignJWT({ role: 'admin', tenantId: 'test' })
				.setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
				.setIssuedAt()
				.setExpirationTime('1h')
				.setIssuer('stadium-ops')
				.setAudience('stadium-ops-clients')
				.sign(privKey);

			const { payload } = await jwtVerify(token, pubKey, {
				issuer: 'stadium-ops',
				audience: 'stadium-ops-clients',
			});

			return payload.role === 'admin';
		});
	}

	// ── Summary ────────────────────────────────────────────────────────────
	console.log(`\n${C.bold}  Summary${C.reset}`);
	console.log(`  ${C.green}${passed} passed${C.reset}, ${C.red}${failed} failed${C.reset}`);
	if (failed > 0) {
		console.log(`\n  ${C.red}Deployment verification failed. Fix the issues above.${C.reset}\n`);
		process.exit(1);
	} else {
		console.log(`\n  ${C.green}All checks passed. Ready for operations.${C.reset}\n`);
	}
}

main().catch((err) => {
	console.error('Verification crashed:', err);
	process.exit(1);
});
