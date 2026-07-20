/**
 * POST /api/auth/refresh
 *
 * Re-mints a JWT after a `stale-perms` 401 (ADR-0013). Accepts the existing
 * JWT within a 5-minute grace window past expiry, re-resolves permissions
 * from the database, and returns a fresh token.
 *
 * Request:   Authorization: Bearer <existing-or-recently-expired-jwt>
 *            (no body required)
 * Response:  { "token": "<new-jwt>", "claims": { ... } }
 *
 * Rules:
 *   - JWT signature must verify (even if expired).
 *   - Grace period: 5 minutes (300s) post-expiry.
 *   - Rate limit: 10 calls/min/user (in-memory counter per warm instance).
 *
 * Failure modes:
 *   - 401 invalid signature / expired beyond grace / user disabled / user missing
 *   - 429 rate limit exceeded
 */
import { type Config } from '@netlify/functions';
import { verifyAuthJwtWithGrace, extractBearerToken, signAuthJwt } from '../lib/jwt.ts';
import { resolveUserPermissions } from '../lib/rbac.ts';
import { jsonResponse, handlePreflight, serverError } from '../lib/http.ts';

const GRACE_SECONDS = 300;
const RATE_LIMIT_PER_MIN = 10;

const RATE_WINDOW_MS = 60_000;

function rateLimitedResponse(): Response {
	return new Response(
		JSON.stringify({ error: 'Refresh rate limit exceeded. Try again in a minute.' }),
		{ status: 429, headers: { 'Content-Type': 'application/json', 'X-Reason': 'rate-limited' } },
	);
}

function unauthorizedWithReason(message: string, reason: string): Response {
	return new Response(
		JSON.stringify({ error: message }),
		{ status: 401, headers: { 'Content-Type': 'application/json', 'X-Reason': reason } },
	);
}

// Per-warm-instance rate limit counter.
const refreshCalls = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(userId: string): boolean {
	const now = Date.now();
	const entry = refreshCalls.get(userId);

	if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
		refreshCalls.set(userId, { count: 1, windowStart: now });
		return true;
	}

	if (entry.count >= RATE_LIMIT_PER_MIN) {
		return false;
	}

	entry.count += 1;
	return true;
}

export default async (request: Request): Promise<Response> => {
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	try {
		const token = extractBearerToken(request.headers.get('Authorization'));
		if (!token) {
			return unauthorizedWithReason('Missing Bearer token.', 'unauthenticated');
		}

		// Verify signature + tolerate expiry within grace window.
		let claims;
		try {
			claims = await verifyAuthJwtWithGrace(token, GRACE_SECONDS);
		} catch {
			return unauthorizedWithReason(
				'Token signature invalid or expired beyond grace window.',
				'expired',
			);
		}

		// Rate limit
		if (!checkRateLimit(claims.sub)) {
			return rateLimitedResponse();
		}

		// Re-resolve permissions from DB.
		const resolved = await resolveUserPermissions(claims.sub, claims.tenant_id);
		if (!resolved) {
			return unauthorizedWithReason('Account no longer active.', 'user-disabled');
		}

		// Mint a fresh JWT.
		const newToken = await signAuthJwt({
			sub: resolved.user.userId,
			global_role: resolved.user.globalRole,
			tenant_id: claims.tenant_id,
			permissions: resolved.permissions,
			pv: resolved.user.permsVersion,
			auth_provider: claims.auth_provider,
		});

		const [, payloadB64] = newToken.split('.');
		const newClaims = JSON.parse(
			Buffer.from(payloadB64, 'base64url').toString('utf8'),
		);

		return jsonResponse({ token: newToken, claims: newClaims });
	} catch (err) {
		console.error('auth-refresh error:', err);
		return serverError('Internal server error.');
	}
};

export const config: Config = {
	path: '/api/auth/refresh',
};
