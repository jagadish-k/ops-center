import { describe, it, expect } from 'vitest';

/**
 * Coordinate projection math for the 0–1000 stadium grid.
 *
 * These functions translate raw device pixel coordinates into normalized grid
 * vectors and back. They underpin the canvas raycasting and incident placement
 * (see docs/CANVAS-ENGINE.md, docs/MAP-OPTIMIZATION.md).
 */

interface Bounds {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** Convert a raw client click position into a normalized 0–1000 grid coordinate. */
export function clientToGrid(
	clientX: number,
	clientY: number,
	bounds: Bounds,
): { x: number; y: number } {
	const clampedX = Math.max(0, Math.min(clientX - bounds.left, bounds.width));
	const clampedY = Math.max(0, Math.min(clientY - bounds.top, bounds.height));
	return {
		x: Math.round((clampedX / bounds.width) * 1000),
		y: Math.round((clampedY / bounds.height) * 1000),
	};
}

/** Convert a normalized grid coordinate into pixel offsets within a bounds box. */
export function gridToClient(
	gridX: number,
	gridY: number,
	bounds: Bounds,
): { x: number; y: number } {
	return {
		x: (gridX / 1000) * bounds.width + bounds.left,
		y: (gridY / 1000) * bounds.height + bounds.top,
	};
}

/** Euclidean distance between two grid points (used by the canvas raycaster). */
export function gridDistance(
	a: { x: number; y: number },
	b: { x: number; y: number },
): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Clamp a grid coordinate into the valid 0–1000 range. */
export function clampGrid(coord: { x: number; y: number }): { x: number; y: number } {
	return {
		x: Math.max(0, Math.min(coord.x, 1000)),
		y: Math.max(0, Math.min(coord.y, 1000)),
	};
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('clientToGrid', () => {
	const bounds: Bounds = { left: 100, top: 50, width: 800, height: 600 };

	it('resolves the precise center of the bounds', () => {
		const result = clientToGrid(500, 350, bounds); // 100 + 800/2, 50 + 600/2
		expect(result.x).toBe(500);
		expect(result.y).toBe(500);
	});

	it('clamps overflow coordinates to the grid perimeter', () => {
		const result = clientToGrid(1000, 900, bounds);
		expect(result.x).toBe(1000);
		expect(result.y).toBe(1000);
	});

	it('resolves the top-left origin to (0, 0)', () => {
		const result = clientToGrid(100, 50, bounds);
		expect(result.x).toBe(0);
		expect(result.y).toBe(0);
	});
});

describe('gridToClient', () => {
	const bounds: Bounds = { left: 0, top: 0, width: 1000, height: 1000 };

	it('round-trips through clientToGrid at the center', () => {
		const grid = { x: 500, y: 500 };
		const client = gridToClient(grid.x, grid.y, bounds);
		const back = clientToGrid(client.x, client.y, bounds);
		expect(back.x).toBe(500);
		expect(back.y).toBe(500);
	});
});

describe('gridDistance', () => {
	it('computes Euclidean distance correctly', () => {
		expect(gridDistance({ x: 0, y: 0 }, { x: 300, y: 400 })).toBe(500);
	});

	it('returns 0 for identical points', () => {
		expect(gridDistance({ x: 250, y: 250 }, { x: 250, y: 250 })).toBe(0);
	});
});

describe('clampGrid', () => {
	it('clamps negative values to 0', () => {
		expect(clampGrid({ x: -50, y: -10 })).toEqual({ x: 0, y: 0 });
	});

	it('clamps values over 1000', () => {
		expect(clampGrid({ x: 1500, y: 9999 })).toEqual({ x: 1000, y: 1000 });
	});

	it('passes through in-range values unchanged', () => {
		expect(clampGrid({ x: 500, y: 750 })).toEqual({ x: 500, y: 750 });
	});
});
