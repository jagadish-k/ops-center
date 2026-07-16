/**
 * Local development orchestrator.
 *
 * Flow:
 *   1. Pre-flight: check Docker + Netlify CLI are installed
 *   2. Setup: ensure .env exists with all required values (auto-generates JWT keys)
 *   3. Database: docker compose up -d, then poll until Postgres accepts connections
 *   4. Migrate: apply any pending schema migrations (idempotent)
 *   5. Serve: spawn "netlify dev" (frontend + API functions on :8888)
 *   6. Cleanup: on Ctrl+C, kill netlify dev but leave Docker running (fast restart)
 *
 * Usage: npm run dev
 */
import { spawn, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const C = {
	reset: '\x1b[0m',
	dim: '\x1b[2m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m',
	bold: '\x1b[1m',
};

function log(icon: string, msg: string): void {
	console.log(`${C.dim}→${C.reset} ${icon} ${msg}`);
}

function ok(msg: string): void {
	console.log(`${C.green}  ✓${C.reset} ${msg}`);
}

function fail(msg: string): never {
	console.error(`${C.red}  ✘${C.reset} ${msg}`);
	process.exit(1);
}

function checkCommand(cmd: string): boolean {
	try {
		execSync(`${cmd} --version`, { stdio: 'pipe' });
		return true;
	} catch {
		return false;
	}
}

// ─── Step 1: Pre-flight checks ─────────────────────────────────────────────────

function preflight(): void {
	console.log(`\n${C.bold}${C.cyan}  Stadium Ops — Local Dev${C.reset}\n`);

	log('🔍', 'Checking prerequisites...');

	if (!checkCommand('docker')) {
		fail('Docker is not installed. Install from https://docker.com');
	}
	ok('Docker installed');

	try {
		execSync('docker info', { stdio: 'pipe' });
	} catch {
		fail('Docker daemon is not running. Start Docker Desktop and try again.');
	}
	ok('Docker daemon running');

	if (!checkCommand('netlify')) {
		fail('Netlify CLI is not installed. Run: npm install -g netlify-cli');
	}
	ok('Netlify CLI installed');
}

// ─── Step 2: Environment setup ─────────────────────────────────────────────────

async function setupEnvironment(): Promise<void> {
	log('⚙️ ', 'Setting up .env...');

	const { setupEnv } = await import('./setup-env.js');
	const result = setupEnv();

	if (result.generated.length > 0) {
		ok('Generated RSA 2048 keypair for JWT signing');
	}
	if (result.configured.length > 0) {
		ok(`Configured: ${result.configured.join(', ')}`);
	}
	if (result.generated.length === 0 && result.configured.length === 0) {
		ok('.env already configured');
	}
}

// ─── Step 3: Start Postgres via Docker Compose ─────────────────────────────────

async function startDatabase(): Promise<void> {
	log('🐳', 'Starting Postgres...');

	try {
		execSync('docker compose up -d', { stdio: 'pipe', cwd: process.cwd() });
	} catch {
		fail('Failed to start Docker Compose. Check docker-compose.yml.');
	}

	// Poll until Postgres accepts connections.
	const maxAttempts = 60;
	const intervalMs = 500;

	for (let i = 1; i <= maxAttempts; i++) {
		try {
			execSync('docker exec stad-ops-db pg_isready -U postgres -d stadium_ops', {
				stdio: 'pipe',
			});
			ok(`Postgres ready (attempt ${i}/${maxAttempts})`);
			return;
		} catch {
			await sleep(intervalMs);
		}
	}

	fail(`Postgres did not become ready within ${(maxAttempts * intervalMs) / 1000}s`);
}

// ─── Step 4: Run migrations ────────────────────────────────────────────────────

function runMigrations(): void {
	log('📦', 'Running migrations...');

	try {
		execSync('npx tsx database/migrate.ts', { stdio: 'pipe', cwd: process.cwd() });
		ok('Migrations applied');
	} catch {
		fail('Migration failed. Check DATABASE_URL in .env and that Postgres is running.');
	}
}

// ─── Step 5: Start netlify dev ─────────────────────────────────────────────────

function startDevServer(): void {
	console.log();
	log('🚀', 'Starting netlify dev...');
	console.log();

	const child = spawn('netlify', ['dev'], {
		stdio: 'inherit',
		cwd: process.cwd(),
		env: process.env,
	});

	// Forward Ctrl+C to the child, then exit.
	// Docker stays running for fast restart.
	process.on('SIGINT', () => {
		child.kill('SIGINT');
	});

	process.on('SIGTERM', () => {
		child.kill('SIGTERM');
	});

	child.on('exit', (code) => {
		console.log(`\n${C.dim}  Dev server stopped. Docker container left running.${C.reset}`);
		console.log(`${C.dim}  Run ${C.reset}npm run dev:db:stop${C.dim} to stop Postgres.${C.reset}\n`);
		process.exit(code ?? 0);
	});
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	preflight();
	await setupEnvironment();
	await startDatabase();
	runMigrations();
	startDevServer();
}

main().catch((err) => {
	console.error(`${C.red}\n  Unexpected error:${C.reset}`, err);
	process.exit(1);
});
