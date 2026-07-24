// IndexedDB I/O (§12). Kept out of src/game/ so the game logic never touches
// `window`. Single key, no sync, nothing leaves the device.

import { openDB, type IDBPDatabase } from 'idb';
import type { SaveState } from './game/types';

const DB_NAME = 'blorbo';
const DB_VERSION = 1;
const STORE = 'save';
const KEY = 'state';

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
