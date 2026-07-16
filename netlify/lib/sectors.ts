/**
 * Stadium sector coordinate anchors.
 *
 * Maps named zones to their fixed position on the normalized 0–1000 grid.
 * Used by the AI triage pipeline and manual incident creation to resolve
 * extracted zone names into spatial coordinates.
 *
 * Reference: docs/AI-ORCHESTRATOR.md STADIUM_SECTOR_MAP
 */
export const SECTOR_MAP: Record<string, { x: number; y: number }> = {
	'ZONE-A': { x: 450, y: 320 }, // Turnstile Sector Alpha
	'ZONE-B': { x: 510, y: 490 }, // Mid-Tier Promenade West
	'ZONE-C': { x: 720, y: 610 }, // Executive Suites Ring East
	'ZONE-D': { x: 300, y: 750 }, // Lower Bowl North Corridor
	'ZONE-E': { x: 500, y: 880 }, // South Gate Concourse
	'ZONE-F': { x: 850, y: 200 }, // Press Box Control Level
};

/** Default coordinates (pitch center) when a sector can't be resolved. */
export const DEFAULT_COORDS = { x: 500, y: 500 };

/** Resolves a sector name to grid coordinates, falling back to center. */
export function resolveSectorCoords(sector: string | null | undefined): { x: number; y: number } {
	if (!sector) return DEFAULT_COORDS;
	// Try exact match, then uppercase match.
	return SECTOR_MAP[sector] ?? SECTOR_MAP[sector.toUpperCase()] ?? DEFAULT_COORDS;
}
