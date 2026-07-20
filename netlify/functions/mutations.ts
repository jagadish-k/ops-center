/**
 * POST /api/mutations
 *
 * Unified mutation endpoint for incident lifecycle transitions, incident
 * creation (manual triage), dispatch creation, and dispatch status updates.
 *
 * Post-ADR-0011/0013: authorization is via `claims.permissions.includes(...)`,
 * not role-name checks. The perms_version staleness check is enforced by
 * `authorizeRequest()` (ADR-0013).
 *
 * Action-based routing via request body:
 *   { action: 'create_incident', category, severity, locationSector, rawText }
 *   { action: 'transition_incident', incidentId, nextStatus }
 *   { action: 'create_dispatch', incidentId, targetStaffPhone, directiveText }
 *   { action: 'update_dispatch', dispatchId, nextStatus }
 */
import { type Config } from '@netlify/functions';
import { authorizeRequest, authResponse } from '../lib/auth.ts';
import { db } from '../lib/db.ts';
import {
	incidentsTable,
	dispatchesTable,
	staffRosterTable,
	usersTable,
} from '../../database/schema.ts';
import { eq, and, ne, sql } from 'drizzle-orm';
import { jsonResponse, handlePreflight, badRequest, serverError } from '../lib/http.ts';
import { mapIncident, mapDispatch } from '../lib/mappers.ts';
import { createIncident } from '../lib/incidents.ts';
import { checkOperationalWindow } from '../lib/operational-window.ts';
import { commitAuditLog, type AuditActor } from '../lib/auditLogger.ts';
import { decide as policyDecide, subjectFromClaims, isAbacScoped } from '../lib/policy.ts';
import { fetchSubjectContext } from '../lib/rbac.ts';
import { randomUUID } from 'node:crypto';
import type { JwtClaims, IncidentSeverity, InfoTier, Permission } from '../../src/types';

/** Builds an AuditActor from JWT claims (post-ADR-0013 shape). */
function actorFromClaims(claims: JwtClaims, phoneOrEmail = 'unknown'): AuditActor {
	return {
		uid: claims.sub,
		role: claims.global_role, // 'superadmin' | 'member' — recorded as a string
		phoneOrEmail,
	};
}

/** Helper: fetch the caller's phone for audit logging. */
async function fetchUserPhone(userId: string): Promise<string> {
	const rows = await db
		.select({ phone: usersTable.phone })
		.from(usersTable)
		.where(eq(usersTable.id, userId))
		.execute();
	return rows[0]?.phone ?? 'unknown';
}

// ─── Status flow validation ───────────────────────────────────────────────────

const INCIDENT_FLOW = ['OPEN', 'ACKNOWLEDGED', 'ON_SCENE', 'RESOLVED'];
const DISPATCH_FLOW = ['SENT', 'ACKNOWLEDGED', 'ON_SCENE', 'RESOLVED'];

function isValidForwardTransition(current: string, next: string, flow: string[]): boolean {
	const currentIdx = flow.indexOf(current);
	const nextIdx = flow.indexOf(next);
	return currentIdx !== -1 && nextIdx !== -1 && nextIdx > currentIdx;
}

