/**
 * Authorization middleware for Netlify Functions.
 *
 * Wraps the JWT verification (ADR-0003) with the perms_version staleness
 * check (ADR-0013) and the flat-permission gate.
 *
 * Every protected endpoint should call `authorizeRequest()` instead of
 * `authenticateRequest()` directly. ABAC-scoped actions additionally call
 * `policy.decide(...)` from `netlify/lib/policy.ts` (ADR-0012, M9.4).
 */
import { db } from './db.ts';
import { usersTable } from '../../database/schema.ts';
import { eq } from 'drizzle-orm';
import { authenticateRequest } from './jwt.ts';
import type { JwtClaims, Permission } from '../../src/types';

// ─── perms_version cache (30s TTL — ADR-0013) ────────────────────────────────

interface CachedPv {
	userId: string;
	pv: number;
	fetchedAt: number;
}

const pvCache = new Map<string, CachedPv>();
const PV_CACHE_TTL_MS = 30_000; // 30s

async function getCachedPermsVersion(userId: string, forceRefresh = false): Promise<number> {
	const cached = pvCache.get(userId);
	const now = Date.now();

	if (!forceRefresh && cached && now - cached.fetchedAt < PV_CACHE_TTL_MS) {
		return cached.pv;
	}

	const rows = await db
		.select({ pv: usersTable.permsVersion })
		.from(usersTable)
		.where(eq(usersTable.id, userId))
		.execute();

	if (rows.length === 0) {
		// User was deleted after JWT was minted. Return -1 to force rejection.
		return -1;
	}

	const pv = rows[0]!.pv;
	pvCache.set(userId, { userId, pv, fetchedAt: now });
	return pv;
}

/** Force-refresh the cache for one user (superadmin debug via X-Cache-Bust). */
export function invalidatePvCache(userId?: string): void {
	if (userId) {
		pvCache.delete(userId);
	} else {
		pvCache.clear();
	}
}

// ─── Authorization result ─────────────────────────────────────────────────────

export type AuthResult =
	| { ok: true; claims: JwtClaims }
	| { ok: false; status: number; reason: 'unauthenticated' | 'stale-perms' | 'forbidden'; message: string };

/**
 * Authenticate + check perms_version + check flat permission.
 *
 * @param request    The incoming Request
 * @param required   Permission required for this endpoint (omit for "any authenticated user")
 * @returns          AuthResult — caller returns early on `{ ok: false }`
 */
export async function authorizeRequest(
	request: Request,
	required?: Permission,
): Promise<AuthResult> {
	const claims = await authenticateRequest(request);
	if (!claims) {
		return {
			ok: false,
			status: 401,
			reason: 'unauthenticated',
			message: 'Invalid or missing authentication token.',
		};
	}

	// perms_version staleness check (ADR-0013)
	const cacheBust = request.headers.get('X-Cache-Bust');
	const currentPv = await getCachedPermsVersion(claims.sub, !!cacheBust);

	if (currentPv === -1) {
		return {
			ok: false,
			status: 401,
			reason: 'unauthenticated',
			message: 'User account no longer exists.',
		};
	}

	if (currentPv !== claims.pv) {
		return {
			ok: false,
			status: 401,
			reason: 'stale-perms',
			message: 'Token permissions are stale. Call /api/auth/refresh.',
		};
	}

	// Flat permission check
	if (required && !claims.permissions.includes(required)) {
		return {
			ok: false,
			status: 403,
			reason: 'forbidden',
			message: `Missing permission: ${required}`,
		};
	}

	return { ok: true, claims };
}

/**
 * Convenience: returns the Response for a failed AuthResult, or null if ok.
 * Usage:
 *   const auth = await authorizeRequest(request, 'staff:manage');
 *   if (!auth.ok) return authResponse(auth);
 *   // ... continue with auth.claims
 */
export function authResponse(result: AuthResult): Response | null {
	if (result.ok) return null;

	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (result.reason === 'stale-perms') {
		headers['X-Reason'] = 'stale-perms';
	} else if (result.reason === 'forbidden') {
		headers['X-Reason'] = 'forbidden';
	}

	return new Response(JSON.stringify({ error: result.message }), {
		status: result.status,
		headers,
	});
}
