/**
 * POST /api/state-poll
 *
 * Returns the active operational state for the authenticated tenant:
 * incidents, staff, and dispatches. Drives the live map canvas via the
 * client's 2-second polling hook (ADR-0004).
 *
 * Security:
 *   - JWT verified + perms_version checked via authorizeRequest (ADR-0013).
 *   - tenantId resolved from JWT claims — NOT from the request body.
 *     A client cannot request another tenant's data.
 *
 * Request:  { "sinceTimestamp"?: number }  (ignored for now — full active state)
 * Response: { incidents, staff, dispatches, serverTimestamp }
 */
import { type Config } from '@netlify/functions';
import { authorizeRequest, authResponse } from '../lib/auth.ts';
import { jsonResponse, handlePreflight, serverError } from '../lib/http.ts';
import { db } from '../lib/db.ts';
import {
	incidentsTable,
	staffRosterTable,
	dispatchesTable,
	usersTable,
	tenantMembershipsTable,
} from '../../database/schema.ts';
import { eq, and, ne, asc, desc } from 'drizzle-orm';
import { mapIncident, mapStaff, mapDispatch } from '../lib/mappers.ts';

export default async (request: Request): Promise<Response> => {
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	// 1. Authenticate + staleness check. Any authenticated user can poll.
	const auth = await authorizeRequest(request);
	const notOk = authResponse(auth);
	if (notOk) return notOk;
	const claims = auth.claims;

	const tenantId = claims.tenant_id;

	try {
		// 2. Query active incidents (non-resolved) for this tenant.
		const incidentRows = await db
			.select()
			.from(incidentsTable)
			.where(
				and(
					eq(incidentsTable.tenantId, tenantId),
					ne(incidentsTable.status, 'RESOLVED'),
				),
			)
			.orderBy(desc(incidentsTable.createdAt))
			.limit(500)
			.execute();

		// 3. Query active staff (on-duty) for this tenant, joined with users +
		// their membership roles in this tenant.
		const staffRows = await db
			.select({
				id: staffRosterTable.id,
				user_id: staffRosterTable.userId,
				tenant_id: staffRosterTable.tenantId,
				full_name: usersTable.fullName,
				phone_number: staffRosterTable.phoneNumber,
				specialty: staffRosterTable.specialty,
				assigned_zone: staffRosterTable.assignedZone,
				status: staffRosterTable.status,
				coord_x: staffRosterTable.coordX,
				coord_y: staffRosterTable.coordY,
				updated_at: staffRosterTable.updatedAt,
				created_at: staffRosterTable.createdAt,
				roles: tenantMembershipsTable.roles,
			})
			.from(staffRosterTable)
			.innerJoin(usersTable, eq(usersTable.id, staffRosterTable.userId))
			.leftJoin(
				tenantMembershipsTable,
				and(
					eq(tenantMembershipsTable.userId, staffRosterTable.userId),
					eq(tenantMembershipsTable.tenantId, staffRosterTable.tenantId),
				),
			)
			.where(
				and(
					eq(staffRosterTable.tenantId, tenantId),
					ne(staffRosterTable.status, 'OFF_DUTY'),
				),
			)
			.orderBy(asc(usersTable.fullName))
			.limit(500)
			.execute();

		// 4. Query active dispatches (non-resolved) for this tenant.
		const dispatchRows = await db
			.select()
			.from(dispatchesTable)
			.where(
				and(
					eq(dispatchesTable.tenantId, tenantId),
					ne(dispatchesTable.status, 'RESOLVED'),
				),
			)
			.orderBy(desc(dispatchesTable.sentAt))
			.limit(200)
			.execute();

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
