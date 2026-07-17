/**
 * useOfflineQueue — offline mutation resilience hook (PRD §7.3, M7).
 *
 * Provides:
 *   - isOnline: real-time navigator.onLine status
 *   - pendingCount: number of mutations queued in IndexedDB
 *   - enqueueOrSend: tries the API; on network failure, queues to IndexedDB
 *   - drain: replays all queued mutations in FIFO order when online
 *
 * When the Field Client loses cell signal in a concrete stadium:
 *   1. Mutation calls fail → enqueueOrSend stores them in IndexedDB
 *   2. The UI shows a "pending" indicator
 *   3. On reconnect (online event), drain replays all queued items in order
 *   4. Original client timestamps are preserved for chronological reconciliation
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, ApiError } from '@/services/api';
import {
	enqueueMutation,
	getQueuedMutations,
	removeMutation,
	getPendingCount,
} from '@/lib/offline-db';

export interface OfflineQueueState {
	isOnline: boolean;
	pendingCount: number;
	/** Tries the API; on network failure, queues to IndexedDB. Returns true if queued. */
	enqueueOrSend: (
		label: string,
		endpoint: string,
		method: string,
		body: unknown,
	) => Promise<{ queued: boolean }>;
	/** Manually triggers a drain of the queue (also fires automatically on 'online' event). */
	drain: () => Promise<void>;
}

export function useOfflineQueue(): OfflineQueueState {
	const [isOnline, setIsOnline] = useState(
		typeof navigator !== 'undefined' ? navigator.onLine : true,
	);
	const [pendingCount, setPendingCount] = useState(0);
	const drainingRef = useRef(false);

	// Refresh the pending count from IndexedDB.
	const refreshCount = useCallback(async () => {
		try {
			const count = await getPendingCount();
			setPendingCount(count);
		} catch {
			// IndexedDB may be unavailable in rare contexts.
		}
	}, []);

	// Drain the queue: replay all pending mutations in FIFO order.
	const drain = useCallback(async () => {
		if (drainingRef.current) return; // prevent concurrent drains
		drainingRef.current = true;

		try {
			const queued = await getQueuedMutations();
			for (const item of queued) {
				if (item.id == null) continue;
				try {
					await apiFetch(item.endpoint, {
						method: item.method,
						body: item.body,
					});
					await removeMutation(item.id);
				} catch {
					// Stop on first failure — remaining items stay queued.
					break;
				}
			}
			await refreshCount();
		} finally {
			drainingRef.current = false;
		}
	}, [refreshCount]);

	// Try the API; queue on network failure.
	const enqueueOrSend = useCallback<OfflineQueueState['enqueueOrSend']>(
		async (label, endpoint, method, body) => {
			try {
				await apiFetch(endpoint, { method, body: JSON.stringify(body) });
				return { queued: false };
			} catch (err) {
				// Only queue on network errors (not server errors like 400/403).
				const isNetworkError =
					err instanceof ApiError
						? false // ApiError means the server responded (just with an error status)
						: true; // TypeError or similar = network failure

				if (isNetworkError || !navigator.onLine) {
					await enqueueMutation({
						timestamp: Date.now(),
						endpoint,
						method,
						body: JSON.stringify(body),
						label,
					});
					await refreshCount();
					return { queued: true };
				}
				throw err; // Real server error — re-throw for the caller to handle.
			}
		},
		[refreshCount],
	);

	// Online/offline event listeners.
	useEffect(() => {
		const handleOnline = () => {
			setIsOnline(true);
			void drain();
		};
		const handleOffline = () => setIsOnline(false);

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		// Load pending count on mount.
		void refreshCount();
		// If we're already online and have pending items, drain immediately.
		if (navigator.onLine) void drain();

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	}, [drain, refreshCount]);

	return { isOnline, pendingCount, enqueueOrSend, drain };
}
