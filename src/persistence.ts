// IndexedDB I/O (§12). Kept out of src/game/ so the game logic never touches
// `window`. Single key, no sync, nothing leaves the device.

import { openDB, type IDBPDatabase } from 'idb';
import type { SaveState } from './game/types';

const DB_NAME = 'blorbo';
const DB_VERSION = 1;
const STORE = 'save';
const KEY = 'state';
// A separate key (same store) for the local save displaced by a cloud-save
// merge (PR 4) — see store.ts loadGame. Never read automatically; it exists
// purely so a wrong merge call is recoverable instead of destructive.
const BACKUP_KEY = 'localBackup';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    },
  });
  return dbPromise;
}

/** Returns the raw persisted object (unknown shape) or undefined if none. */
export async function loadRaw(): Promise<unknown> {
  try {
    const db = await getDb();
    return await db.get(STORE, KEY);
  } catch {
    // A blocked/unavailable IndexedDB must not crash the game — start fresh.
    return undefined;
  }
}

export async function persist(state: SaveState): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE, state, KEY);
  } catch {
    // Best effort; nothing we can do if storage is unavailable.
  }
}

/**
 * Stash a local save that's about to be overwritten by a winning cloud save
 * (PR 4 merge, see store.ts loadGame). This is a safety net, not a feature —
 * nothing reads it back automatically. If the merge rule ever picks wrong,
 * the player's progress is still on the device, one loadBackup() away.
 */
export async function backupLocal(state: SaveState): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE, state, BACKUP_KEY);
  } catch {
    // Best effort; a failed backup must never block adopting the cloud save.
  }
}

/** Returns the stashed local save (unknown shape) or undefined if none. */
export async function loadBackup(): Promise<unknown> {
  try {
    const db = await getDb();
    return await db.get(STORE, BACKUP_KEY);
  } catch {
    return undefined;
  }
}
