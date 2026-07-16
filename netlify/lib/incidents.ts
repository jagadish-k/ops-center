/**
 * Shared incident creation helper.
 *
 * Used by both the AI triage pipeline (voice) and the manual triage drawer
 * to INSERT a new incident into Postgres and return the mapped domain type.
 */
import { randomUUID } from 'node:crypto';
import { query } from './db';
import { mapIncident } from './mappers';
import { resolveSectorCoords } from './sectors';
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
	/** Override coordinates (skips sector lookup if provided). */
	coordOverride?: { x: number; y: number };
}

/** Creates an incident in Postgres and returns the mapped domain object. */
export async function createIncident(input: CreateIncidentInput) {
	const id = `inc_${randomUUID().slice(0, 12)}`;
	const coords = input.coordOverride ?? resolveSectorCoords(input.locationSector);

	await query(
		`INSERT INTO incidents
		   (id, tenant_id, source, tier, status, raw_text, category, severity,
		    location_sector, action_required, coord_x, coord_y)
		 VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8, $9, $10, $11)`,
		[
			id,
			input.tenantId,
			input.source ?? 'field_staff',
			input.tier,
			input.rawText,
			input.category,
			input.severity,
			input.locationSector,
			input.actionRequired ?? null,
			coords.x,
			coords.y,
		],
	);

	const rows = await query(`SELECT * FROM incidents WHERE id = $1`, [id]);
	return mapIncident(rows[0] as never);
}
