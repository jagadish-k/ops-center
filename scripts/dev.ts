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
import 'dotenv/config';
import { spawn, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync } from 'node:fs';

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
      execSync(
        'docker exec stad-ops-db pg_isready -U postgres -d stadium_ops',
        {
          stdio: 'pipe',
        },
      );
      ok(`Postgres ready (attempt ${i}/${maxAttempts})`);
      return;
    } catch {
      await sleep(intervalMs);
    }
  }

  fail(
    `Postgres did not become ready within ${(maxAttempts * intervalMs) / 1000}s`,
  );
}

// ─── Step 4: Run migrations ────────────────────────────────────────────────────

function runMigrations(): void {
  log('📦', 'Running migrations...');

  try {
    execSync('npx drizzle-kit push', { stdio: 'inherit', cwd: process.cwd() });
    ok('Migrations applied');
  } catch {
    console.error('\n');
    fail(
      `Migration failed. Check DATABASE_URL in .env (current: ${process.env.DATABASE_URL ?? 'NOT SET'})`,
    );
  }
}

// ─── Step 4b: Run seed (idempotent) ───────────────────────────────────────────

function runSeed(): void {
  log('🌱', 'Running seed...');

  try {
    execSync('npx tsx database/seed.ts', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    ok('Seed applied');
  } catch {
    console.error('\n');
    fail('Seed failed. See output above.');
  }
}

// ─── Step 4c: Clean stale Netlify build artifacts ────────────────────────────

function cleanNetlifyArtifacts(): void {
  log('🧹', 'Cleaning stale Netlify build artifacts...');

  // The @netlify/vite-plugin-react-router generates a server-function stub at
  // .netlify/v1/functions/react-router-server.mjs that imports
  // `build/server/index.js`. In SPA mode (ssr: false), that bundle is never
  // produced, so the stub fails to load and breaks netlify dev. Delete it
  // before each dev start so netlify dev loads only our actual API functions.
  try {
    execSync(
      'rm -rf .netlify/v1 .netlify/functions-serve .netlify/functions-internal build/server 2>/dev/null',
      { stdio: 'pipe', cwd: process.cwd() },
    );
    ok('Stale artifacts cleared');
  } catch {
    // Best-effort cleanup — don't fail the dev start if rm errors.
    ok('No stale artifacts (clean slate)');
  }
}

// ─── Step 4d: Kill any orphan processes on dev ports ─────────────────────────

function killOrphanDevProcesses(): void {
  // If a previous npm run dev crashed or Ctrl+C didn't propagate cleanly,
  // vite (5173) or netlify dev (8888) may still be bound. Kill them so the
  // new run gets the expected ports instead of bumping to 5174/8889.
  const ports = [5173, 8888];
  let killedAny = false;
  for (const port of ports) {
    try {
      // `lsof -ti :PORT` returns PIDs of processes bound to the port.
      const pids = execSync(`lsof -ti :${port} 2>/dev/null`, {
        stdio: ['pipe', 'pipe', 'ignore'],
      })
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean);
      for (const pid of pids) {
        try {
          process.kill(Number(pid), 'SIGKILL');
          killedAny = true;
        } catch {
          // Process may have already exited.
        }
      }
    } catch {
      // No process on this port — that's the happy path.
    }
  }
  if (killedAny) {
    ok('Killed orphan dev processes on 5173/8888');
  }
}

// ─── Step 5: Start dev servers (vite + netlify dev in parallel) ──────────────

/**
 * Reads vite.config.ts to detect the actual scheme + host the UI will use.
 * Falls back to http://localhost:5173 if detection fails.
 *
 * Returns the URL to print for the user plus a one-liner about the API proxy.
 *
 * Detection rules:
 *   - HTTPS is on if EITHER `https: true`/`https: {` is set OR the
 *     `vite-plugin-mkcert` is imported (it auto-enables HTTPS).
 *   - Custom host: looks for `host: '...'` inside the server block.
 */
