/**
 * OPA/WASM policy evaluator (ADR-0012).
 *
 * Loads the precompiled policy.wasm bundle lazily on first call per warm
 * Netlify Function instance, caches it, and exposes a single `decide()`
 * function used by ABAC-scoped actions.
 *
 * Build pipeline:  policies/stadium/*.rego → `npm run build:policies` →
 *                  policies/dist/policy.wasm (this file).
 *
 * The 5 ABAC-scoped permissions (per ADR-0012 §v1 scope):
 *   - incident:transition  (tier-gated for managers)
 *   - incident:read        (tenant scoping)
 *   - dispatch:create      (zone-gated for managers)
 *   - dispatch:update      (self-or-permitted)
 *   - staff:reassign       (zone-gated for managers)
 *
 * All other permissions are flat booleans — checked via
 * `claims.permissions.includes(perm)` in the auth middleware (no OPA call).
 */
import { loadPolicy, type Policy } from '@open-policy-agent/opa-wasm';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ABAC_SCOPED_PERMISSIONS, type Permission } from '../../src/lib/permissions.ts';
import type { JwtClaims } from '../../src/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PolicySubject {
	user_id: string;
	global_role: 'superadmin' | 'member';
	roles: string[]; // tenant_memberships.roles for the active tenant
	tenant_id: string;
	assigned_zone?: string; // caller's roster zone (managers + staff)
	phone?: string;
}

export interface PolicyResource {
	tenant_id?: string;
	tier?: number; // for incidents (1-5)
	target_zone?: string; // for dispatch:create (manager zone check)
	source_zone?: string; // for staff:reassign (manager zone check)
	target_staff_phone?: string; // for dispatch:update self-check
}

export interface PolicyInput {
	action: Permission;
	subject: PolicySubject;
	resource: PolicyResource | null;
}

// ─── WASM bundle loader (lazy + cached per warm instance) ────────────────────

let cachedPolicy: Policy | null = null;
let loadAttempted = false;

async function getPolicy(): Promise<Policy> {
	if (cachedPolicy) return cachedPolicy;
	if (loadAttempted) {
		throw new Error('Policy WASM bundle failed to load on a previous attempt; refusing to retry. Restart the function instance.');
	}
	loadAttempted = true;

	// Try multiple paths: dev (cwd-based) and Netlify internal layout.
	const candidates = [
		join(process.cwd(), 'policies', 'dist', 'policy.wasm'),
		join(process.cwd(), '..', 'policies', 'dist', 'policy.wasm'),
	];

	let wasmPath: string | null = null;
	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			wasmPath = candidate;
			break;
		}
	}

	if (!wasmPath) {
		throw new Error(
			`policy.wasm not found. Run 'npm run build:policies' to compile Rego → WASM.`,
		);
	}

	const wasmBytes = readFileSync(wasmPath);
	cachedPolicy = await loadPolicy(wasmBytes);
	return cachedPolicy;
}

/**
 * Force-reload the policy bundle. Useful after a rebuild during long-lived
 * dev sessions. In production, the policy is rebuilt at deploy time and a
 * cold function start picks up the new bundle automatically.
 */
export function invalidatePolicyCache(): void {
	cachedPolicy = null;
	loadAttempted = false;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns true if the given permission is ABAC-scoped (per ADR-0012).
 * Use this to decide whether to call `decide()` after the flat permission
 * check passes.
 */
export function isAbacScoped(action: Permission): boolean {
	return ABAC_SCOPED_PERMISSIONS.has(action);
}

/**
 * Evaluate an ABAC-scoped permission against the loaded policy bundle.
 *
 * Throws if the policy fails to load or if `action` is not in the ABAC set
 * (caller is expected to gate via `isAbacScoped()` first).
 *
 * Returns true (allow) or false (deny). Default-deny: any internal error
 * also returns false (fail-closed).
 */
export async function decide(input: PolicyInput): Promise<boolean> {
	if (!isAbacScoped(input.action)) {
		throw new Error(
			`decide() called for non-ABAC permission '${input.action}'. ` +
			`Check via isAbacScoped() first; flat perms should use claims.permissions.includes().`,
		);
	}

	try {
		const policy = await getPolicy();
		// Per @open-policy-agent/opa-wasm README: input is passed directly
		// (not wrapped in {input: ...}).
		const result = policy.evaluate({
			action: input.action,
			subject: input.subject,
			resource: input.resource ?? {},
		});
		if (!result || result.length === 0) return false;
		return result[0]!.result === true;
	} catch (err) {
		console.error('policy.decide failed (fail-closed):', err);
		return false;
	}
}

/**
 * Build a PolicySubject from JWT claims. Caller fills in `roles` (from
 * tenant_memberships) and `assigned_zone` (from staff_roster, if applicable).
 */
export function subjectFromClaims(
	claims: JwtClaims,
	opts: { roles?: string[]; assignedZone?: string } = {},
): PolicySubject {
	return {
		user_id: claims.sub,
		global_role: claims.global_role,
		roles: opts.roles ?? [],
		tenant_id: claims.tenant_id,
		assigned_zone: opts.assignedZone,
		phone: claims.phone,
	};
}
