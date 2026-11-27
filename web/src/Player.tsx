import { useEffect, useRef, useState } from 'react'
import { StemPlayer } from './player'
import type { SavedSong } from './types'

function fmt(t: number) {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

interface StemState {
  volume: number
  muted: boolean
  solo: boolean
}

export function Player({ song, onBack }: { song: SavedSong; onBack: () => void }) {
  const a = song.analysis
  const playerRef = useRef<StemPlayer | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [rate, setRate] = useState(1)
  const [click, setClick] = useState(false)
  const [offset, setOffset] = useState(() => {
    try {
      return Number(localStorage.getItem('stemstem.clickOffset') || 0)
    } catch {
      return 0
    }
  })
  const [stems, setStems] = useState<Record<string, StemState>>(() =>
    Object.fromEntries(a.stems.map((s) => [s.id, { volume: 1, muted: false, solo: false }])),
  )

  useEffect(() => {
    const p = new StemPlayer()
    p.load(a, song.stems)
    p.onEnded = () => setPlaying(false)
    p.clickOffsetMs = offset
    playerRef.current = p
    const id = window.setInterval(() => setTime(p.time), 200)
    return () => {
      clearInterval(id)
      p.unload()
      p.ctx.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, song.stems])

  const p = () => playerRef.current!

  const toggle = async () => {
    if (playing) {
      p().pause()
      setPlaying(false)
    } else {
      await p().play()
      setPlaying(true)
    }
  }

  const setStem = (id: string, patch: Partial<StemState>) => {
    setStems((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
    if (patch.volume !== undefined) p().setVolume(id, patch.volume)
    if (patch.muted !== undefined) p().setMuted(id, patch.muted)
    if (patch.solo !== undefined) p().setSolo(id, patch.solo)
  }

  const bpm = a.bpm ? Math.round(a.bpm * rate) : null

  return (
    <main className="app player">
      <header className="top">
        <button className="ghost" onClick={onBack}>
          ← 목록
        </button>
        <div className="song-head">
          <h1>{a.title}</h1>
          <p className="meta">
            키 {a.key?.name ?? '?'} · {bpm ?? '?'} BPM
          </p>
        </div>
      </header>

      <section className="transport">
        <button className="play" onClick={toggle} aria-label={playing ? '일시정지' : '재생'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          className="seek"
          type="range"
          min={0}
          max={a.duration}
          step={0.1}
          value={time}
          onChange={(e) => {
            const t = Number(e.target.value)
            p().seek(t)
            setTime(t)
          }}
        />
        <span className="time">
          {fmt(time)} / {fmt(a.duration)}
        </span>
      </section>

      <section className="card controls">
        <div className="row">
          <span>속도</span>
          <input
            type="range"
            min={0.5}
            max={1.2}
            step={0.05}
            value={rate}
            onChange={(e) => {
              const r = Number(e.target.value)
              setRate(r)
              p().setRate(r)
            }}
          />
          <button className="ghost small" onClick={() => (setRate(1), p().setRate(1))}>
            {Math.round(rate * 100)}%
          </button>
        </div>
        <div className="row">
          <span>클릭</span>
          <button
            className={click ? 'on' : 'secondary'}
            onClick={() => {
              const v = !click
              setClick(v)
              p().clickOn = v
            }}
          >
            {click ? '켜짐' : '꺼짐'}
          </button>
          <label className="offset">
            보정
            <input
              type="number"
              step={10}
              value={offset}
              onChange={(e) => {
                const v = Number(e.target.value)
                setOffset(v)
                p().clickOffsetMs = v
                try {
                  localStorage.setItem('stemstem.clickOffset', String(v))
                } catch {
                  /* 무시 */
                }
              }}
            />
            ms
          </label>
        </div>
      </section>

      <section className="mixer">
        {a.stems.map((s) => {
          const st = stems[s.id]
          return (
            <div key={s.id} className="stem">
              <span className="name">{s.label}</span>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.01}
                value={st.volume}
                onChange={(e) => setStem(s.id, { volume: Number(e.target.value) })}
              />
              <button className={st.muted ? 'on warn' : 'secondary'} onClick={() => setStem(s.id, { muted: !st.muted })}>
                M
              </button>
              <button className={st.solo ? 'on' : 'secondary'} onClick={() => setStem(s.id, { solo: !st.solo })}>
                S
              </button>
            </div>
          )
        })}
      </section>
      <p className="hint">M = 끄기, S = 그 파트만 듣기. 클릭이 음악보다 늦게 들리면 보정 값을 낮추고, 빠르면 높이세요.</p>
    </main>
  )
}
