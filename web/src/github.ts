/**
 * GitHub 비공개 데이터 저장소로 자동 분석.
 * 앱이 inbox/<id>.<확장자> 로 곡을 올리면 저장소의 GitHub Actions가 분석해서
 * songs/<id>/ 에 스템과 analysis.json 을 올린다. 앱은 결과가 생길 때까지 기다렸다가 내려받는다.
 */
import type { Analysis, LibrarySong } from './types'

const API = 'https://api.github.com'
export const DEFAULT_REPO = 'metukss-bot/stem-stem-data'
const REPO_KEY = 'stemstem.ghRepo'
const TOKEN_KEY = 'stemstem.ghToken'

function read(key: string): string {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value.trim())
  } catch {
    /* 무시 */
  }
}

export const getRepo = () => read(REPO_KEY) || DEFAULT_REPO
export const setRepo = (v: string) => write(REPO_KEY, v)
export const getToken = () => read(TOKEN_KEY)
export const setToken = (v: string) => write(TOKEN_KEY, v)
export const isConfigured = () => !!getToken()

async function gh(path: string, init: RequestInit = {}, accept = 'application/vnd.github+json') {
  const token = getToken()
  if (!token) throw new Error('설정에서 GitHub 토큰을 먼저 넣어 주세요')
  const r = await fetch(`${API}/repos/${getRepo()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, Accept: accept, ...(init.headers ?? {}) },
  })
  if (r.status === 401) throw new Error('GitHub 토큰이 맞지 않거나 만료됐어요. 설정에서 다시 넣어 주세요')
  return r
}

/** 저장소의 파일을 그대로(raw) 받는다. 없으면 null. */
async function getRaw(path: string): Promise<Response | null> {
  const r = await gh(`/contents/${path}`, {}, 'application/vnd.github.raw+json')
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`${path} 읽기 실패 (${r.status})`)
  return r
}

async function putFile(path: string, base64: string, message: string) {
  const r = await gh(`/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: base64 }),
  })
  if (r.status === 422) return // 이미 같은 파일이 있음
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(`올리기 실패 (${r.status}) ${body.message ?? ''}`)
  }
}

function toBase64(blob: Blob, onProgress?: (p: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '')
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

const utf8Base64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))

export async function songId(file: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-1', await file.arrayBuffer())
  return Array.from(new Uint8Array(hash).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 곡을 올린다. 이미 분석된 곡이면 다시 올리지 않는다. */
export async function upload(
  file: File,
  onProgress?: (text: string) => void,
): Promise<{ id: string; title: string }> {
  const title = file.name.replace(/\.[^.]+$/, '')
  const ext = (file.name.match(/\.[^.]+$/)?.[0] ?? '.mp3').toLowerCase()
  onProgress?.('파일 확인 중...')
  const id = await songId(file)
  if (await getRaw(`songs/${id}/analysis.json`)) return { id, title }
  await putFile(`inbox/${id}.json`, utf8Base64(JSON.stringify({ title })), `곡 정보: ${title}`)
  const b64 = await toBase64(file, (p) => onProgress?.(`준비 중 ${Math.round(p * 100)}%`))
  onProgress?.('GitHub에 올리는 중...')
  await putFile(`inbox/${id}${ext}`, b64, `곡 올림: ${title}`)
  return { id, title }
}

async function runState(): Promise<string> {
  try {
    const r = await gh('/actions/runs?per_page=1')
    if (!r.ok) return '분석 중'
    const run = (await r.json()).workflow_runs?.[0]
    if (!run) return '분석 시작 기다리는 중'
    if (run.status === 'queued' || run.status === 'pending' || run.status === 'waiting') return '분석 대기 중'
    if (run.status === 'in_progress') {
      const min = Math.max(0, Math.round((Date.now() - Date.parse(run.run_started_at)) / 60000))
      return `분석 중 (${min}분째, 보통 곡당 10분쯤)`
    }
    return '분석 시작 기다리는 중'
  } catch {
    return '분석 중'
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 분석이 끝날 때까지 기다린다 (최대 3시간). */
export async function waitFor(id: string, onUpdate: (text: string) => void): Promise<Analysis> {
  const t0 = Date.now()
  let failures = 0
  while (Date.now() - t0 < 3 * 3600 * 1000) {
    try {
      const done = await getRaw(`songs/${id}/analysis.json`)
      if (done) return done.json()
      const err = await getRaw(`songs/${id}/error.json`)
      if (err) throw new Error(`분석 실패: ${(await err.json()).error ?? ''}`)
      onUpdate(await runState())
      failures = 0
    } catch (e) {
      if (e instanceof Error && (e.message.startsWith('분석 실패') || e.message.includes('토큰'))) throw e
      if (++failures > 20) throw e
      onUpdate('연결 다시 시도 중...')
    }
    await sleep(20000)
  }
  throw new Error('너무 오래 걸려요. 나중에 "다시"를 눌러 주세요')
}

export async function download(
  id: string,
  analysis: Analysis,
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, Blob>> {
  const stems: Record<string, Blob> = {}
  let done = 0
  onProgress?.(0, analysis.stems.length)
  for (const s of analysis.stems) {
    const r = await getRaw(`songs/${id}/${s.file}`)
    if (!r) throw new Error(`${s.label} 파일이 없어요`)
    stems[s.id] = await r.blob()
    onProgress?.(++done, analysis.stems.length)
  }
  return stems
}

export async function getAnalysis(id: string): Promise<Analysis> {
  const r = await getRaw(`songs/${id}/analysis.json`)
  if (!r) throw new Error('분석 결과가 없어요')
  return r.json()
}

/** 저장소에 분석돼 있는 곡 목록 (밴드원 폰에서 내려받기용). */
export async function library(): Promise<LibrarySong[]> {
  const r = await getRaw('library.json')
  if (!r) return []
  return (await r.json()).songs ?? []
}
