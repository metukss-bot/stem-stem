import { useCallback, useEffect, useRef, useState } from 'react'
import * as drive from './drive'
import { Player } from './Player'
import { deleteSong, getSong, listSavedIds, requestPersistence, saveSong } from './storage'
import type { Analysis, LibrarySong, SavedSong } from './types'

const COLAB_URL =
  'https://colab.research.google.com/github/metukss-bot/stem-stem/blob/main/colab/StemStem.ipynb'

function fmtTime(sec?: number) {
  if (!sec && sec !== 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function App() {
  const [library, setLibrary] = useState<LibrarySong[]>([])
  const [saved, setSaved] = useState<string[]>([])
  const [inbox, setInbox] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState<SavedSong | null>(null)
  const [showSettings, setShowSettings] = useState(!drive.getClientId())
  const [clientId, setClientId] = useState(drive.getClientId())
  const fileRef = useRef<HTMLInputElement>(null)
  const localRef = useRef<HTMLInputElement>(null)

  const refreshSaved = useCallback(() => listSavedIds().then(setSaved).catch(() => {}), [])
  useEffect(() => {
    refreshSaved()
    requestPersistence()
  }, [refreshSaved])

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true)
    setStatus(label)
    try {
      await fn()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
      setBusy(false)
      return
    }
    setBusy(false)
  }

  const refresh = () =>
    run('드라이브에서 곡 목록을 불러오는 중...', async () => {
      const [lib, inb] = await Promise.all([drive.fetchLibrary(), drive.listInbox()])
      setLibrary(lib)
      setInbox(inb)
      setStatus(
        inb.length
          ? `분석 대기 중인 곡 ${inb.length}개. "분석하기"로 Colab을 실행하세요.`
          : `곡 ${lib.length}개`,
      )
    })

  const upload = (files: FileList | null) => {
    if (!files?.length) return
    run('업로드 준비 중...', async () => {
      const list = Array.from(files)
      for (const [i, f] of list.entries()) {
        await drive.uploadSong(f, (p) =>
          setStatus(`올리는 중 (${i + 1}/${list.length}) ${f.name} ${Math.round(p * 100)}%`),
        )
      }
      setInbox(await drive.listInbox())
      setStatus(`${list.length}곡을 올렸어요. 이제 "분석하기"를 눌러 Colab에서 "모두 실행"하세요.`)
    })
  }

  const open = (song: LibrarySong) =>
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

  const openSaved = (id: string) =>
    run('여는 중...', async () => {
      const s = await getSong(id)
      if (s) setCurrent(s)
      setStatus('')
    })

  /** 드라이브 없이 테스트: analysis.json + 스템 mp3들을 직접 고른다. */
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
      const id = `local-${analysis.title}`
      const s: SavedSong = { id, analysis, stems, savedAt: Date.now() }
      await saveSong(s)
      await refreshSaved()
      setStatus('')
      setCurrent(s)
    })
  }

  const remove = (id: string) =>
    run('삭제 중...', async () => {
      await deleteSong(id)
      await refreshSaved()
      setStatus('폰에서 삭제했어요 (드라이브에는 남아 있음)')
    })

  if (current) return <Player song={current} onBack={() => setCurrent(null)} />

  const offlineOnly = saved.filter((id) => !library.some((s) => s.id === id))

  return (
    <main className="app">
      <header className="top">
        <h1>StemStem</h1>
        <button className="ghost" onClick={() => setShowSettings((v) => !v)} aria-label="설정">
          설정
        </button>
      </header>

      {showSettings && (
        <section className="card">
          <h2>설정</h2>
          <label className="field">
            구글 클라이언트 ID
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxx.apps.googleusercontent.com"
            />
          </label>
          <button
            onClick={() => {
              drive.setClientId(clientId)
              setShowSettings(false)
            }}
          >
            저장
          </button>
          <p className="hint">처음 한 번만 필요해요. 만드는 방법은 저장소의 docs/setup.md를 보세요.</p>
        </section>
      )}

      <section className="actions">
        <button disabled={busy} onClick={() => fileRef.current?.click()}>
          곡 올리기
        </button>
        <a className="button" href={COLAB_URL} target="_blank" rel="noreferrer">
          분석하기 (Colab)
        </a>
        <button disabled={busy} className="secondary" onClick={refresh}>
          새로고침
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(e) => {
            upload(e.target.files)
            e.target.value = ''
          }}
        />
      </section>

      {status && <p className="status">{status}</p>}

      {inbox.length > 0 && (
        <section className="card">
          <h2>분석 대기</h2>
          <ul className="plain">
            {inbox.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>곡 목록</h2>
        {library.length === 0 && offlineOnly.length === 0 && (
          <p className="hint">"새로고침"을 누르면 드라이브에서 분석이 끝난 곡을 불러와요.</p>
        )}
        <ul className="songs">
          {library.map((s) => (
            <li key={s.id}>
              <button className="song" disabled={busy} onClick={() => open(s)}>
                <span className="title">{s.title}</span>
                <span className="meta">
                  {[s.key && `키 ${s.key}`, s.bpm && `${Math.round(s.bpm)} BPM`, fmtTime(s.duration)]
                    .filter(Boolean)
                    .join(' · ')}
                  {saved.includes(s.id) ? ' · 폰에 저장됨' : ''}
                </span>
              </button>
              {saved.includes(s.id) && (
                <button className="ghost small" onClick={() => remove(s.id)}>
                  폰에서 삭제
                </button>
              )}
            </li>
          ))}
          {offlineOnly.map((id) => (
            <li key={id}>
              <button className="song" disabled={busy} onClick={() => openSaved(id)}>
                <span className="title">{id.replace(/-[0-9a-f]{8}$/, '').replace(/^local-/, '')}</span>
                <span className="meta">폰에 저장됨</span>
              </button>
              <button className="ghost small" onClick={() => remove(id)}>
                폰에서 삭제
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className="foot">
        <button className="ghost small" onClick={() => localRef.current?.click()}>
          드라이브 없이 파일로 열기
        </button>
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
      </footer>
    </main>
  )
}
