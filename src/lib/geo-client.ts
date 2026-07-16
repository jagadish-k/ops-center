/**
 * Client-side geographic utilities.
 *
 * Only the haversine distance is needed client-side (for the 3-meter debounce).
 * The GPS-to-grid projection lives server-side in netlify/lib/geo.ts.
 */

/**
 * Haversine distance between two GPS points in meters.
 * Used by useGeolocationTracking for the 3-meter threshold check (PRD §7.1).
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
