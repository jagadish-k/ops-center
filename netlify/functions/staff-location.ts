/**
 * POST /api/staff-location
 *
 * Updates the caller's geographic position. Receives raw GPS lat/lng,
 * projects to the 0–1000 grid using the tenant's bounding box, and writes
 * both to staff_roster. The next state-poll cycle picks up the new coords.
 *
 * Security: JWT-verified + perms_version checked (ADR-0013). The caller can
 * only update their OWN location (matched by claims.sub → staff_roster.user_id).
 *
 * Request:  { "latitude": 40.8131, "longitude": -74.0738 }
 * Response: { "status": "UPDATED", "coords": { "x": 480, "y": 310 } }
 */
import { type Config } from '@netlify/functions';
import { authorizeRequest, authResponse } from '../lib/auth.ts';
import { jsonResponse, handlePreflight, badRequest, serverError } from '../lib/http.ts';
import { db } from '../lib/db.ts';
import { staffRosterTable, tenantsTable } from '../../database/schema.ts';
import { eq, and } from 'drizzle-orm';
import { gpsToGrid, type BoundingBox } from '../lib/geo.ts';

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
		const { latitude, longitude } = (await request.json()) as {
			latitude?: number;
			longitude?: number;
		};

		if (latitude == null || longitude == null) {
			return badRequest('latitude and longitude are required.');
		}

		// Fetch the tenant's bounding box for projection.
		const tenantRows = await db
			.select({
				bboxMinLat: tenantsTable.bboxMinLat,
				bboxMaxLat: tenantsTable.bboxMaxLat,
				bboxMinLng: tenantsTable.bboxMinLng,
				bboxMaxLng: tenantsTable.bboxMaxLng,
			})
			.from(tenantsTable)
			.where(eq(tenantsTable.id, claims.tenant_id))
			.execute();

		const bbox: BoundingBox =
			tenantRows.length > 0 && tenantRows[0]!.bboxMinLat != null
				? {
						minLat: tenantRows[0]!.bboxMinLat!,
						maxLat: tenantRows[0]!.bboxMaxLat!,
						minLng: tenantRows[0]!.bboxMinLng!,
						maxLng: tenantRows[0]!.bboxMaxLng!,
					}
				: {
						minLat: latitude - 0.0015,
						maxLat: latitude + 0.0015,
						minLng: longitude - 0.0015,
						maxLng: longitude + 0.0015,
					};

		const coords = gpsToGrid(latitude, longitude, bbox);

		// Update the staff member's coordinates (self-only, via user_id).
		await db
			.update(staffRosterTable)
			.set({
				latitude,
				longitude,
				coordX: coords.x,
				coordY: coords.y,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(staffRosterTable.userId, claims.sub),
					eq(staffRosterTable.tenantId, claims.tenant_id),
				),
			)
			.execute();

		return jsonResponse({ status: 'UPDATED', coords });
	} catch (err) {
		console.error('staff-location error:', err);
		return serverError('Failed to update location.');
	}
};

export const config: Config = {
	path: '/api/staff-location',
};
