/** 클릭 스케줄링 계산 (순수 함수, 테스트 대상). */

export interface ClickEvent {
  index: number
  beat: number
  accent: boolean
}

/** downbeat 근처(±30ms)에 있는 비트를 강세로 표시한다. */
export function accentSet(beats: number[], downbeats: number[]): boolean[] {
  let j = 0
  return beats.map((b) => {
    while (j < downbeats.length && downbeats[j] < b - 0.03) j++
    return j < downbeats.length && Math.abs(downbeats[j] - b) <= 0.03
  })
}

/** 첫 인덱스 i 중 beats[i] >= t (이진 탐색). */
export function firstBeatAtOrAfter(beats: number[], t: number): number {
  let lo = 0
  let hi = beats.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (beats[mid] < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * [from, to) 구간(곡 시간, 초)에 들어오는 비트를 돌려준다.
 * nextIndex 이전 비트는 이미 예약된 것으로 보고 건너뛴다.
 */
export function beatsInWindow(
  beats: number[],
  accents: boolean[],
  nextIndex: number,
  from: number,
  to: number,
): { events: ClickEvent[]; nextIndex: number } {
  let i = Math.max(nextIndex, firstBeatAtOrAfter(beats, from))
  const events: ClickEvent[] = []
  while (i < beats.length && beats[i] < to) {
    events.push({ index: i, beat: beats[i], accent: accents[i] ?? false })
    i++
  }
  return { events, nextIndex: i }
}

/** 곡 시간 beat가 오디오 컨텍스트 시간 몇 초에 울려야 하는지. */
export function contextTimeFor(
  beat: number,
  songPos: number,
  ctxNow: number,
  rate: number,
  offsetSec: number,
): number {
  return ctxNow + (beat - songPos) / rate + offsetSec
}
