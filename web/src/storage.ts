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

/** 폰에 저장된 곡 목록 (제목, 키, BPM 포함). */
export async function listSaved(): Promise<LibrarySongLike[]> {
  const all = await tx<SavedSong[]>('readonly', (s) => s.getAll())
  return all
    .map((s) => ({
      id: s.id,
      title: s.analysis.title,
      duration: s.analysis.duration,
      bpm: s.analysis.bpm,
      key: s.analysis.key?.name,
      savedAt: s.savedAt,
    }))
    .sort((a, b) => b.savedAt - a.savedAt)
}

export interface LibrarySongLike {
  id: string
  title: string
  duration?: number
  bpm?: number | null
  key?: string
  savedAt: number
}
