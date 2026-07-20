/**
 * IndexedDB store for offline mutation queueing (PRD §7.3, M7).
 *
 * When the Field Client loses connectivity, mutation requests (incident
 * creation, dispatch status updates) are stored here and drained in FIFO
 * order when the connection is restored.
 *
 * Uses the `idb` library for a clean Promise-based IndexedDB wrapper.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface QueuedMutation {
  id?: number;
  timestamp: number; // original client timestamp (for reconciliation)
  endpoint: string; // e.g. '/api/mutations'
  method: string; // e.g. 'POST'
  body: string; // JSON-stringified request body
  label: string; // human-readable description for UI
}

interface OfflineDB extends DBSchema {
  pending_mutations: {
    key: number;
    value: QueuedMutation;
    indexes: { 'by-timestamp': number };
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null;

function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>('stadium-ops-offline', 1, {
      upgrade(db) {
        const store = db.createObjectStore('pending_mutations', {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by-timestamp', 'timestamp');
      },
    });
  }
  return dbPromise;
}

/** Adds a mutation to the offline queue. */
export async function enqueueMutation(
  mutation: Omit<QueuedMutation, 'id'>,
): Promise<void> {
  const db = await getDB();
  await db.add('pending_mutations', mutation);
}

/** Returns all queued mutations in FIFO order (by timestamp ascending). */
export async function getQueuedMutations(): Promise<QueuedMutation[]> {
  const db = await getDB();
  return db.getAllFromIndex('pending_mutations', 'by-timestamp');
}

/** Removes a mutation from the queue after successful replay. */
export async function removeMutation(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('pending_mutations', id);
}

/** Returns the count of pending mutations. */
export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  return db.count('pending_mutations');
}

/** Removes all queued mutations (used after full drain or for testing). */
export async function clearQueue(): Promise<void> {
  const db = await getDB();
  await db.clear('pending_mutations');
}

export type { QueuedMutation };
