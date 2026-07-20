/**
 * useOptimisticList — optimistic mutation helper for list-based UIs.
 *
 * Keeps a local copy of the list that can be mutated immediately when the
 * user performs an action. If the server confirms, the change sticks. If the
 * server rejects, the list rolls back to its previous state.
 *
 * Usage:
 *   const { items, mutate, loading, error, reload } = useOptimisticList({
 *     loader: () => adminListUsers(),
 *     initial: null,
 *   });
 *
 *   await mutate(
 *     async () => { await adminCreateStaff(input); },      // server op
 *     (draft) => { draft.push({ ...previewUser }); },      // optimistic update
 *   );
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseOptimisticListOptions<T> {
  loader: () => Promise<T>;
  /** Initial state (null while first load is in flight). */
  initial: T | null;
  /** Auto-load on mount. Defaults to true. */
  autoLoad?: boolean;
}

interface UseOptimisticListResult<T> {
  items: T | null;
  loading: boolean;
  error: string | null;
  /** Re-fetch from the server, overwriting local state. */
  reload: () => Promise<void>;
  /**
   * Run a mutation optimistically.
   *
   * @param serverOp  The async server call (e.g., adminCreateStaff).
   * @param optimisticUpdate  A pure-ish mutator that receives a draft copy
   *                          of the current items. Mutate it freely. If
   *                          serverOp throws, the draft is discarded.
   */
  mutate: (
    serverOp: () => Promise<unknown>,
    optimisticUpdate: (draft: T) => void,
  ) => Promise<boolean>;
}

export function useOptimisticList<T>({
  loader,
  initial,
  autoLoad = true,
}: UseOptimisticListOptions<T>): UseOptimisticListResult<T> {
  const [items, setItems] = useState<T | null>(initial);
  const [loading, setLoading] = useState<boolean>(autoLoad);
  const [error, setError] = useState<string | null>(null);
  const currentRef = useRef<T | null>(initial);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await loader();
      currentRef.current = fresh;
      setItems(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [loader]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (autoLoad) void reload();
  }, [autoLoad, reload]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const mutate = useCallback(
    async (
      serverOp: () => Promise<unknown>,
      optimisticUpdate: (draft: T) => void,
    ): Promise<boolean> => {
      if (currentRef.current === null) {
        // Nothing in memory yet — just run the server op, then reload.
        try {
          await serverOp();
          await reload();
          return true;
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Mutation failed');
          return false;
        }
      }

      // Deep-clone current items so the draft is independent of state.
      const draft: T = structuredCloneSafe(currentRef.current);
      optimisticUpdate(draft);

      // Apply optimistically — UI updates immediately.
      currentRef.current = draft;
      setItems(draft);

      try {
        await serverOp();
        return true;
      } catch (err) {
        // Rollback: schedule a reload on next tick so the UI shows the
        // server's authoritative state.
        setError(err instanceof Error ? err.message : 'Mutation failed');
        void reload();
        return false;
      }
    },
    [reload],
  );

  return { items, loading, error, reload, mutate };
}

/**
 * structuredClone with a JSON fallback for older runtimes. structuredClone
 * exists in Node 17+ and all modern browsers, but JSON clone is safe for our
 * plain-data lists.
 */
function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
