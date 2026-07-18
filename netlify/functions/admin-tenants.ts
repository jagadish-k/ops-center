/**
 * POST /api/admin/tenants
 *
 * Superadmin-only tenant management. Actions:
 *
 *   { action: 'list' }                                   // tenant:switch
 *   { action: 'create', tenantId, orgName, bbox? }       // tenant:manage
 *
 * - `list` is available to anyone with `tenant:switch` (superadmin).
 * - `create` requires `tenant:manage` (superadmin only per ADR-0011).
 *
 * bbox is optional — GPS-to-grid projection falls back to a small box around
 * the caller's coordinates if absent (see staff-location.ts).
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
import { tenantsTable } from '../../database/schema.ts';
import { eq } from 'drizzle-orm';
import { jsonResponse, handlePreflight, badRequest, serverError } from '../lib/http.ts';

// ─── Update map layout ───────────────────────────────────────────────────────

async function updateMapLayout(
	claims: JwtClaimsLike,
	body: { tenantId: string; mapLayout: unknown },
): Promise<Response> {
	authorizeAdminOp(claims, 'tenant:manage');

	if (!body.tenantId || !body.mapLayout) {
		throw new AdminHttpError(400, 'bad_request', 'tenantId and mapLayout are required.');
	}

	await db
		.update(tenantsTable)
		.set({ mapLayout: body.mapLayout as never })
		.where(eq(tenantsTable.id, body.tenantId))
		.execute();

	await auditWrite({
		claims,
		tenantId: body.tenantId,
		action: 'TENANT_MAP_LAYOUT_UPDATE',
		targetResourceId: body.tenantId,
		stateDelta: { before: null, after: { layoutKeys: Object.keys(body.mapLayout as Record<string, unknown>) } },
	});

	return jsonResponse({ tenantId: body.tenantId, updated: true });
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function listTenants(claims: JwtClaims) {
	authorizeAdminOp(claims, 'tenant:switch');

	const tenants = await db
		.select({
			id: tenantsTable.id,
			orgName: tenantsTable.orgName,
			status: tenantsTable.status,
			createdAt: tenantsTable.createdAt,
		})
		.from(tenantsTable)
		.execute();

	return jsonResponse({ tenants });
}

interface CreateTenantBody {
	tenantId: string;
	orgName: string;
	bbox?: {
		minLat: number;
		maxLat: number;
		minLng: number;
		maxLng: number;
	};
}

async function createTenant(claims: JwtClaims, body: CreateTenantBody) {
	authorizeAdminOp(claims, 'tenant:manage');

	if (!body.tenantId || !body.orgName) {
		throw new AdminHttpError(400, 'bad_request', 'tenantId and orgName are required.');
	}
	// Convention: tenant IDs are lower-snake (e.g., tenant_metlife_ops).
	if (!/^tenant_[a-z0-9_]+$/.test(body.tenantId)) {
		throw new AdminHttpError(400, 'bad_request', 'tenantId must match /^tenant_[a-z0-9_]+$/.');
	}

	const existing = await db
		.select({ id: tenantsTable.id })
		.from(tenantsTable)
		.where(eq(tenantsTable.id, body.tenantId))
		.execute();
	if (existing.length > 0) {
		throw new AdminHttpError(409, 'conflict', `Tenant already exists: ${body.tenantId}`);
	}

	await db
		.insert(tenantsTable)
		.values({
			id: body.tenantId,
			orgName: body.orgName,
			bboxMinLat: body.bbox?.minLat,
			bboxMaxLat: body.bbox?.maxLat,
			bboxMinLng: body.bbox?.minLng,
			bboxMaxLng: body.bbox?.maxLng,
		})
		.execute();

	await auditWrite({
		claims,
		tenantId: body.tenantId,
		action: 'TENANT_CREATE',
		targetResourceId: body.tenantId,
		stateDelta: { before: null, after: { orgName: body.orgName, bbox: body.bbox ?? null } },
	});

	return jsonResponse({ tenantId: body.tenantId, created: true });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async (request: Request): Promise<Response> => {
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	const auth = await authorizeRequest(request);
	const notOk = authResponse(auth);
	if (notOk) return notOk;
	const claims = auth.claims;

	try {
		const body = (await request.json()) as {
			action: string;
			tenantId?: string;
			orgName?: string;
			bbox?: CreateTenantBody['bbox'];
			mapLayout?: unknown;
		};

		switch (body.action) {
			case 'list':
				return await listTenants(claims);
			case 'create':
				return await createTenant(claims, {
					tenantId: body.tenantId ?? '',
					orgName: body.orgName ?? '',
					bbox: body.bbox,
				});
			case 'update_map_layout':
				return await updateMapLayout(claims, {
					tenantId: body.tenantId ?? '',
					mapLayout: body.mapLayout,
				});
			default:
				return badRequest(`Unknown action: ${body.action}`);
		}
	} catch (err) {
		if (err instanceof AdminHttpError) {
			return adminErrorResponse(err);
		}
		console.error('admin-tenants error:', err);
		return serverError('Admin operation failed.');
	}
};

export const config: Config = {
	path: '/api/admin/tenants',
};
