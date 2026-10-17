/**
 * Local persistence. Everything VFM stores stays on the device: no cloud
 * database, no telemetry upload. Derived features only, never raw audio.
 */

const DB_NAME = 'vfm-local';
const DB_VERSION = 1;
const STORES = ['profile', 'baseline', 'readings', 'events', 'alerts'];

/** Readings retained on device. The table pages over this window. */
export const READING_LIMIT = 1000;
export const EVENT_LIMIT = 40;

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

class VfmStore {
  constructor() {
    this.db = null;
    this.available = true;
  }

  async open() {
    if (this.db) return this.db;
    if (!this.available) throw new Error('IndexedDB is unavailable in this browser context.');
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('profile')) db.createObjectStore('profile', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('baseline')) db.createObjectStore('baseline', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('readings')) {
          const readings = db.createObjectStore('readings', { keyPath: 'id', autoIncrement: true });
          readings.createIndex('timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('alerts')) db.createObjectStore('alerts', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Local storage is blocked by another open VFM tab.'));
    });
    return this.db;
  }

  async get(storeName, key) {
    const db = await this.open();
    return (await request(db.transaction(storeName, 'readonly').objectStore(storeName).get(key))) || null;
  }

  async getAll(storeName) {
    const db = await this.open();
    return (await request(db.transaction(storeName, 'readonly').objectStore(storeName).getAll())) || [];
  }

  async put(storeName, value) {
    const db = await this.open();
    return request(db.transaction(storeName, 'readwrite').objectStore(storeName).put(value));
  }

  async add(storeName, value) {
    const db = await this.open();
    return request(db.transaction(storeName, 'readwrite').objectStore(storeName).add(value));
  }

  /** Drop the oldest readings once the on-device window is full. */
  async pruneReadings() {
    const records = await this.getAll('readings');
    if (records.length <= READING_LIMIT) return;
    records.sort((a, b) => a.timestamp - b.timestamp);
    const surplus = records.slice(0, records.length - READING_LIMIT);
    const db = await this.open();
    const tx = db.transaction('readings', 'readwrite');
    surplus.forEach((record) => tx.objectStore('readings').delete(record.id));
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear() {
    const db = await this.open();
    await Promise.all(STORES.map((name) => request(db.transaction(name, 'readwrite').objectStore(name).clear())));
  }
}

export const store = new VfmStore();

/** Storage writes are best effort: a monitoring UI must not break if quota is hit. */
export function persistQuietly(promise) {
  return promise.catch(() => undefined);
}
