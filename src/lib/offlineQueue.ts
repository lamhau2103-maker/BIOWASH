import { supabase } from './supabase';

export interface QueuedMutation {
  id: string;
  table: 'inspection_results' | 'inspections' | 'corrective_actions' | 'vehicle_washes' | 'checklist_items';
  operation: 'upsert' | 'update' | 'insert';
  payload: Record<string, unknown>;
  matchColumn?: string;
  matchValue?: string;
  onConflict?: string;
  createdAt: number;
}

const DB_NAME = 'biowash_offline_queue_db';
const STORE_NAME = 'mutations';
const DB_VERSION = 1;

function openQueueDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOfflineMutation(mutation: Omit<QueuedMutation, 'id' | 'createdAt'>): Promise<void> {
  try {
    const db = await openQueueDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const item: QueuedMutation = {
      ...mutation,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
    };
    store.put(item);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Fallback if IndexedDB is blocked in private mode
  }
}

export async function getQueuedMutations(): Promise<QueuedMutation[]> {
  try {
    const db = await openQueueDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        db.close();
        const items = (req.result as QueuedMutation[]).sort((a, b) => a.createdAt - b.createdAt);
        resolve(items);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return [];
  }
}

async function removeQueuedMutation(id: string): Promise<void> {
  try {
    const db = await openQueueDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    return new Promise((resolve) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Ignore
  }
}

export async function clearOfflineQueue(): Promise<void> {
  try {
    const db = await openQueueDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    return new Promise((resolve) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Ignore
  }
}

export async function flushOfflineQueue(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  const items = await getQueuedMutations();
  if (items.length === 0) return 0;

  let syncedCount = 0;
  for (const item of items) {
    try {
      let error = null;
      if (item.operation === 'upsert') {
        const res = await supabase
          .from(item.table)
          .upsert(item.payload, item.onConflict ? { onConflict: item.onConflict } : undefined);
        error = res.error;
      } else if (item.operation === 'update' && item.matchColumn && item.matchValue) {
        const res = await supabase
          .from(item.table)
          .update(item.payload)
          .eq(item.matchColumn, item.matchValue);
        error = res.error;
      } else if (item.operation === 'insert') {
        const res = await supabase.from(item.table).insert(item.payload);
        error = res.error;
      }

      if (!error) {
        await removeQueuedMutation(item.id);
        syncedCount++;
      }
    } catch {
      // Stop flushing if network drops again
      break;
    }
  }
  return syncedCount;
}
