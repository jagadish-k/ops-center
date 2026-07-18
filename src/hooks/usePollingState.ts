/**
 * usePollingState — diff-based polling hook (ADR-0004).
 *
 * Polls `/api/state-poll` on a ~2s cadence and exposes the latest operational
 * state (incidents, staff, dispatches). While the backend endpoint is unbuilt
 * (M2–M5), every failed poll transparently falls back to mock fixtures so the
 * full UI remains reviewable.
 *
 * Implementation notes:
 *   - The latest snapshot is mirrored into a ref so non-React consumers (e.g.
 *     the canvas rAF loop) can read fresh data without triggering re-renders.
 *   - A recursive setTimeout drives the cadence so backoff can expand on error
 *     and the interval never drifts into stacked overlapping requests.
 *   - All in-flight requests are aborted on unmount.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type {
	IncidentReport,
	WhitelistUser,
	DispatchDirective,
	StatePollDiff,
} from '@/types';
import { apiFetch, ApiError } from '@/services/api';
import { mockIncidents, mockStaff, mockDispatches } from '@/lib/mockData';

export interface PollingState {
	incidents: IncidentReport[];
	staff: WhitelistUser[];
	dispatches: DispatchDirective[];
	mapLayout: unknown;
	loading: boolean;
	/** False when the last poll failed (endpoint unreachable / errored). */
	connectionHealthy: boolean;
}

const BASE_INTERVAL_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

function isStale(): number {
	return Date.now();
}

export function usePollingState(tenantId: string | undefined): PollingState {
	const [incidents, setIncidents] = useState<IncidentReport[]>([]);
	const [staff, setStaff] = useState<WhitelistUser[]>([]);
	const [dispatches, setDispatches] = useState<DispatchDirective[]>([]);
	const [mapLayout, setMapLayout] = useState<unknown>(null);
	const [loading, setLoading] = useState(true);
	const [connectionHealthy, setConnectionHealthy] = useState(true);

	// Mirror of the latest snapshot — read by imperative consumers (canvas).
	const snapshotRef = useRef<PollingState>({
		incidents: [],
		staff: [],
		dispatches: [],
		mapLayout: null,
		loading: true,
		connectionHealthy: true,
	});

	const abortRef = useRef<AbortController | null>(null);
	const backoffRef = useRef(BASE_INTERVAL_MS);
	const seededRef = useRef(false);
	const everSucceededRef = useRef(false);
	const mountedRef = useRef(true);

	const seedMockData = useCallback((): void => {
		setIncidents(mockIncidents);
		setStaff(mockStaff);
		setDispatches(mockDispatches);
		seededRef.current = true;
	}, []);

	const poll = useCallback(async (): Promise<void> => {
		if (!mountedRef.current || !tenantId) return;

		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		try {
			const diff = await apiFetch<StatePollDiff>('/api/state-poll', {
				method: 'POST',
				body: JSON.stringify({
					tenantId,
					sinceTimestamp: isStale() - BASE_INTERVAL_MS,
				} satisfies { tenantId: string; sinceTimestamp: number }),
				signal: controller.signal,
			});

			if (!mountedRef.current) return;

			setIncidents(diff.incidents ?? []);
			setStaff(diff.staff ?? []);
			setDispatches(diff.dispatches ?? []);
			setMapLayout(diff.mapLayout ?? null);
			setConnectionHealthy(true);
			setLoading(false);
			backoffRef.current = BASE_INTERVAL_MS;
			everSucceededRef.current = true;
		} catch (err) {
			if (!mountedRef.current) return;
			// Aborted requests are expected on unmount / rapid re-poll — ignore.
			if (err instanceof DOMException && err.name === 'AbortError') return;

			// Endpoint missing or errored — seed mock fixtures once so the UI is
			// populated for visual review, then keep retrying with backoff.
			// Only seed if we've never received real data (avoids mock flicker
			// after a transient network blip).
			if (!seededRef.current && !everSucceededRef.current) seedMockData();
			setConnectionHealthy(false);
			if (loading) setLoading(false);

			// Exponential backoff capped at MAX_BACKOFF_MS.
			backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);

			// Swallow ApiError shape — it only affects cadence here.
			if (err instanceof ApiError) {
				/* non-2xx; will retry with backoff */
			}
		}
	}, [tenantId, seedMockData, loading]);

	useEffect(() => {
		mountedRef.current = true;

		let timer: ReturnType<typeof setTimeout> | undefined;

		const tick = async (): Promise<void> => {
			await poll();
			if (mountedRef.current) {
				timer = setTimeout(tick, backoffRef.current);
			}
		};

		// Kick off immediately, then cadence via recursive setTimeout.
		void tick();

		return () => {
			mountedRef.current = false;
			if (timer) clearTimeout(timer);
			abortRef.current?.abort();
		};
	}, [poll]);

	// Keep the imperative mirror in sync for non-React consumers (canvas rAF loop).
	// Must be in useEffect — writing refs during render is disallowed by React 19.
	useEffect(() => {
		snapshotRef.current = { incidents, staff, dispatches, mapLayout, loading, connectionHealthy };
	}, [incidents, staff, dispatches, mapLayout, loading, connectionHealthy]);

	return { incidents, staff, dispatches, mapLayout, loading, connectionHealthy };
}