function inferTier(severity: IncidentSeverity): InfoTier {
	const map: Record<IncidentSeverity, InfoTier> = {
		CRITICAL: 1,
		HIGH: 2,
		MEDIUM: 3,
		LOW: 4,
	};
	return map[severity] ?? 3;
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function createIncidentAction(
	claims: JwtClaims,
	body: { category: string; severity: string; locationSector: string; rawText: string },
): Promise<Response> {
	if (!claims.permissions.includes('incident:create')) {
		return jsonResponse({ error: 'Only staff and admins can file incidents.' }, 403);
	}

	if (!body.category || !body.severity || !body.locationSector) {
		return badRequest('category, severity, and locationSector are required.');
	}

	const incident = await createIncident({
		tenantId: claims.tenant_id,
		source: 'field_staff',
		tier: inferTier(body.severity as IncidentSeverity),
		rawText: body.rawText || `Manual triage — ${body.category} / ${body.severity} at ${body.locationSector}`,
		category: body.category as never,
		severity: body.severity as IncidentSeverity,
		locationSector: body.locationSector,
	});

	const actorPhone = await fetchUserPhone(claims.sub);
	await commitAuditLog({
		tenantId: claims.tenant_id,
		actor: actorFromClaims(claims, actorPhone),
		action: 'INCIDENT_CREATE',
		targetResourceId: incident.id,
		stateDelta: { before: null, after: { status: incident.status, tier: incident.tier, category: incident.extractedMetadata.category } },
	});

	return jsonResponse({ incident });
}

async function transitionIncident(
	claims: JwtClaims,
	body: { incidentId: string; nextStatus: string },
): Promise<Response> {
	if (!claims.permissions.includes('incident:transition')) {
		return jsonResponse({ error: 'Only admins can transition incident status.' }, 403);
	}

	const { incidentId, nextStatus } = body;
	if (!INCIDENT_FLOW.includes(nextStatus)) {
		return badRequest(`Invalid status: ${nextStatus}.`);
	}

	const rows = await db
		.select()
		.from(incidentsTable)
		.where(
			and(
				eq(incidentsTable.id, incidentId),
				eq(incidentsTable.tenantId, claims.tenant_id),
			),
		)
		.execute();
	if (rows.length === 0) {
		return badRequest('Incident not found in your tenant.');
	}

	const incident = rows[0]!;
	const current = incident.status;
	if (!isValidForwardTransition(current, nextStatus, INCIDENT_FLOW)) {
		return badRequest(`Cannot transition from ${current} to ${nextStatus}.`);
	}

	// ABAC policy check (ADR-0012): tier-gated for managers.
	const subjectCtx = await fetchSubjectContext(claims.sub, claims.tenant_id);
	const allowed = await policyDecide({
		action: 'incident:transition' as Permission,
		subject: subjectFromClaims(claims, subjectCtx),
		resource: { tier: incident.tier ?? 3 },
	});
	if (!allowed) {
		return new Response(
			JSON.stringify({ error: `Policy denied: managers cannot transition Tier ${incident.tier} incidents.` }),
			{ status: 403, headers: { 'Content-Type': 'application/json', 'X-Reason': 'policy-denied' } },
		);
	}

	await db
		.update(incidentsTable)
		.set({ status: nextStatus })
		.where(
			and(
				eq(incidentsTable.id, incidentId),
				eq(incidentsTable.tenantId, claims.tenant_id),
			),
		)
		.execute();

	const updated = await db
		.select()
		.from(incidentsTable)
		.where(eq(incidentsTable.id, incidentId))
		.execute();
	const updatedIncident = mapIncident(updated[0] as never);

	const actorPhone = await fetchUserPhone(claims.sub);
	await commitAuditLog({
		tenantId: claims.tenant_id,
		actor: actorFromClaims(claims, actorPhone),
		action: 'INCIDENT_STATUS_MUTATION',
		targetResourceId: incidentId,
		stateDelta: { before: { status: current, tier: incident.tier }, after: { status: nextStatus } },
	});

	return jsonResponse({ incident: updatedIncident });
}

async function createDispatch(
	claims: JwtClaims,
	body: { incidentId: string; targetStaffPhone: string; directiveText: string },
): Promise<Response> {
	if (!claims.permissions.includes('dispatch:create')) {
		return jsonResponse({ error: 'Only admins/managers can create dispatches.' }, 403);
	}

	const { incidentId, targetStaffPhone, directiveText } = body;
	if (!incidentId || !targetStaffPhone || !directiveText) {
		return badRequest('incidentId, targetStaffPhone, and directiveText are required.');
	}

	const incidentRows = await db
		.select({ id: incidentsTable.id })
		.from(incidentsTable)
		.where(
			and(
				eq(incidentsTable.id, incidentId),
				eq(incidentsTable.tenantId, claims.tenant_id),
			),
		)
		.execute();
	if (incidentRows.length === 0) {
		return badRequest('Incident not found in your tenant.');
	}

	// Lookup staff by phone_number (was by id pre-ADR-0010).
	const staffRows = await db
		.select({
			id: staffRosterTable.id,
			zone: staffRosterTable.assignedZone,
		})
		.from(staffRosterTable)
		.where(
			and(
				eq(staffRosterTable.phoneNumber, targetStaffPhone),
				eq(staffRosterTable.tenantId, claims.tenant_id),
				ne(staffRosterTable.status, 'OFF_DUTY'),
			),
		)
		.execute();
	if (staffRows.length === 0) {
		return badRequest('Target staff member not found or off-duty.');
	}
	const targetZone = staffRows[0]!.zone;

	// ABAC policy check (ADR-0012): manager can only dispatch within own zone.
	const subjectCtx = await fetchSubjectContext(claims.sub, claims.tenant_id);
	const allowed = await policyDecide({
		action: 'dispatch:create' as Permission,
		subject: subjectFromClaims(claims, subjectCtx),
		resource: { target_zone: targetZone },
	});
	if (!allowed) {
		return new Response(
			JSON.stringify({ error: `Policy denied: managers can only dispatch within their own zone (yours: ${subjectCtx.assignedZone ?? 'n/a'}).` }),
			{ status: 403, headers: { 'Content-Type': 'application/json', 'X-Reason': 'policy-denied' } },
		);
	}

	const dispatchId = `disp_${randomUUID().slice(0, 12)}`;
	await db
		.insert(dispatchesTable)
		.values({
			id: dispatchId,
			tenantId: claims.tenant_id,
			incidentId,
			targetStaffPhone,
			directiveText,
			status: 'SENT',
		})
		.execute();

	// Mark target staff as DISPATCHED (by phone, which is unique per tenant).
	await db
		.update(staffRosterTable)
		.set({ status: 'DISPATCHED' })
		.where(
			and(
				eq(staffRosterTable.phoneNumber, targetStaffPhone),
				eq(staffRosterTable.tenantId, claims.tenant_id),
			),
		)
		.execute();

	const created = await db
		.select()
		.from(dispatchesTable)
		.where(eq(dispatchesTable.id, dispatchId))
		.execute();
	const createdDispatch = mapDispatch(created[0] as never);

	const actorPhone = await fetchUserPhone(claims.sub);
	await commitAuditLog({
		tenantId: claims.tenant_id,
		actor: actorFromClaims(claims, actorPhone),
		action: 'DISPATCH_CREATE',
		targetResourceId: dispatchId,
		stateDelta: { before: null, after: { status: 'SENT', target: targetStaffPhone, incidentId } },
	});

	return jsonResponse({ dispatch: createdDispatch });
}

async function updateDispatch(
	claims: JwtClaims,
	body: { dispatchId: string; nextStatus: string },
): Promise<Response> {
	const { dispatchId, nextStatus } = body;
	if (!DISPATCH_FLOW.includes(nextStatus)) {
		return badRequest(`Invalid dispatch status: ${nextStatus}.`);
	}

	const rows = await db
		.select()
		.from(dispatchesTable)
		.where(
			and(
				eq(dispatchesTable.id, dispatchId),
				eq(dispatchesTable.tenantId, claims.tenant_id),
			),
		)
		.execute();
	if (rows.length === 0) {
		return badRequest('Dispatch not found in your tenant.');
	}

	const dispatch = rows[0]!;
	const current = dispatch.status;

	if (!isValidForwardTransition(current, nextStatus, DISPATCH_FLOW)) {
		return badRequest(`Cannot transition dispatch from ${current} to ${nextStatus}.`);
	}

	// Authorization: dispatch:update OR self (caller is target staff).
	const actorPhone = await fetchUserPhone(claims.sub);
	const canUpdateAny = claims.permissions.includes('dispatch:update');
	const isTarget = actorPhone === dispatch.targetStaffPhone;
	if (!canUpdateAny && !isTarget) {
		return jsonResponse({ error: 'You can only update dispatches assigned to you.' }, 403);
	}

	// ABAC policy check (ADR-0012): self-or-permitted. Even with the flat
	// permission, run the policy so the audit trail + future attribute
	// conditions (e.g., time-of-day) apply uniformly.
	if (isAbacScoped('dispatch:update' as Permission)) {
		const subjectCtx = await fetchSubjectContext(claims.sub, claims.tenant_id);
		const allowed = await policyDecide({
			action: 'dispatch:update' as Permission,
			subject: subjectFromClaims(claims, subjectCtx),
			resource: { target_staff_phone: dispatch.targetStaffPhone },
		});
		if (!allowed) {
			return new Response(
				JSON.stringify({ error: 'Policy denied for dispatch:update.' }),
				{ status: 403, headers: { 'Content-Type': 'application/json', 'X-Reason': 'policy-denied' } },
			);
		}
	}

	const updateValues: Record<string, unknown> = { status: nextStatus };
	if (nextStatus === 'ACKNOWLEDGED') updateValues.ackAt = new Date();
	if (nextStatus === 'RESOLVED') updateValues.resolvedAt = new Date();

	await db
		.update(dispatchesTable)
		.set(updateValues)
		.where(eq(dispatchesTable.id, dispatchId))
		.execute();

	if (nextStatus === 'RESOLVED') {
		await db
			.update(staffRosterTable)
			.set({ status: 'AVAILABLE' })
			.where(
				and(
					eq(staffRosterTable.phoneNumber, dispatch.targetStaffPhone),
					eq(staffRosterTable.tenantId, claims.tenant_id),
				),
			)
			.execute();
	}

	const updated = await db
		.select()
		.from(dispatchesTable)
		.where(eq(dispatchesTable.id, dispatchId))
		.execute();
	const updatedDispatch = mapDispatch(updated[0] as never);

	await commitAuditLog({
		tenantId: claims.tenant_id,
		actor: actorFromClaims(claims, actorPhone),
		action: 'DISPATCH_STATUS_MUTATION',
		targetResourceId: dispatchId,
		stateDelta: { before: { status: current }, after: { status: nextStatus } },
	});

	return jsonResponse({ dispatch: updatedDispatch });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async (request: Request): Promise<Response> => {
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	// Authenticate + staleness check. No specific permission here — each
	// action handler applies its own gate.
	const auth = await authorizeRequest(request);
	const notOk = authResponse(auth);
	if (notOk) return notOk;
	const claims = auth.claims;

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
			category?: string;
			severity?: string;
			locationSector?: string;
			rawText?: string;
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

// `sql` import kept for future use; suppress unused warning.
void sql;
