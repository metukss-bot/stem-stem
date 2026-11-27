/**
 * 자동 분석 서버(Hugging Face Space) 연동.
 * 곡을 올리면 서버가 대기열에서 하나씩 6스템 분리 + BPM/키 분석을 하고,
 * 앱은 상태를 물어보다가 끝나면 결과를 내려받아 폰에 저장한다.
 */
import type { Analysis } from './types'

/** 허깅페이스 Space 주소. 설정 화면에서 바꿀 수 있다. */
export const DEFAULT_SERVER = import.meta.env.VITE_ANALYSIS_SERVER || ''
const KEY = 'stemstem.server'
const PENDING = 'stemstem.pending'

export type JobStatus = 'queued' | 'running' | 'done' | 'error'

export interface Job {
  id: string
  title: string
  status: JobStatus
  stage: string
  progress: number
  position?: number
  error?: string | null
  analysis?: Analysis
}

export interface Pending {
  id: string
  title: string
  /** 'gh' = GitHub 저장소 분석, 없으면 분석 서버 */
  kind?: 'gh' | 'srv'
}

export function getServer(): string {
  try {
    return (localStorage.getItem(KEY) || DEFAULT_SERVER).replace(/\/+$/, '')
  } catch {
    return DEFAULT_SERVER
  }
}

export function setServer(url: string) {
  try {
    localStorage.setItem(KEY, url.trim())
  } catch {
    /* 무시 */
  }
}

export function getPending(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING) || '[]')
  } catch {
    return []
  }
}

function setPending(list: Pending[]) {
  try {
    localStorage.setItem(PENDING, JSON.stringify(list))
  } catch {
    /* 무시 */
  }
}

export function addPending(p: Pending) {
  setPending([...getPending().filter((x) => x.id !== p.id), p])
}

export function removePending(id: string) {
  setPending(getPending().filter((x) => x.id !== id))
}

function base(): string {
  const s = getServer()
  if (!s) throw new Error('설정에서 분석 서버 주소를 먼저 넣어 주세요')
  return s
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 무료 서버는 오래 안 쓰면 잠들어서, 깨어날 때까지 1~3분 기다린다. */
export async function wake(onWait?: (sec: number) => void, maxSec = 300): Promise<void> {
  const t0 = Date.now()
  for (;;) {
    try {
      const r = await fetch(`${base()}/`, { cache: 'no-store' })
      if (r.ok && (await r.json()).service === 'stemstem') return
    } catch {
      /* 아직 깨는 중 */
    }
    const sec = Math.round((Date.now() - t0) / 1000)
    if (sec > maxSec) throw new Error('분석 서버가 응답하지 않아요. 잠시 뒤 다시 해 보세요')
    onWait?.(sec)
    await sleep(5000)
  }
}

/** 곡 파일을 올리고 작업을 만든다. */
export function upload(file: File, onProgress?: (p: number) => void): Promise<Job> {
  const url = `${base()}/jobs`
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('title', file.name.replace(/\.[^.]+$/, ''))
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.onload = () => {
      let body: { detail?: string } & Partial<Job> = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        /* 무시 */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as Job)
      else reject(new Error(body.detail || `올리기 실패 (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('분석 서버에 연결하지 못했어요'))
    xhr.send(form)
  })
}

export async function getJob(id: string): Promise<Job> {
  const r = await fetch(`${base()}/jobs/${id}`, { cache: 'no-store' })
  if (r.status === 404) throw new Error('서버에서 작업이 사라졌어요. 곡을 다시 올려 주세요')
  if (!r.ok) throw new Error(`상태 확인 실패 (${r.status})`)
  return r.json()
}

const STAGES: Record<string, string> = {
  queued: '대기 중',
  separate: '파트 분리 중',
  beats: '박자 분석 중',
  key: '키 분석 중',
  done: '완료',
}

export function describe(job: Job): string {
  if (job.status === 'error') return `실패: ${job.error ?? ''}`
  if (job.status === 'queued')
    return job.position ? `대기 중 (앞에 ${job.position}곡)` : '곧 시작해요'
  const stage = STAGES[job.stage] ?? job.stage
  return job.stage === 'separate' ? `${stage} ${Math.round(job.progress * 100)}%` : stage
}

/** 작업이 끝날 때까지 상태를 물어본다. */
export async function waitForJob(id: string, onUpdate: (job: Job) => void): Promise<Job> {
  let failures = 0
  for (;;) {
    let job: Job
    try {
      job = await getJob(id)
      failures = 0
    } catch (e) {
      if (e instanceof Error && e.message.includes('사라졌')) throw e
      if (++failures > 30) throw e
      await sleep(10000)
      continue
    }
    onUpdate(job)
    if (job.status === 'done') return job
    if (job.status === 'error') throw new Error(describe(job))
    await sleep(5000)
  }
}

export async function downloadResult(
  job: Job,
  onProgress?: (done: number, total: number) => void,
): Promise<{ analysis: Analysis; stems: Record<string, Blob> }> {
  const analysis = job.analysis ?? (await (await fetch(`${base()}/jobs/${job.id}/files/analysis.json`)).json())
  const stems: Record<string, Blob> = {}
  let done = 0
  onProgress?.(0, analysis.stems.length)
  for (const s of analysis.stems) {
    const r = await fetch(`${base()}/jobs/${job.id}/files/${s.file}`)
    if (!r.ok) throw new Error(`${s.label} 파일을 받지 못했어요`)
    stems[s.id] = await r.blob()
    onProgress?.(++done, analysis.stems.length)
  }
  return { analysis, stems }
}
