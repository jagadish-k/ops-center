/**
 * POST /api/mutations
 *
 * Unified mutation endpoint for incident lifecycle transitions, incident
 * creation (manual triage), dispatch creation, and dispatch status updates.
 * All actions are JWT-verified and tenant-guarded (ADR-0003).
 *
 * Action-based routing via request body:
 *   { action: 'create_incident', category, severity, locationSector, rawText }
 *   { action: 'transition_incident', incidentId, nextStatus }
 *   { action: 'create_dispatch', incidentId, targetStaffPhone, directiveText }
 *   { action: 'update_dispatch', dispatchId, nextStatus }
 *
 * Authorization:
 *   - transition_incident: admin or superadmin
 *   - create_dispatch: admin or superadmin
 *   - update_dispatch: admin/superadmin, OR the target staff member
 *     (JWT phoneNumber must match the dispatch's target_staff_phone)
 */
import { type Config } from '@netlify/functions';
import { authenticateRequest } from '../lib/jwt';
import type { JwtClaims, IncidentSeverity, InfoTier } from '../../src/types';
import { query } from '../lib/db';
import { jsonResponse, handlePreflight, unauthorized, badRequest, serverError } from '../lib/http';
import { mapIncident, mapDispatch } from '../lib/mappers';
import { createIncident } from '../lib/incidents';
import { checkOperationalWindow } from '../lib/operational-window';
import { randomUUID } from 'node:crypto';

// ─── Status flow validation ───────────────────────────────────────────────────

const INCIDENT_FLOW = ['OPEN', 'ACKNOWLEDGED', 'ON_SCENE', 'RESOLVED'];
const DISPATCH_FLOW = ['SENT', 'ACKNOWLEDGED', 'ON_SCENE', 'RESOLVED'];

/** Forward-only transition check (allows skipping steps, e.g. OPEN → RESOLVED). */
function isValidForwardTransition(current: string, next: string, flow: string[]): boolean {
	const currentIdx = flow.indexOf(current);
	const nextIdx = flow.indexOf(next);
	return currentIdx !== -1 && nextIdx !== -1 && nextIdx > currentIdx;
}

function isAdmin(claims: JwtClaims): boolean {
	return claims.role === 'admin' || claims.role === 'superadmin';
}

// ─── Action handlers ──────────────────────────────────────────────────────────

/** Infers an InfoTier from severity for manual triage submissions. */
function inferTier(severity: IncidentSeverity): InfoTier {
	const map: Record<IncidentSeverity, InfoTier> = {
		CRITICAL: 1,
		HIGH: 2,
		MEDIUM: 3,
		LOW: 4,
	};
	return map[severity] ?? 3;
}

async function createIncidentAction(
	claims: JwtClaims,
	body: { category: string; severity: string; locationSector: string; rawText: string },
): Promise<Response> {
	// Staff, admins, and superadmins can create incidents.
	if (claims.role !== 'staff' && !isAdmin(claims)) {
		return unauthorized('Only staff and admins can file incidents.');
	}

	if (!body.category || !body.severity || !body.locationSector) {
		return badRequest('category, severity, and locationSector are required.');
	}

	const incident = await createIncident({
		tenantId: claims.tenantId,
		source: 'field_staff',
		tier: inferTier(body.severity as IncidentSeverity),
		rawText: body.rawText || `Manual triage — ${body.category} / ${body.severity} at ${body.locationSector}`,
		category: body.category as never,
		severity: body.severity as IncidentSeverity,
		locationSector: body.locationSector,
	});

	return jsonResponse({ incident });
}

