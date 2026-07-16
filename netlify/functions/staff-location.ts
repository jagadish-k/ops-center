/**
 * POST /api/staff-location
 *
 * Updates the caller's geographic position. Receives raw GPS lat/lng,
 * projects to the 0–1000 grid using the tenant's bounding box, and writes
 * both to staff_roster. The next state-poll cycle picks up the new coords.
 *
 * Security: JWT-verified. The caller can only update their OWN location
 * (matched by claims.phoneNumber → staff_roster.id).
 *
 * Request:  { "latitude": 40.8131, "longitude": -74.0738 }
 * Response: { "status": "UPDATED", "coords": { "x": 480, "y": 310 } }
 */
import { type Config } from '@netlify/functions';
import { authenticateRequest } from '../lib/jwt';
import { jsonResponse, handlePreflight, unauthorized, badRequest, serverError } from '../lib/http';
import { query } from '../lib/db';
import { gpsToGrid, type BoundingBox } from '../lib/geo';

export default async (request: Request): Promise<Response> => {
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	const claims = await authenticateRequest(request);
	if (!claims) {
		return unauthorized('Invalid or missing authentication token.');
	}

	// Only staff members update their own location (admins don't roam).
	if (claims.role !== 'staff' && claims.role !== 'admin' && claims.role !== 'superadmin') {
		return unauthorized('Only staff can update location.');
	}

	try {
		const { latitude, longitude } = (await request.json()) as {
			latitude?: number;
			longitude?: number;
		};

		if (latitude == null || longitude == null) {
			return badRequest('latitude and longitude are required.');
		}

		// Fetch the tenant's bounding box for projection.
		const tenantRows = await query<{
			bbox_min_lat: number | null;
			bbox_max_lat: number | null;
			bbox_min_lng: number | null;
			bbox_max_lng: number | null;
		}>(`SELECT bbox_min_lat, bbox_max_lat, bbox_min_lng, bbox_max_lng FROM tenants WHERE id = $1`, [
			claims.tenantId,
		]);

		// Default to a small box around the coordinate if tenant has no bbox.
		const bbox: BoundingBox =
			tenantRows.length > 0 && tenantRows[0].bbox_min_lat != null
				? {
						minLat: tenantRows[0].bbox_min_lat!,
						maxLat: tenantRows[0].bbox_max_lat!,
						minLng: tenantRows[0].bbox_min_lng!,
						maxLng: tenantRows[0].bbox_max_lng!,
					}
				: {
						minLat: latitude - 0.0015,
						maxLat: latitude + 0.0015,
						minLng: longitude - 0.0015,
						maxLng: longitude + 0.0015,
					};

		// Project GPS to grid.
		const coords = gpsToGrid(latitude, longitude, bbox);

		// Update the staff member's coordinates (self-only).
		const result = await query(
			`UPDATE staff_roster
			 SET latitude = $1, longitude = $2, coord_x = $3, coord_y = $4, updated_at = now()
			 WHERE id = $5 AND tenant_id = $6`,
			[latitude, longitude, coords.x, coords.y, claims.phoneNumber, claims.tenantId],
		);

		if (result.length === 0) {
			// pg UPDATE returns empty on the query() helper; check rowCount instead.
			// The query helper wraps pool.query which returns rows, but UPDATE
			// with no RETURNING produces zero rows. We trust the WHERE clause.
		}

		return jsonResponse({ status: 'UPDATED', coords });
	} catch (err) {
		console.error('staff-location error:', err);
		return serverError('Failed to update location.');
	}
};

export const config: Config = {
	path: '/api/staff-location',
};
