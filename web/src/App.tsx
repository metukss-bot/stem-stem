import { Capacitor } from '@capacitor/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as drive from './drive'
import * as github from './github'
import { Player } from './Player'
import * as server from './server'
import {
  deleteSong,
  getSong,
  listSaved,
  requestPersistence,
  saveSong,
  type LibrarySongLike,
} from './storage'
import type { Analysis, LibrarySong, SavedSong } from './types'

const APK_URL = 'https://github.com/metukss-bot/stem-stem/releases/latest/download/StemStem.apk'
const isAndroidApp = Capacitor.isNativePlatform()

const COLAB_URL =
  'https://colab.research.google.com/github/metukss-bot/stem-stem/blob/main/colab/StemStem.ipynb'

function fmtTime(sec?: number) {
  if (!sec && sec !== 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function meta(s: { key?: string; bpm?: number | null; duration?: number }) {
  return [s.key && `키 ${s.key}`, s.bpm && `${Math.round(s.bpm)} BPM`, fmtTime(s.duration)]
    .filter(Boolean)
    .join(' · ')
}

interface Tracked extends server.Pending {
  text: string
  failed?: boolean
}

export default function App() {
  const [saved, setSaved] = useState<LibrarySongLike[]>([])
  const [jobs, setJobs] = useState<Tracked[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState<SavedSong | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [serverUrl, setServerUrl] = useState(server.getServer())
  const [ghRepo, setGhRepo] = useState(github.getRepo())
  const [ghToken, setGhToken] = useState(github.getToken())
  const [ghReady, setGhReady] = useState(github.isConfigured())
  const [repoSongs, setRepoSongs] = useState<LibrarySong[]>([])
  const [clientId, setClientId] = useState(drive.getClientId())
  // 예전 방식(구글 드라이브 + Colab)
  const [library, setLibrary] = useState<LibrarySong[]>([])
  const [inbox, setInbox] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const driveRef = useRef<HTMLInputElement>(null)
  const localRef = useRef<HTMLInputElement>(null)
  const trackingRef = useRef(new Set<string>())

  const refreshSaved = useCallback(() => listSaved().then(setSaved).catch(() => {}), [])

  const setJobText = (id: string, text: string, failed = false) =>
    setJobs((list) => list.map((j) => (j.id === id ? { ...j, text, failed } : j)))

  /** 서버 작업이 끝날 때까지 지켜보다가 결과를 폰에 저장한다. */
  const track = useCallback(
    async (p: server.Pending) => {
      if (trackingRef.current.has(p.id)) return
      trackingRef.current.add(p.id)
      setJobs((list) =>
        list.some((j) => j.id === p.id) ? list : [...list, { ...p, text: '상태 확인 중...' }],
      )
      try {
        const onDl = (d: number, t: number) => setJobText(p.id, `폰에 받는 중 ${d}/${t}`)
        if (p.kind === 'gh') {
          const analysis = await github.waitFor(p.id, (text) => setJobText(p.id, text))
          const stems = await github.download(p.id, analysis, onDl)
          await saveSong({ id: `gh-${p.id}`, analysis, stems, savedAt: Date.now() })
        } else {
          const job = await server.waitForJob(p.id, (j) => setJobText(p.id, server.describe(j)))
          const { analysis, stems } = await server.downloadResult(job, onDl)
          await saveSong({ id: `srv-${p.id}`, analysis, stems, savedAt: Date.now() })
        }
        server.removePending(p.id)
        setJobs((list) => list.filter((j) => j.id !== p.id))
        await refreshSaved()
      } catch (e) {
        setJobText(p.id, e instanceof Error ? e.message : String(e), true)
      } finally {
        trackingRef.current.delete(p.id)
      }
    },
    [refreshSaved],
  )

  useEffect(() => {
    refreshSaved()
    requestPersistence()
    // 앱을 껐다 켜도 진행 중이던 분석을 이어서 확인
    server
      .getPending()
      .filter((p) => (p.kind === 'gh' ? github.isConfigured() : !!server.getServer()))
      .forEach((p) => track(p))
  }, [refreshSaved, track])

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true)
    setStatus(label)
    try {
      await fn()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const analyze = (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files)
    if (github.isConfigured()) {
      run('곡을 올리는 중...', async () => {
        for (const [i, f] of list.entries()) {
          const { id, title } = await github.upload(f, (t) =>
            setStatus(`(${i + 1}/${list.length}) ${f.name}: ${t}`),
          )
          const p = { id, title, kind: 'gh' as const }
          server.addPending(p)
          track(p)
        }
        setStatus(
          `${list.length}곡을 보냈어요. 곡당 10분쯤 걸려요. 앱을 닫아도 다음에 열면 이어서 받아요.`,
        )
      })
      return
    }
    run('분석 서버를 깨우는 중...', async () => {
      await server.wake((sec) =>
        setStatus(`분석 서버를 깨우는 중... ${sec}초 (오래 안 쓰면 1~3분 걸려요)`),
      )
      for (const [i, f] of list.entries()) {
        const job = await server.upload(f, (p) =>
          setStatus(`올리는 중 (${i + 1}/${list.length}) ${f.name} ${Math.round(p * 100)}%`),
        )
        const p = { id: job.id, title: job.title || f.name }
        server.addPending(p)
        track(p)
      }
      setStatus(
        `${list.length}곡을 보냈어요. 한 곡에 5~10분쯤 걸려요. 앱을 닫아도 다음에 열면 이어서 받아요.`,
      )
    })
  }

  const dismissJob = (id: string) => {
    server.removePending(id)
    setJobs((list) => list.filter((j) => j.id !== id))
  }

  const retryJob = (j: Tracked) => {
    setJobText(j.id, '다시 확인 중...')
    track(j)
  }

  const loadRepoSongs = () =>
    run('저장소의 곡 목록을 불러오는 중...', async () => {
      const list = await github.library()
      setRepoSongs(list)
      setStatus(list.length ? '' : '저장소에 분석된 곡이 아직 없어요')
    })

  const openRepoSong = (song: LibrarySong) =>
    run(`${song.title} 받는 중...`, async () => {
      const analysis = await github.getAnalysis(song.id)
      const stems = await github.download(song.id, analysis, (d, t) =>
        setStatus(`${song.title} 받는 중 ${d}/${t}`),
      )
      const s = { id: `gh-${song.id}`, analysis, stems, savedAt: Date.now() }
      await saveSong(s)
      await refreshSaved()
      setStatus('')
      setCurrent(s)
    })

  const openSaved = (id: string) =>
    run('여는 중...', async () => {
      const s = await getSong(id)
      if (s) setCurrent(s)
      setStatus('')
    })

  const remove = (id: string) =>
    run('삭제 중...', async () => {
      await deleteSong(id)
      await refreshSaved()
      setStatus('폰에서 삭제했어요')
    })

  // ---- 예전 방식: 구글 드라이브 + Colab ----
  const driveRefresh = () =>
    run('드라이브에서 곡 목록을 불러오는 중...', async () => {
      const [lib, inb] = await Promise.all([drive.fetchLibrary(), drive.listInbox()])
      setLibrary(lib)
      setInbox(inb)
      setStatus(
        inb.length
          ? `드라이브 분석 대기 ${inb.length}곡. Colab에서 "모두 실행"하세요.`
          : `드라이브 곡 ${lib.length}개`,
      )
    })

  const driveUpload = (files: FileList | null) => {
    if (!files?.length) return
    run('업로드 준비 중...', async () => {
      const list = Array.from(files)
      for (const [i, f] of list.entries()) {
        await drive.uploadSong(f, (p) =>
          setStatus(`드라이브에 올리는 중 (${i + 1}/${list.length}) ${f.name} ${Math.round(p * 100)}%`),
        )
      }
      setInbox(await drive.listInbox())
      setStatus(`${list.length}곡을 드라이브에 올렸어요. Colab에서 "모두 실행"하세요.`)
    })
  }

  const driveOpen = (song: LibrarySong) =>
    run(`${song.title} 여는 중...`, async () => {
      let s = await getSong(song.id)
      if (!s) {
        const { analysis, stems } = await drive.downloadSong(song.id, (d, t) =>
          setStatus(`${song.title} 내려받는 중 ${d}/${t}`),
        )
        s = { id: song.id, analysis, stems, savedAt: Date.now() }
        await saveSong(s)
        await refreshSaved()
      }
      setStatus('')
      setCurrent(s)
    })

  /** 분석 결과 파일(analysis.json + 스템 mp3)을 직접 골라서 연다. */
  const importLocal = (files: FileList | null) => {
    if (!files?.length) return
    run('파일을 읽는 중...', async () => {
      const list = Array.from(files)
      const aFile = list.find((f) => f.name.endsWith('.json'))
      if (!aFile) throw new Error('analysis.json도 같이 골라주세요')
      const analysis: Analysis = JSON.parse(await aFile.text())
      const stems: Record<string, Blob> = {}
      for (const s of analysis.stems) {
        const f = list.find((x) => x.name === s.file)
        if (f) stems[s.id] = f
      }
      const s: SavedSong = { id: `local-${analysis.title}`, analysis, stems, savedAt: Date.now() }
      await saveSong(s)
      await refreshSaved()
      setStatus('')
      setCurrent(s)
    })
  }

  if (current) return <Player song={current} onBack={() => setCurrent(null)} />

  const savedIds = new Set(saved.map((s) => s.id))
  const noServer = !serverUrl && !ghReady
  const repoOnly = repoSongs.filter((s) => !savedIds.has(`gh-${s.id}`))

  return (
    <main className="app">
      <header className="top">
        <h1>StemStem</h1>
        <button className="ghost" onClick={() => setShowSettings((v) => !v)} aria-label="설정">
          설정
        </button>
      </header>

      {(showSettings || noServer) && (
        <section className="card">
          <h2>설정</h2>
          <label className="field">
            GitHub 데이터 저장소
            <input
              value={ghRepo}
              onChange={(e) => setGhRepo(e.target.value)}
              placeholder={github.DEFAULT_REPO}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
          <label className="field">
            GitHub 토큰
            <input
              type="password"
              value={ghToken}
              onChange={(e) => setGhToken(e.target.value)}
              placeholder="github_pat_..."
              autoComplete="off"
            />
          </label>
          <label className="field">
            분석 서버 주소 (허깅페이스, 없으면 비워 두기)
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://아이디-stemstem.hf.space"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
          <button
            onClick={() => {
              server.setServer(serverUrl)
              setServerUrl(server.getServer())
              github.setRepo(ghRepo)
              github.setToken(ghToken)
              setGhRepo(github.getRepo())
              setGhReady(github.isConfigured())
              setShowSettings(false)
            }}
          >
            저장
          </button>
          {!isAndroidApp && (
            <p className="hint">
              안드로이드 폰이면 <a href={APK_URL}>StemStem 앱(APK) 받기</a>
            </p>
          )}
        </section>
      )}

      <section className="actions">
        <button disabled={busy || noServer} onClick={() => fileRef.current?.click()}>
          곡 분석하기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(e) => {
            analyze(e.target.files)
            e.target.value = ''
          }}
        />
      </section>

      {status && <p className="status">{status}</p>}

      {jobs.length > 0 && (
        <section className="card">
          <h2>분석 중</h2>
          <ul className="songs">
            {jobs.map((j) => (
              <li key={j.id}>
                <div className="job">
                  <span className="title">{j.title}</span>
                  <span className="meta">{j.text}</span>
                </div>
                {j.failed && (
                  <>
                    <button className="ghost small" onClick={() => retryJob(j)}>
                      다시
                    </button>
                    <button className="ghost small" onClick={() => dismissJob(j.id)}>
                      지우기
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>내 곡</h2>
        {saved.length === 0 && (
          <p className="hint">"곡 분석하기"로 폰에 있는 곡을 고르면, 파트별로 나눠서 여기에 저장돼요.</p>
        )}
        <ul className="songs">
          {saved.map((s) => (
            <li key={s.id}>
              <button className="song" disabled={busy} onClick={() => openSaved(s.id)}>
                <span className="title">{s.title}</span>
                <span className="meta">{meta(s)}</span>
              </button>
              <button className="ghost small" onClick={() => remove(s.id)}>
                삭제
              </button>
            </li>
          ))}
        </ul>
      </section>

      {ghReady && (
        <section>
          <h2>저장소 곡</h2>
          <button className="secondary small" disabled={busy} onClick={loadRepoSongs}>
            저장소에서 곡 목록 불러오기
          </button>
          <ul className="songs">
            {repoOnly.map((s) => (
              <li key={s.id}>
                <button className="song" disabled={busy} onClick={() => openRepoSong(s)}>
                  <span className="title">{s.title}</span>
                  <span className="meta">{meta(s)} · 눌러서 폰에 받기</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="legacy">
        <summary>구글 드라이브 + Colab (예전 방식)</summary>
        <div className="actions">
          <button disabled={busy} className="secondary" onClick={() => driveRef.current?.click()}>
            드라이브에 곡 올리기
          </button>
          <a className="button secondary" href={COLAB_URL} target="_blank" rel="noreferrer">
            Colab 열기
          </a>
          <button disabled={busy} className="secondary" onClick={driveRefresh}>
            드라이브 새로고침
          </button>
          <input
            ref={driveRef}
            type="file"
            accept="audio/*"
            multiple
            hidden
            onChange={(e) => {
              driveUpload(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
        {inbox.length > 0 && (
          <ul className="plain">
            {inbox.map((n) => (
              <li key={n}>{n} (분석 대기)</li>
            ))}
          </ul>
        )}
        <ul className="songs">
          {library.map((s) => (
            <li key={s.id}>
              <button className="song" disabled={busy} onClick={() => driveOpen(s)}>
                <span className="title">{s.title}</span>
                <span className="meta">
                  {meta(s)}
                  {savedIds.has(s.id) ? ' · 폰에 저장됨' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <label className="field">
          구글 클라이언트 ID
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </label>
        <button className="secondary small" onClick={() => drive.setClientId(clientId)}>
          클라이언트 ID 저장
        </button>
        <p className="hint">
          <button className="ghost small" onClick={() => localRef.current?.click()}>
            분석 결과 파일로 열기
          </button>
        </p>
        <input
          ref={localRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            importLocal(e.target.files)
            e.target.value = ''
          }}
        />
      </details>
    </main>
  )
}
