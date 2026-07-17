import { describe, it, expect } from 'vitest';
import { resolveSectorCoords, SECTOR_MAP, DEFAULT_COORDS } from '../../netlify/lib/sectors';

/**
 * Tests for the sector coordinate resolution helper (netlify/lib/sectors.ts).
 * Pure functions — no DB or API calls.
 */

describe('SECTOR_MAP', () => {
	it('contains all six zones (A through F)', () => {
		const zones = Object.keys(SECTOR_MAP);
		expect(zones).toEqual(['ZONE-A', 'ZONE-B', 'ZONE-C', 'ZONE-D', 'ZONE-E', 'ZONE-F']);
	});

	it('all coordinates are within the 0–1000 grid', () => {
		for (const coords of Object.values(SECTOR_MAP)) {
			expect(coords.x).toBeGreaterThanOrEqual(0);
			expect(coords.x).toBeLessThanOrEqual(1000);
			expect(coords.y).toBeGreaterThanOrEqual(0);
			expect(coords.y).toBeLessThanOrEqual(1000);
		}
	});
});

describe('resolveSectorCoords', () => {
	it('resolves a known sector to its coordinates', () => {
		expect(resolveSectorCoords('ZONE-A')).toEqual({ x: 450, y: 320 });
		expect(resolveSectorCoords('ZONE-F')).toEqual({ x: 850, y: 200 });
	});

	it('handles lowercase sector names', () => {
		expect(resolveSectorCoords('zone-a')).toEqual({ x: 450, y: 320 });
	});

	it('returns default center coords for unknown sectors', () => {
		expect(resolveSectorCoords('ZONE-Z')).toEqual(DEFAULT_COORDS);
		expect(resolveSectorCoords('UNKNOWN')).toEqual(DEFAULT_COORDS);
	});

	it('returns default center coords for null/undefined', () => {
		expect(resolveSectorCoords(null)).toEqual(DEFAULT_COORDS);
		expect(resolveSectorCoords(undefined)).toEqual(DEFAULT_COORDS);
	});

	it('default coords are the grid center', () => {
		expect(DEFAULT_COORDS).toEqual({ x: 500, y: 500 });
	});
});