async function transitionIncident(
	claims: JwtClaims,
	body: { incidentId: string; nextStatus: string },
): Promise<Response> {
	if (!isAdmin(claims)) {
		return unauthorized('Only admins can transition incident status.');
	}

	const { incidentId, nextStatus } = body;
	if (!INCIDENT_FLOW.includes(nextStatus)) {
		return badRequest(`Invalid status: ${nextStatus}.`);
	}

	// Fetch current incident — verify it belongs to this tenant.
	const rows = await query(
		`SELECT * FROM incidents WHERE id = $1 AND tenant_id = $2`,
		[incidentId, claims.tenantId],
	);
	if (rows.length === 0) {
		return badRequest('Incident not found in your tenant.');
	}

	const current = rows[0].status as string;
	if (!isValidForwardTransition(current, nextStatus, INCIDENT_FLOW)) {
		return badRequest(`Cannot transition from ${current} to ${nextStatus}.`);
	}

	// Apply the update.
	await query(
		`UPDATE incidents SET status = $1 WHERE id = $2 AND tenant_id = $3`,
		[nextStatus, incidentId, claims.tenantId],
	);

	// Fetch + return the updated record.
	const updated = await query(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
	return jsonResponse({ incident: mapIncident(updated[0] as never) });
}

async function createDispatch(
	claims: JwtClaims,
	body: { incidentId: string; targetStaffPhone: string; directiveText: string },
): Promise<Response> {
	if (!isAdmin(claims)) {
		return unauthorized('Only admins can create dispatches.');
	}

	const { incidentId, targetStaffPhone, directiveText } = body;
	if (!incidentId || !targetStaffPhone || !directiveText) {
		return badRequest('incidentId, targetStaffPhone, and directiveText are required.');
	}

	// Verify the incident exists in this tenant.
	const incidentRows = await query(
		`SELECT id FROM incidents WHERE id = $1 AND tenant_id = $2`,
		[incidentId, claims.tenantId],
	);
	if (incidentRows.length === 0) {
		return badRequest('Incident not found in your tenant.');
	}

	// Verify the target staff exists in this tenant.
	const staffRows = await query(
		`SELECT id FROM staff_roster WHERE id = $1 AND tenant_id = $2 AND status != 'OFF_DUTY'`,
		[targetStaffPhone, claims.tenantId],
	);
	if (staffRows.length === 0) {
		return badRequest('Target staff member not found or off-duty.');
	}

	// Create the dispatch.
	const dispatchId = `disp_${randomUUID().slice(0, 12)}`;
	await query(
		`INSERT INTO dispatches (id, tenant_id, incident_id, target_staff_phone, directive_text, status)
		 VALUES ($1, $2, $3, $4, $5, 'SENT')`,
		[dispatchId, claims.tenantId, incidentId, targetStaffPhone, directiveText],
	);

	// Mark the target staff as DISPATCHED.
	await query(
		`UPDATE staff_roster SET status = 'DISPATCHED' WHERE id = $1 AND tenant_id = $2`,
		[targetStaffPhone, claims.tenantId],
	);

	// Fetch + return the created dispatch.
	const created = await query(`SELECT * FROM dispatches WHERE id = $1`, [dispatchId]);
	return jsonResponse({ dispatch: mapDispatch(created[0] as never) });
}

async function updateDispatch(
	claims: JwtClaims,
	body: { dispatchId: string; nextStatus: string },
): Promise<Response> {
	const { dispatchId, nextStatus } = body;
	if (!DISPATCH_FLOW.includes(nextStatus)) {
		return badRequest(`Invalid dispatch status: ${nextStatus}.`);
	}

	// Fetch the dispatch — verify tenant.
	const rows = await query(
		`SELECT * FROM dispatches WHERE id = $1 AND tenant_id = $2`,
		[dispatchId, claims.tenantId],
	);
	if (rows.length === 0) {
		return badRequest('Dispatch not found in your tenant.');
	}

	const dispatch = rows[0];
	const current = dispatch.status as string;

	if (!isValidForwardTransition(current, nextStatus, DISPATCH_FLOW)) {
		return badRequest(`Cannot transition dispatch from ${current} to ${nextStatus}.`);
	}

	// Authorization: admin/superadmin OR the target staff member.
	if (!isAdmin(claims) && claims.phoneNumber !== dispatch.target_staff_phone) {
		return unauthorized('You can only update dispatches assigned to you.');
	}

	// Apply the update + set timestamps.
	const timestampCol =
		nextStatus === 'ACKNOWLEDGED' ? 'ack_at' : nextStatus === 'RESOLVED' ? 'resolved_at' : null;

	if (timestampCol) {
		await query(
			`UPDATE dispatches SET status = $1, ${timestampCol} = now() WHERE id = $2`,
			[nextStatus, dispatchId],
		);
	} else {
		await query(`UPDATE dispatches SET status = $1 WHERE id = $2`, [nextStatus, dispatchId]);
	}

	// If resolved, mark the target staff as AVAILABLE again.
	if (nextStatus === 'RESOLVED') {
		await query(
			`UPDATE staff_roster SET status = 'AVAILABLE' WHERE id = $1 AND tenant_id = $2`,
			[dispatch.target_staff_phone, claims.tenantId],
		);
	}

	// Fetch + return the updated dispatch.
	const updated = await query(`SELECT * FROM dispatches WHERE id = $1`, [dispatchId]);
	return jsonResponse({ dispatch: mapDispatch(updated[0] as never) });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

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

	// Enforce the operational time window for write actions.
	const windowCheck = await checkOperationalWindow(claims);
	if (!windowCheck.ok) {
		return jsonResponse({ error: windowCheck.reason }, 403);
	}

	try {
		const body = (await request.json()) as {
			action: string;
			incidentId?: string;
			nextStatus?: string;
			targetStaffPhone?: string;
			directiveText?: string;
			dispatchId?: string;
		};

		switch (body.action) {
			case 'create_incident':
				return await createIncidentAction(claims, {
					category: body.category ?? '',
					severity: body.severity ?? '',
					locationSector: body.locationSector ?? '',
					rawText: body.rawText ?? '',
				});

			case 'transition_incident':
				if (!body.incidentId || !body.nextStatus) {
					return badRequest('incidentId and nextStatus are required.');
				}
				return await transitionIncident(claims, {
					incidentId: body.incidentId,
					nextStatus: body.nextStatus,
				});

			case 'create_dispatch':
				return await createDispatch(claims, {
					incidentId: body.incidentId ?? '',
					targetStaffPhone: body.targetStaffPhone ?? '',
					directiveText: body.directiveText ?? '',
				});

			case 'update_dispatch':
				if (!body.dispatchId || !body.nextStatus) {
					return badRequest('dispatchId and nextStatus are required.');
				}
				return await updateDispatch(claims, {
					dispatchId: body.dispatchId,
					nextStatus: body.nextStatus,
				});

			default:
				return badRequest(`Unknown action: ${body.action}.`);
		}
	} catch (err) {
		console.error('mutations error:', err);
		return serverError('Mutation failed.');
	}
};

export const config: Config = {
	path: '/api/mutations',
};