function detectViteUrl(): { viteUrl: string; apiProxyNote: string } {
  try {
    const config = readFileSync('vite.config.ts', 'utf8');

    const hasMkcert = /vite-plugin-mkcert/.test(config);
    const hasExplicitHttps = /https:\s*(true|{)/.test(config);
    const isHttps = hasMkcert || hasExplicitHttps;
    const scheme = isHttps ? 'https' : 'http';

    // Match host: 'something' inside server block; skip hmr.host.
    // Use the first occurrence in `server:` scope (hmr is nested deeper).
    const hostMatch = config.match(
      /server:\s*{[\s\S]*?\n\t+host:\s*['"]([^'"]+)['"]/,
    );
    const host = hostMatch?.[1] ?? 'localhost';

    const url = `${scheme}://${host}:5173/`;
    const note = isHttps
      ? 'HTTPS self-signed (mkcert) — accept the browser warning. Vite proxies /api → netlify dev.'
      : 'Vite proxies /api → netlify dev automatically.';
    return { viteUrl: url, apiProxyNote: note };
  } catch {
    return {
      viteUrl: 'http://localhost:5173/',
      apiProxyNote: 'Vite proxies /api → netlify dev automatically.',
    };
  }
}

interface Child {
  process: ReturnType<typeof spawn>;
  label: string;
  color: string;
}

function prefixStream(child: Child): void {
  const { process: proc, label, color } = child;
  const prefix = `${color}${C.dim}[${label}]${C.reset} `;
  const prefixErr = `${color}${C.dim}[${label}]${C.reset} `;

  proc.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    // Skip noisy ECONNREFUSED proxy warnings (vite proxy when API not up yet).
    if (text.includes('ECONNREFUSED')) return;
    process.stdout.write(
      text
        .split('\n')
        .map((line) => (line.length > 0 ? prefix + line + '\n' : ''))
        .join(''),
    );
  });

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    if (text.includes('ECONNREFUSED')) return;
    process.stderr.write(
      text
        .split('\n')
        .map((line) => (line.length > 0 ? prefixErr + line + '\n' : ''))
        .join(''),
    );
  });
}

function startDevServers(): void {
  console.log();
  log('🚀', 'Starting vite (UI) + netlify dev (API) in parallel...');

  // Detect vite's scheme/host from vite.config.ts so we print the URL the
  // browser actually needs (mkcert setups use https + custom domain).
  const { viteUrl, apiProxyNote } = detectViteUrl();
  console.log(`  ${C.dim}UI:${C.reset}  ${viteUrl}`);
  console.log(`  ${C.dim}API:${C.reset} http://localhost:8888/api/*`);
  console.log(`  ${C.dim}${apiProxyNote}${C.reset}`);
  console.log();
  console.log(
    `${C.dim}  Note: netlify dev's spinner output is buffered when piped; if the${C.reset}`,
  );
  console.log(
    `${C.dim}  terminal looks 'stuck' after vite is ready, the stack is up. Open${C.reset}`,
  );
  console.log(
    `${C.dim}  the UI URL in your browser — both servers are running in parallel.${C.reset}`,
  );
  console.log();

  const children: Child[] = [];

  // Spawn each child as its own process group (`detached: true`) so we can
  // later kill the entire tree (including grandchildren like the actual
  // `node vite` process that `npx vite` spawns) with `process.kill(-pid)`.
  // Without this, Ctrl+C kills the npx wrapper but leaves vite itself
  // running, leaking port 5173 and forcing the next run to 5174, 5175...

  // Vite — UI dev server on 5173.
  const vite = spawn('npx', ['vite', '--port', '5173', '--host'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const viteChild: Child = { process: vite, label: 'vite', color: C.cyan };
  prefixStream(viteChild);
  children.push(viteChild);

  // Netlify dev — API functions on 8888. Started in parallel; takes longer.
  const netlify = spawn('netlify', ['dev', '--port', '8888'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const netlifyChild: Child = {
    process: netlify,
    label: 'api',
    color: C.green,
  };
  prefixStream(netlifyChild);
  children.push(netlifyChild);

  const killAll = (signal: NodeJS.Signals = 'SIGTERM'): void => {
    for (const child of children) {
      try {
        // Negative PID kills the entire process group (child + all
        // descendants — e.g., the actual vite process under npx).
        process.kill(-child.process.pid!, signal);
      } catch {
        // Process group leader already dead — try direct kill as fallback.
        try {
          child.process.kill(signal);
        } catch {
          // Already gone — ignore.
        }
      }
    }
  };

  // Forward Ctrl+C to both children, then exit.
  // Docker stays running for fast restart.
  process.on('SIGINT', () => {
    killAll('SIGINT');
    // Give them a moment to flush, then SIGKILL anything still alive.
    setTimeout(() => killAll('SIGKILL'), 500);
  });

  process.on('SIGTERM', () => {
    killAll('SIGTERM');
    setTimeout(() => killAll('SIGKILL'), 500);
  });

  // If either dies, kill the other and exit (don't leave half a stack running).
  for (const child of children) {
    child.process.on('exit', (code, signal) => {
      console.log(
        `\n${C.dim}  [${child.label}] exited (code=${code ?? 'null'} signal=${signal ?? 'null'}).${C.reset}`,
      );
      // Give the sibling a moment to flush, then kill it.
      setTimeout(() => {
        killAll('SIGTERM');
        console.log(
          `\n${C.dim}  All dev servers stopped. Docker container left running.${C.reset}`,
        );
        console.log(
          `${C.dim}  Run ${C.reset}npm run dev:db:stop${C.dim} to stop Postgres.${C.reset}\n`,
        );
        process.exit(code ?? 0);
      }, 300);
    });
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  preflight();
  await setupEnvironment();
  await startDatabase();
  runMigrations();
  runSeed();
  cleanNetlifyArtifacts();
  killOrphanDevProcesses();
  startDevServers();
}

main().catch((err) => {
  console.error(`${C.red}\n  Unexpected error:${C.reset}`, err);
  process.exit(1);
});
