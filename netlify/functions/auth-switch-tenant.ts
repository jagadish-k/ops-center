/**
 * POST /api/auth/switch-tenant
 *
 * Switches the active tenant context. Re-mints the JWT with a new
 * `tenant_id` claim and recomputes `permissions[]` for that tenant.
 *
 * Authorization:
 *   - Superadmins (with `tenant:switch`) can switch to ANY tenant.
 *   - Members can switch to any tenant where they hold a membership row.
 *     This is checked at the DB level (not via the global permission), so a
 *     member with `[staff]` in tenant_A and `[manager]` in tenant_B can switch
 *     between them but cannot switch to tenant_C without a membership there.
 *
 * Request:   Authorization: Bearer <jwt>
 *            Body: { "tenantId": "tenant_sofi_ops" }
 * Response:  { "token": "<new-jwt>", "claims": { ... } }
 */
import { type Config } from '@netlify/functions';
import { authorizeRequest, authResponse } from '../lib/auth.ts';
import { signAuthJwt } from '../lib/jwt.ts';
import { resolveUserPermissions } from '../lib/rbac.ts';
import { db } from '../lib/db.ts';
import { tenantMembershipsTable } from '../../database/schema.ts';
import { eq, and } from 'drizzle-orm';
import { jsonResponse, handlePreflight, badRequest, serverError } from '../lib/http.ts';

export default async (request: Request): Promise<Response> => {
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	try {
		// Authenticate (no specific permission required — membership is checked below).
		const auth = await authorizeRequest(request);
		const notOk = authResponse(auth);
		if (notOk) return notOk;
		const claims = auth.claims;

		const { tenantId } = (await request.json()) as { tenantId?: string };
		if (!tenantId) {
			return badRequest('tenantId is required.');
		}

		// Authorization: superadmins with tenant:switch can switch anywhere.
		// Members can switch only to tenants where they hold a membership.
		const isSuperadminSwitcher =
			claims.global_role === 'superadmin' && claims.permissions.includes('tenant:switch');

		if (!isSuperadminSwitcher) {
			// Check the caller has a membership row in the target tenant.
			const membershipRows = await db
				.select({ tenantId: tenantMembershipsTable.tenantId })
				.from(tenantMembershipsTable)
				.where(
					and(
						eq(tenantMembershipsTable.userId, claims.sub),
						eq(tenantMembershipsTable.tenantId, tenantId),
					),
				)
				.execute();

			if (membershipRows.length === 0) {
				return badRequest('You do not have a membership in this tenant.');
			}
		}

		// Re-resolve permissions for the new tenant context.
		const resolved = await resolveUserPermissions(claims.sub, tenantId);
		if (!resolved) {
			return badRequest('Target tenant has no membership for this user.');
		}

		// Mint a fresh JWT with the new tenant_id and recomputed permissions.
		const newToken = await signAuthJwt({
			sub: resolved.user.userId,
			global_role: resolved.user.globalRole,
			tenant_id: tenantId,
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
		console.error('auth-switch-tenant error:', err);
		return serverError('Internal server error.');
	}
};

export const config: Config = {
	path: '/api/auth/switch-tenant',
};
