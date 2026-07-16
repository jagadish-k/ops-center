/**
 * useGeolocationTracking — live staff position tracking (PRD §7.1, ADR-0004).
 *
 * Uses navigator.geolocation.watchPosition to capture GPS updates, then
 * applies the two client-side guards before transmitting:
 *
 *   1. 3-meter threshold: if the operative moved < 3m since the last write,
 *      the update is skipped entirely (filters GPS jitter in concrete structures).
 *   2. 500ms throttle: at most one write per 500ms (drops pulse spam).
 *
 * On each qualifying update, POSTs { latitude, longitude } to /api/staff-location.
 * The server projects to the 0–1000 grid; the next state-poll reflects the
 * new position on the canvas.
 *
 * Abort + cleanup on unmount.
 */
import { useEffect, useRef } from 'react';
import { apiFetch } from '@/services/api';
import { haversineMeters } from '@/lib/geo-client';

const THRESHOLD_METERS = 3;
const THROTTLE_MS = 500;

export function useGeolocationTracking(staffPhone: string | undefined, enabled: boolean): void {
	const watchIdRef = useRef<number | null>(null);
	const lastSentRef = useRef<{ lat: number; lng: number; ts: number } | null>(null);

	useEffect(() => {
		if (!enabled || !staffPhone) return;
		if (typeof navigator === 'undefined' || !navigator.geolocation) {
			console.warn('[geo] Geolocation API unavailable — position tracking disabled.');
			return;
		}

		const sendUpdate = async (lat: number, lng: number): Promise<void> => {
			try {
				await apiFetch('/api/staff-location', {
					method: 'POST',
					body: JSON.stringify({ latitude: lat, longitude: lng }),
				});
				lastSentRef.current = { lat, lng, ts: Date.now() };
			} catch (err) {
				// Network blips are expected in congested stadia — fail silently.
				console.warn('[geo] Location update failed:', err);
			}
		};

		const handlePosition = (pos: GeolocationPosition): void => {
			const { latitude, longitude } = pos.coords;
			const last = lastSentRef.current;
			const now = Date.now();

			// Guard 1: 3-meter threshold.
			if (last) {
				const distance = haversineMeters(last.lat, last.lng, latitude, longitude);
				if (distance < THRESHOLD_METERS) return; // jitter — skip.
			}

			// Guard 2: 500ms throttle.
			if (last && now - last.ts < THROTTLE_MS) return; // too soon — drop.

			void sendUpdate(latitude, longitude);
		};

		const handleError = (err: GeolocationPositionError): void => {
			console.warn('[geo] watchPosition error:', err.message);
		};

		watchIdRef.current = navigator.geolocation.watchPosition(
			handlePosition,
			handleError,
			{ enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
		);

		return () => {
			if (watchIdRef.current !== null) {
				navigator.geolocation.clearWatch(watchIdRef.current);
				watchIdRef.current = null;
			}
		};
	}, [staffPhone, enabled]);
}
