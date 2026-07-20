/**
 * POST /api/admin/policies
 *
 * Superadmin-only policy management (ADR-0012 §Policy sources). Actions:
 *
 *   { action: 'list' }                                      // tenant:manage
 *   { action: 'get', name }                                 // tenant:manage
 *   { action: 'create', name, description, source }         // tenant:manage
 *   { action: 'update', name, source?, description? }       // tenant:manage
 *   { action: 'delete', name }                              // tenant:manage
 *   { action: 'test', source, input }                       // tenant:manage
 *
 * - `list` returns DB-stored policies only. System policies (committed files
 *   in policies/stadium/*.rego) are listed as read-only with source="---"
 *   so the UI can show them but not edit.
 * - `test` compiles + evaluates the provided Rego source against the input.
 *   Uses the OPA binary via a subprocess; 5-second timeout per eval.
 *
 * Requires the `tenant:manage` permission (superadmin only per ADR-0011).
 *
 * NOTE on `rebuild`: this v1 does NOT support runtime rebuild from the UI.
 * Rebuilds happen via `npm run build:policies` at deploy time. A future
 * iteration can add a CI trigger or scheduled rebuild.
 */
import { type Config } from '@netlify/functions';
import { authorizeRequest, authResponse } from '../lib/auth.ts';
import {
	authorizeAdminOp,
	AdminHttpError,
	adminErrorResponse,
	auditWrite,
} from '../lib/admin-helpers.ts';
import { db } from '../lib/db.ts';
import { policiesTable } from '../../database/schema.ts';
import { eq } from 'drizzle-orm';
import { jsonResponse, handlePreflight, badRequest, serverError } from '../lib/http.ts';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

// ─── Action handlers ─────────────────────────────────────────────────────────

async function listPolicies(claims: JwtClaimsLike) {
	authorizeAdminOp(claims, 'tenant:manage');

	const rows = await db
		.select({
			name: policiesTable.name,
			description: policiesTable.description,
			source: policiesTable.source,
			enabled: policiesTable.enabled,
			updatedAt: policiesTable.updatedAt,
			updatedBy: policiesTable.updatedBy,
		})
		.from(policiesTable)
		.execute();

	// Merge with system policies (file-only, read-only). For v1 we expose just
	// the well-known system policy name; reading file contents would require
	// the function to know the repo layout.
	const system = [{ name: 'stadium/authz', description: 'System default policy bundle', source: '--- read-only (see policies/stadium/authz.rego) ---', enabled: true, updatedAt: null, updatedBy: null, isSystem: true }];

	return jsonResponse({
		policies: [
			...system,
			...rows.map((r) => ({ ...r, isSystem: false })),
		],
	});
}

async function createPolicy(claims: JwtClaimsLike, body: { name: string; description: string; source: string }) {
	authorizeAdminOp(claims, 'tenant:manage');

	if (!body.name || !body.description || !body.source) {
		throw new AdminHttpError(400, 'bad_request', 'name, description, and source are required.');
	}
	if (!/^[a-z][a-z0-9/_-]*$/i.test(body.name)) {
		throw new AdminHttpError(400, 'bad_request', 'name must match /^[a-z][a-z0-9/_-]*$/i (use slashes for namespacing, e.g. "stadium/audit").');
	}

	await db
		.insert(policiesTable)
		.values({
			name: body.name,
			description: body.description,
			source: body.source,
			enabled: true,
			updatedBy: claims.sub,
		})
		.execute();

	await auditWrite({
		claims,
		tenantId: claims.tenant_id,
		action: 'POLICY_CREATE',
		targetResourceId: body.name,
		stateDelta: { before: null, after: { description: body.description, sourceLength: body.source.length } },
	});

	return jsonResponse({ name: body.name, created: true });
}

async function updatePolicy(claims: JwtClaimsLike, body: { name: string; source?: string; description?: string }) {
	authorizeAdminOp(claims, 'tenant:manage');

	if (!body.name) throw new AdminHttpError(400, 'bad_request', 'name is required.');

	const existing = await db
		.select()
		.from(policiesTable)
		.where(eq(policiesTable.name, body.name))
		.execute();
	if (existing.length === 0) {
		throw new AdminHttpError(404, 'not_found', `Policy not found: ${body.name}`);
	}

	const updates: Record<string, unknown> = { updatedAt: new Date(), updatedBy: claims.sub };
	if (body.source !== undefined) updates.source = body.source;
	if (body.description !== undefined) updates.description = body.description;

	await db
		.update(policiesTable)
		.set(updates)
		.where(eq(policiesTable.name, body.name))
		.execute();

	await auditWrite({
		claims,
		tenantId: claims.tenant_id,
		action: 'POLICY_UPDATE',
		targetResourceId: body.name,
		stateDelta: {
			before: { description: existing[0]!.description, sourceLength: existing[0]!.source.length },
			after: { description: body.description ?? existing[0]!.description, sourceLength: body.source?.length ?? existing[0]!.source.length },
		},
	});

	return jsonResponse({ name: body.name, updated: true });
}

