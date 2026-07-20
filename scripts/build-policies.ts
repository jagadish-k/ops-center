/**
 * Compiles Rego policies to a WebAssembly bundle for in-process evaluation
 * by Netlify Functions.
 *
 * Source:   policies/stadium/*.rego
 * Output:   policies/dist/policy.wasm  (raw WASM, ready for @open-policy-agent/opa-wasm)
 *
 * The bundle is produced as a tar.gz by `opa build -t wasm` and then
 * extracted to obtain the raw .wasm file (the npm package expects raw bytes,
 * not a tarball).
 *
 * Usage:  npm run build:policies
 * Requires: bin/opa (install via `./scripts/install-opa.sh`)
 *
 * See ADR-0012 for the build pipeline rationale.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OPA_BIN = join(ROOT, 'bin', 'opa');
const POLICIES_DIR = join(ROOT, 'policies', 'stadium');
const DIST_DIR = join(ROOT, 'policies', 'dist');
const BUNDLE_TGZ = join(DIST_DIR, 'bundle.tar.gz');
const OUTPUT_WASM = join(DIST_DIR, 'policy.wasm');
const ENTRYPOINT = 'stadium/authz/allow';

async function main(): Promise<void> {
	// 1. Verify OPA binary is present.
	if (!existsSync(OPA_BIN)) {
		console.error('✘ OPA binary not found at bin/opa. Run ./scripts/install-opa.sh first.');
		process.exit(1);
	}

	mkdirSync(DIST_DIR, { recursive: true });

	// 2. Invoke `opa build -t wasm -e stadium/authz/allow policies/stadium/`.
	console.log(`→ Compiling Rego policies → WASM (entrypoint: ${ENTRYPOINT})...`);
	const result = spawnSync(
		OPA_BIN,
		['build', '-t', 'wasm', '-e', ENTRYPOINT, POLICIES_DIR, '-o', BUNDLE_TGZ],
		{ stdio: 'pipe', cwd: ROOT },
	);

	if (result.status !== 0) {
		console.error('✘ opa build failed:');
		console.error(result.stderr?.toString() ?? '(no stderr)');
		console.error(result.stdout?.toString() ?? '(no stdout)');
		process.exit(1);
	}

	console.log(`  ✓ Bundle built: ${BUNDLE_TGZ}`);

	// 3. Extract policy.wasm from the tarball.
	// Use system tar. GNU tar stores entries with leading '/' which it strips
	// automatically; we re-extract into the dist dir.
	console.log('→ Extracting policy.wasm from bundle...');
	const extract = spawnSync('tar', ['-xzf', BUNDLE_TGZ, '-C', DIST_DIR, '--strip-components=0', 'policy.wasm'], {
		stdio: 'pipe',
	});

	if (extract.status !== 0) {
		// Fall back: extract everything, then move policy.wasm into place.
		const extractAll = spawnSync('tar', ['-xzf', BUNDLE_TGZ, '-C', DIST_DIR], { stdio: 'pipe' });
		if (extractAll.status !== 0) {
			console.error('✘ tar extract failed:');
			console.error(extract.stderr?.toString() ?? '(no stderr)');
			process.exit(1);
		}
	}

	if (!existsSync(OUTPUT_WASM)) {
		console.error(`✘ Expected output not found: ${OUTPUT_WASM}`);
		console.error('Contents of dist dir:');
		const ls = spawnSync('ls', ['-la', DIST_DIR], { stdio: 'inherit' });
		void ls;
		process.exit(1);
	}

	const stats = statSize(OUTPUT_WASM);
	console.log(`  ✓ Extracted: ${OUTPUT_WASM} (${stats})`);

	// 4. Clean up the tarball (raw .wasm is all we keep).
	rmSync(BUNDLE_TGZ, { force: true });

	console.log('✔ Policy build complete.');
}

function statSize(file: string): string {
	const bytes = readFileSync(file).length;
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

main().catch((err) => {
	console.error('✘ build-policies crashed:', err);
	process.exit(1);
});
