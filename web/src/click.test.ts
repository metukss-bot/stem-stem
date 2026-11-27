import { describe, expect, it } from 'vitest'
import { accentSet, beatsInWindow, contextTimeFor, firstBeatAtOrAfter } from './click'

const beats = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]
const downbeats = [0.5, 2.505]

describe('click', () => {
  it('marks downbeats as accents', () => {
    expect(accentSet(beats, downbeats)).toEqual([true, false, false, false, true, false, false, false])
  })

  it('finds first beat at or after time', () => {
    expect(firstBeatAtOrAfter(beats, 0)).toBe(0)
    expect(firstBeatAtOrAfter(beats, 1.0)).toBe(1)
    expect(firstBeatAtOrAfter(beats, 1.2)).toBe(2)
    expect(firstBeatAtOrAfter(beats, 9)).toBe(8)
  })

  it('returns beats in window without repeating', () => {
    const acc = accentSet(beats, downbeats)
    const a = beatsInWindow(beats, acc, 0, 0.9, 1.6)
    expect(a.events.map((e) => e.beat)).toEqual([1.0, 1.5])
    const b = beatsInWindow(beats, acc, a.nextIndex, 1.0, 2.6)
    expect(b.events.map((e) => e.beat)).toEqual([2.0, 2.5])
    expect(b.events[1].accent).toBe(true)
  })

  it('maps song time to context time with rate and offset', () => {
    expect(contextTimeFor(2, 1, 10, 1, 0)).toBeCloseTo(11)
    expect(contextTimeFor(2, 1, 10, 0.5, 0)).toBeCloseTo(12)
    expect(contextTimeFor(2, 1, 10, 1, 0.1)).toBeCloseTo(11.1)
  })
})
