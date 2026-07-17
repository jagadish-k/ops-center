/**
 * Shared incident creation helper.
 *
 * Used by both the AI triage pipeline (voice) and the manual triage drawer
 * to INSERT a new incident into Postgres and return the mapped domain type.
 */
import { randomUUID } from 'node:crypto';
import { db } from './db.ts';
import { incidentsTable } from '../../database/schema.ts';
import { eq } from 'drizzle-orm';
import { mapIncident } from './mappers.ts';
import { resolveSectorCoords } from './sectors.ts';
import type { IncidentCategory, IncidentSeverity, InfoTier } from '../../src/types';

export interface CreateIncidentInput {
	tenantId: string;
	source?: 'field_staff' | 'social_media';
	tier: InfoTier;
	rawText: string;
	category: IncidentCategory;
	severity: IncidentSeverity;
	locationSector: string;
	actionRequired?: string;
	coordOverride?: { x: number; y: number };
}

/** Creates an incident in Postgres and returns the mapped domain object. */
export async function createIncident(input: CreateIncidentInput) {
	const id = `inc_${randomUUID().slice(0, 12)}`;
	const coords = input.coordOverride ?? resolveSectorCoords(input.locationSector);

	await db
		.insert(incidentsTable)
		.values({
			id,
			tenantId: input.tenantId,
			source: input.source ?? 'field_staff',
			tier: input.tier,
			status: 'OPEN',
			rawText: input.rawText,
			category: input.category,
			severity: input.severity,
			locationSector: input.locationSector,
			actionRequired: input.actionRequired ?? null,
			coordX: coords.x,
			coordY: coords.y,
		})
		.execute();

	const rows = await db
		.select()
		.from(incidentsTable)
		.where(eq(incidentsTable.id, id))
		.execute();
	return mapIncident(rows[0] as never);
}
