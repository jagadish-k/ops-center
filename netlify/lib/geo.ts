/**
 * Geographic utilities — GPS ↔ grid projection + distance calculations.
 *
 * Projects raw GPS lat/lng onto the normalized 0–1000 stadium grid using a
 * per-tenant bounding box. Also provides haversine distance for the 3-meter
 * client-side debounce (PRD §7.1).
 */

export interface BoundingBox {
	minLat: number;
	maxLat: number;
	minLng: number;
	maxLng: number;
}

/**
 * Projects a GPS coordinate onto the 0–1000 grid.
 * Y is inverted so that north (higher latitude) = lower Y (top of screen).
 */
export function gpsToGrid(
	lat: number,
	lng: number,
	bbox: BoundingBox,
): { x: number; y: number } {
	const lngRange = bbox.maxLng - bbox.minLng;
	const latRange = bbox.maxLat - bbox.minLat;

	const x = lngRange === 0 ? 500 : Math.round(((lng - bbox.minLng) / lngRange) * 1000);
	const y = latRange === 0 ? 500 : Math.round(((bbox.maxLat - lat) / latRange) * 1000);

	return {
		x: Math.max(0, Math.min(1000, x)),
		y: Math.max(0, Math.min(1000, y)),
	};
}

/** Clamps a value into the [0, max] range. */
function clamp(val: number, max: number): number {
	return Math.max(0, Math.min(max, val));
}

/**
 * Haversine distance between two GPS points in meters.
 * Used by the client-side 3-meter debounce (PRD §7.1).
 */
export function haversineMeters(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const R = 6371000; // Earth radius in meters
	const toRad = (deg: number): number => (deg * Math.PI) / 180;

	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);

	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}
