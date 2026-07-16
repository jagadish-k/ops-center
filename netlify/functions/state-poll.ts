/**
 * POST /api/state-poll
 *
 * Returns the active operational state for the authenticated tenant:
 * incidents, staff, and dispatches. Drives the live map canvas via the
 * client's 2-second polling hook (ADR-0004).
 *
 * Security:
 *   - JWT verified server-side via authenticateRequest (ADR-0003).
 *   - tenantId resolved from JWT claims — NOT from the request body.
 *     A client cannot request another tenant's data.
 *
 * Request:  { "sinceTimestamp"?: number }  (ignored for now — full active state)
 * Response: { incidents, staff, dispatches, serverTimestamp }
 */
import { type Config } from '@netlify/functions';
import { authenticateRequest } from '../lib/jwt';
import { jsonResponse, handlePreflight, unauthorized, serverError } from '../lib/http';
import { query } from '../lib/db';
import { mapIncident, mapStaff, mapDispatch } from '../lib/mappers';

export default async (request: Request): Promise<Response> => {
	// CORS preflight.
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	// 1. Authenticate — verify JWT, extract claims.
	const claims = await authenticateRequest(request);
	if (!claims) {
		return unauthorized('Invalid or missing authentication token.');
	}

	const tenantId = claims.tenantId;

	try {
		// 2. Query active incidents (non-resolved) for this tenant.
		const incidentRows = await query(
			`SELECT * FROM incidents
			 WHERE tenant_id = $1 AND status != 'RESOLVED'
			 ORDER BY created_at DESC
			 LIMIT 500`,
			[tenantId],
		);

		// 3. Query active staff (on-duty) for this tenant.
		const staffRows = await query(
			`SELECT * FROM staff_roster
			 WHERE tenant_id = $1 AND status != 'OFF_DUTY'
			 ORDER BY full_name ASC
			 LIMIT 500`,
			[tenantId],
		);

		// 4. Query active dispatches (non-resolved) for this tenant.
		const dispatchRows = await query(
			`SELECT * FROM dispatches
			 WHERE tenant_id = $1 AND status != 'RESOLVED'
			 ORDER BY sent_at DESC
			 LIMIT 200`,
			[tenantId],
		);

		// 5. Map rows to domain types.
		const incidents = incidentRows.map((row) => mapIncident(row as never));
		const staff = staffRows.map((row) => mapStaff(row as never));
		const dispatches = dispatchRows.map((row) => mapDispatch(row as never));

		return jsonResponse({
			incidents,
			staff,
			dispatches,
			serverTimestamp: Date.now(),
		});
	} catch (err) {
		console.error('state-poll error:', err);
		return serverError('Failed to fetch operational state.');
	}
};

export const config: Config = {
	path: '/api/state-poll',
};