async function deletePolicy(claims: JwtClaimsLike, body: { name: string }) {
	authorizeAdminOp(claims, 'tenant:manage');

	if (!body.name) throw new AdminHttpError(400, 'bad_request', 'name is required.');

	const existing = await db
		.select()
		.from(policiesTable)
		.where(eq(policiesTable.name, body.name))
		.execute();
	if (existing.length === 0) {
		throw new AdminHttpError(404, 'not_found', `Policy not found: ${body.name}`);
	}

	await db
		.delete(policiesTable)
		.where(eq(policiesTable.name, body.name))
		.execute();

	await auditWrite({
		claims,
		tenantId: claims.tenant_id,
		action: 'POLICY_DELETE',
		targetResourceId: body.name,
		stateDelta: { before: existing[0], after: null },
	});

	return jsonResponse({ name: body.name, deleted: true });
}

interface TestResult {
	ok: boolean;
	allowed?: boolean;
	error?: string;
	elapsedMs: number;
}

/**
 * Test a Rego policy by writing it to a temp file + invoking the OPA binary
 * via `opa eval`. 5-second timeout. Returns the boolean result + elapsed time.
 */
async function testPolicy(claims: JwtClaimsLike, body: { source: string; input: unknown }): Promise<Response> {
	authorizeAdminOp(claims, 'tenant:manage');

	if (!body.source || body.input === undefined) {
		throw new AdminHttpError(400, 'bad_request', 'source and input are required.');
	}

	const opaBin = join(process.cwd(), 'bin', 'opa');
	if (!existsSync(opaBin)) {
		throw new AdminHttpError(500, 'no_opa', 'OPA binary not found at bin/opa. Run scripts/install-opa.sh.');
	}

	const tmpDir = mkdtempSync(join(tmpdir(), 'opa-eval-'));
	const regoPath = join(tmpDir, 'policy.rego');
	const inputPath = join(tmpDir, 'input.json');

	try {
		writeFileSync(regoPath, body.source, 'utf8');
		writeFileSync(inputPath, JSON.stringify(body.input), 'utf8');

		const startedAt = Date.now();
		const result = await new Promise<TestResult>((resolve) => {
			const child = spawn(opaBin, ['eval', '-d', regoPath, '-i', inputPath, 'data.stadium.authz.allow'], {
				stdio: ['ignore', 'pipe', 'pipe'],
				cwd: tmpDir,
			});

			let stdout = '';
			let stderr = '';
			child.stdout.on('data', (c) => { stdout += c.toString(); });
			child.stderr.on('data', (c) => { stderr += c.toString(); });

			const timer = setTimeout(() => {
				child.kill('SIGKILL');
				resolve({ ok: false, error: 'OPA eval timed out after 5s', elapsedMs: Date.now() - startedAt });
			}, 5000);

			child.on('exit', (code) => {
				clearTimeout(timer);
				const elapsedMs = Date.now() - startedAt;
				if (code !== 0) {
					resolve({ ok: false, error: stderr || `OPA exited with code ${code}`, elapsedMs });
					return;
				}
				try {
					const parsed = JSON.parse(stdout);
					const value = parsed?.result?.[0]?.expressions?.[0]?.value;
					resolve({ ok: true, allowed: value === true, elapsedMs });
				} catch (err) {
					resolve({ ok: false, error: `Failed to parse OPA output: ${err instanceof Error ? err.message : 'unknown'}`, elapsedMs });
				}
			});

			child.on('error', (err) => {
				clearTimeout(timer);
				resolve({ ok: false, error: err.message, elapsedMs: Date.now() - startedAt });
			});
		});

		return jsonResponse({ result });
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
}

// ─── Main handler ────────────────────────────────────────────────────────────

interface JwtClaimsLike {
	sub: string;
	global_role: 'superadmin' | 'member';
	permissions: string[];
	tenant_id: string;
	phone?: string;
}

export default async (request: Request): Promise<Response> => {
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	const auth = await authorizeRequest(request);
	const notOk = authResponse(auth);
	if (notOk) return notOk;
	const claims = auth.claims as JwtClaimsLike;

	try {
		const body = (await request.json()) as {
			action: string;
			name?: string;
			description?: string;
			source?: string;
			input?: unknown;
		};

		switch (body.action) {
			case 'list':
				return await listPolicies(claims);
			case 'get':
				// For v1, list returns everything; 'get' is just a passthrough.
				return await listPolicies(claims);
			case 'create':
				return await createPolicy(claims, {
					name: body.name ?? '',
					description: body.description ?? '',
					source: body.source ?? '',
				});
			case 'update':
				return await updatePolicy(claims, {
					name: body.name ?? '',
					source: body.source,
					description: body.description,
				});
			case 'delete':
				return await deletePolicy(claims, { name: body.name ?? '' });
			case 'test':
				return await testPolicy(claims, { source: body.source ?? '', input: body.input });
			default:
				return badRequest(`Unknown action: ${body.action}`);
		}
	} catch (err) {
		if (err instanceof AdminHttpError) {
			return adminErrorResponse(err);
		}
		console.error('admin-policies error:', err);
		return serverError('Admin operation failed.');
	}
};

export const config: Config = {
	path: '/api/admin/policies',
};
