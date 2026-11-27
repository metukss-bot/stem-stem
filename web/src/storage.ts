/** 분석이 끝난 곡을 폰(IndexedDB)에 저장해 오프라인으로 재생한다. */
import type { SavedSong } from './types'

const DB_NAME = 'stemstem'
const STORE = 'songs'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const saveSong = (song: SavedSong) => tx('readwrite', (s) => s.put(song))
export const getSong = (id: string) => tx<SavedSong | undefined>('readonly', (s) => s.get(id))
export const deleteSong = (id: string) => tx('readwrite', (s) => s.delete(id))
export const listSavedIds = () =>
  tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).then((keys) => keys.map(String))

/** 브라우저가 저장소를 함부로 지우지 않도록 요청 (가능한 경우). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist()
  } catch {
    /* 무시 */
  }
}
