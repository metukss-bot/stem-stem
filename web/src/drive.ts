/**
 * 구글 드라이브 연동.
 * 내 드라이브/StemStem/
 *   inbox/       ← 폰에서 올린 원곡
 *   songs/<id>/  ← Colab 분석 결과 (스템 mp3 + analysis.json)
 *   library.json
 */
import type { Analysis, LibrarySong } from './types'

const SCOPE = 'https://www.googleapis.com/auth/drive'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER = 'application/vnd.google-apps.folder'
/** stemstem 구글 클라우드 프로젝트의 웹 클라이언트 ID (공개 값, 비밀 아님) */
const DEFAULT_CLIENT_ID = '248412144774-kmm0fsdfsilncfaee784oe0eer6g85k5.apps.googleusercontent.com'
export const ROOT_NAME = 'StemStem'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any
  }
}

let token: { value: string; expiresAt: number } | null = null
let tokenClient: any = null

export function getClientId(): string {
  try {
    const saved = localStorage.getItem('stemstem.clientId')
    if (saved) return saved
  } catch {
    /* 무시 */
  }
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID
}

export function setClientId(id: string) {
  try {
    localStorage.setItem('stemstem.clientId', id.trim())
  } catch {
    /* 무시 */
  }
  tokenClient = null
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('구글 로그인 스크립트를 불러오지 못했습니다'))
    document.head.appendChild(s)
  })
}

export function isSignedIn() {
  return !!token && token.expiresAt > Date.now() + 60_000
}

/** 버튼 클릭 안에서 불러야 팝업이 막히지 않는다. */
export async function signIn(): Promise<void> {
  const clientId = getClientId()
  if (!clientId) throw new Error('구글 클라이언트 ID가 설정되지 않았습니다 (설정에서 입력)')
  await loadGis()
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: () => {},
      })
    }
    tokenClient.callback = (resp: any) => {
      if (resp.error) return reject(new Error(resp.error_description || resp.error))
      token = { value: resp.access_token, expiresAt: Date.now() + Number(resp.expires_in) * 1000 }
      resolve()
    }
    tokenClient.error_callback = (err: any) => reject(new Error(err?.message || '로그인 취소'))
    tokenClient.requestAccessToken({ prompt: token ? '' : undefined })
  })
}

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  if (!isSignedIn()) await signIn()
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token!.value}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`드라이브 오류 ${res.status}: ${text.slice(0, 200)}`)
  }
  return res
}

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

async function findChild(parent: string, name: string, folder = false): Promise<string | null> {
  const query = [
    `name = '${q(name)}'`,
    `'${parent}' in parents`,
    'trashed = false',
    folder ? `mimeType = '${FOLDER}'` : '',
  ]
    .filter(Boolean)
    .join(' and ')
  const res = await api(`${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=10`)
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

async function ensureFolder(parent: string, name: string): Promise<string> {
  const found = await findChild(parent, name, true)
  if (found) return found
  const res = await api(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
  })
  return (await res.json()).id
}

let rootCache: { root: string; inbox: string; songs: string } | null = null

async function folders() {
  if (rootCache) return rootCache
  const root = await ensureFolder('root', ROOT_NAME)
  const [inbox, songs] = await Promise.all([ensureFolder(root, 'inbox'), ensureFolder(root, 'songs')])
  rootCache = { root, inbox, songs }
  return rootCache
}

/** 폰에서 고른 곡을 inbox로 올린다 (resumable 업로드). */
export async function uploadSong(file: File, onProgress?: (p: number) => void): Promise<void> {
  const { inbox } = await folders()
  const init = await api(`${UPLOAD}/files?uploadType=resumable`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': file.type || 'audio/mpeg',
    },
    body: JSON.stringify({ name: file.name, parents: [inbox] }),
  })
  const location = init.headers.get('Location')
  if (!location) throw new Error('업로드 주소를 받지 못했습니다')
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', location)
    xhr.setRequestHeader('Authorization', `Bearer ${token!.value}`)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`업로드 실패 ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('업로드 중 네트워크 오류'))
    xhr.send(file)
  })
}

/** inbox에 남아 있는(아직 분석 안 된) 곡 이름들. */
export async function listInbox(): Promise<string[]> {
  const { inbox } = await folders()
  const query = `'${inbox}' in parents and trashed = false`
  const res = await api(`${API}/files?q=${encodeURIComponent(query)}&fields=files(name)&pageSize=100`)
  return ((await res.json()).files ?? []).map((f: { name: string }) => f.name)
}

export async function fetchLibrary(): Promise<LibrarySong[]> {
  const { root } = await folders()
  const id = await findChild(root, 'library.json')
  if (!id) return []
  const res = await api(`${API}/files/${id}?alt=media`)
  const data = await res.json()
  return data.songs ?? []
}

/** 곡 폴더의 analysis.json과 스템을 모두 받아온다. */
export async function downloadSong(
  songId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ analysis: Analysis; stems: Record<string, Blob> }> {
  const { songs } = await folders()
  const folder = await findChild(songs, songId, true)
  if (!folder) throw new Error('드라이브에서 곡 폴더를 찾지 못했습니다')
  const query = `'${folder}' in parents and trashed = false`
  const res = await api(`${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=50`)
  const files: { id: string; name: string }[] = (await res.json()).files ?? []
  const byName = new Map(files.map((f) => [f.name, f.id]))
  const aId = byName.get('analysis.json')
  if (!aId) throw new Error('analysis.json이 없습니다. Colab 분석이 끝났는지 확인하세요')
  const analysis: Analysis = await (await api(`${API}/files/${aId}?alt=media`)).json()
  const stems: Record<string, Blob> = {}
  let done = 0
  onProgress?.(done, analysis.stems.length)
  for (const s of analysis.stems) {
    const fid = byName.get(s.file)
    if (!fid) throw new Error(`${s.file} 파일이 없습니다`)
    stems[s.id] = await (await api(`${API}/files/${fid}?alt=media`)).blob()
    onProgress?.(++done, analysis.stems.length)
  }
  return { analysis, stems }
}
