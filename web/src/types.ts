export interface StemInfo {
  id: string
  label: string
  file: string
}

export interface KeyInfo {
  tonic: string
  mode: 'major' | 'minor'
  name: string
  confidence: number
}

export interface Analysis {
  version: number
  title: string
  duration: number
  bpm: number | null
  beats: number[]
  downbeats: number[]
  key: KeyInfo
  stems: StemInfo[]
}

export interface LibrarySong {
  id: string
  title: string
  duration?: number
  bpm?: number | null
  key?: string
  analyzedAt?: string
}

export interface SavedSong {
  id: string
  analysis: Analysis
  stems: Record<string, Blob>
  savedAt: number
}
