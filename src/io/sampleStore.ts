// User audio files live in IndexedDB (localStorage is far too small for audio);
// projects refer to them by id.

const DB_NAME = 'cheeky-synth';
const STORE = 'samples';

export interface StoredSample {
  id: string;
  name: string;
  data: ArrayBuffer; // the original file bytes
  added: number;
}

export type SampleListing = Omit<StoredSample, 'data'>;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = body(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export function putSample(sample: StoredSample): Promise<IDBValidKey> {
  return run('readwrite', (store) => store.put(sample));
}

export function getSample(id: string): Promise<StoredSample | undefined> {
  return run('readonly', (store) => store.get(id) as IDBRequest<StoredSample | undefined>);
}

export async function listSamples(): Promise<SampleListing[]> {
  const all = await run('readonly', (store) => store.getAll() as IDBRequest<StoredSample[]>);
  return all.map(({ id, name, added }) => ({ id, name, added })).sort((a, b) => b.added - a.added);
}

export function deleteSample(id: string): Promise<undefined> {
  return run('readwrite', (store) => store.delete(id));
}
