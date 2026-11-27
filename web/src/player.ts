/**
 * 스템 플레이어.
 * 폰 메모리를 아끼려고 스템마다 <audio> 요소로 스트리밍 재생하고,
 * Web Audio 게인으로 볼륨/뮤트/솔로를 처리한다. 스템 사이 어긋남은 주기적으로 보정한다.
 * 속도는 playbackRate + preservesPitch(피치 유지)로 바꾼다.
 */
import { accentSet, beatsInWindow, contextTimeFor, firstBeatAtOrAfter } from './click'
import type { Analysis } from './types'

interface Track {
  id: string
  el: HTMLAudioElement
  gain: GainNode
  url: string
  volume: number
  muted: boolean
  solo: boolean
}

const LOOKAHEAD = 0.15 // 초
const DRIFT_LIMIT = 0.05 // 초

export class StemPlayer {
  readonly ctx: AudioContext
  private master: GainNode
  private clickGain: GainNode
  private tracks: Track[] = []
  private beats: number[] = []
  private accents: boolean[] = []
  private nextBeat = 0
  private timer: number | null = null
  private driftTimer: number | null = null
  private rate = 1
  clickOn = false
  clickOffsetMs = 0
  playing = false
  onEnded?: () => void

  constructor() {
    // iOS에서 무음 스위치가 켜져 있어도 소리가 나도록 (Safari 16.4+)
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession) nav.audioSession.type = 'playback'
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.master = this.ctx.createGain()
    this.master.connect(this.ctx.destination)
    this.clickGain = this.ctx.createGain()
    this.clickGain.gain.value = 0.6
    this.clickGain.connect(this.ctx.destination)
  }

  load(analysis: Analysis, stems: Record<string, Blob>) {
    this.unload()
    this.beats = analysis.beats
    this.accents = accentSet(analysis.beats, analysis.downbeats)
    for (const s of analysis.stems) {
      const blob = stems[s.id]
      if (!blob) continue
      const url = URL.createObjectURL(blob)
      const el = new Audio()
      el.src = url
      el.preload = 'auto'
      el.preservesPitch = true
      el.setAttribute('playsinline', '')
      const src = this.ctx.createMediaElementSource(el)
      const gain = this.ctx.createGain()
      src.connect(gain).connect(this.master)
      this.tracks.push({ id: s.id, el, gain, url, volume: 1, muted: false, solo: false })
    }
    const lead = this.tracks[0]?.el
    if (lead) lead.onended = () => {
      this.pause()
      this.onEnded?.()
    }
  }

  unload() {
    this.pause()
    for (const t of this.tracks) {
      t.el.pause()
      t.el.removeAttribute('src')
      t.el.load()
      t.gain.disconnect()
      URL.revokeObjectURL(t.url)
    }
    this.tracks = []
  }

  get time(): number {
    return this.tracks[0]?.el.currentTime ?? 0
  }

  async play() {
    if (!this.tracks.length) return
    await this.ctx.resume()
    const t = this.time
    for (const tr of this.tracks) tr.el.currentTime = t
    await Promise.all(this.tracks.map((tr) => tr.el.play()))
    this.playing = true
    this.resetClick()
    this.timer = window.setInterval(() => this.scheduleClicks(), 25)
    this.driftTimer = window.setInterval(() => this.fixDrift(), 300)
  }

  pause() {
    for (const tr of this.tracks) tr.el.pause()
    this.playing = false
    if (this.timer !== null) clearInterval(this.timer)
    if (this.driftTimer !== null) clearInterval(this.driftTimer)
    this.timer = this.driftTimer = null
  }

  seek(t: number) {
    for (const tr of this.tracks) tr.el.currentTime = t
    this.resetClick()
  }

  setRate(rate: number) {
    this.rate = rate
    for (const tr of this.tracks) tr.el.playbackRate = rate
    this.resetClick()
  }

  setVolume(id: string, v: number) {
    this.update(id, (t) => (t.volume = v))
  }
  setMuted(id: string, m: boolean) {
    this.update(id, (t) => (t.muted = m))
  }
  setSolo(id: string, s: boolean) {
    this.update(id, (t) => (t.solo = s))
  }

  setClickVolume(v: number) {
    this.clickGain.gain.value = v
  }

  private update(id: string, fn: (t: Track) => void) {
    const t = this.tracks.find((x) => x.id === id)
    if (t) fn(t)
    const anySolo = this.tracks.some((x) => x.solo)
    for (const x of this.tracks) {
      const audible = anySolo ? x.solo : !x.muted
      x.gain.gain.setTargetAtTime(audible ? x.volume : 0, this.ctx.currentTime, 0.015)
    }
  }

  private fixDrift() {
    const lead = this.tracks[0]?.el
    if (!lead || lead.paused) return
    for (const tr of this.tracks.slice(1)) {
      if (Math.abs(tr.el.currentTime - lead.currentTime) > DRIFT_LIMIT) tr.el.currentTime = lead.currentTime
    }
  }

  private resetClick() {
    this.nextBeat = firstBeatAtOrAfter(this.beats, this.time)
  }

  private scheduleClicks() {
    if (!this.clickOn || !this.playing) return
    const pos = this.time
    const { events, nextIndex } = beatsInWindow(
      this.beats,
      this.accents,
      this.nextBeat,
      pos - 0.01,
      pos + LOOKAHEAD * this.rate,
    )
    this.nextBeat = nextIndex
    const now = this.ctx.currentTime
    for (const e of events) {
      const when = contextTimeFor(e.beat, pos, now, this.rate, this.clickOffsetMs / 1000)
      if (when >= now) this.blip(when, e.accent)
    }
  }

  private blip(when: number, accent: boolean) {
    const osc = this.ctx.createOscillator()
    const env = this.ctx.createGain()
    osc.frequency.value = accent ? 1600 : 1000
    env.gain.setValueAtTime(0, when)
    env.gain.linearRampToValueAtTime(accent ? 1 : 0.6, when + 0.002)
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.05)
    osc.connect(env).connect(this.clickGain)
    osc.start(when)
    osc.stop(when + 0.06)
  }
}
