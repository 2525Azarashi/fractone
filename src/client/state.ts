// ============================================================
// グローバル状態 (useReducer) — 最上位 App で管理
// ============================================================
import type { Analysis, ComposeParams, ComposeResult, Note } from '../lib/types'
import type { AudioSettings } from '../lib/audio-engine'

export type Tab = 'roll' | 'pitch' | 'rhythm' | 'audio'
export type Status = 'idle' | 'playing' | 'recording' | 'composing' | 'done' | 'error'

export interface State {
  sequence: Note[] // sequence: Note[] — 記録されたシーケンスデータ
  history: Note[][]
  future: Note[][]
  activeKeys: number[] // 現在ユーザーが押している鍵盤
  aiKeys: number[] // 再生中に鳴っている鍵盤 (可視化用)
  selected: string[]
  params: ComposeParams
  audio: AudioSettings
  tab: Tab
  status: Status
  message: string
  result: ComposeResult | null
  analysis: Analysis | null
  loop: boolean
  quantizeRec: boolean
  snap: number // 拍
  baseOctave: number
  cursor: number // 秒 — 再生/録音開始位置
  generation: number // 生成回数 (アニメーション再トリガー用)
}

export const DEFAULT_PARAMS: ComposeParams = {
  bars: 8,
  range: 14,
  displacement: 0.55,
  depth: 4,
  roughness: 0.55,
  motifStrength: 0.7,
  humanize: 0.45,
  density: 0.5,
  key: 0,
  scale: 'major',
  timeSig: '4/4',
  bpm: 112,
  seed: Math.floor(Math.random() * 99999),
  centerNote: 67,
}

export const DEFAULT_AUDIO: AudioSettings = {
  instrument: 'piano',
  volume: 0.75,
  reverb: 0.28,
  attack: 0.008,
  release: 0.25,
  metronome: false,
  brightness: 0.7,
}

/** 初回体験用のデモモチーフ (きらきら系の2小節 ×2) */
export function demoSequence(bpm: number): Note[] {
  const spb = 60 / bpm
  const m: [number, number, number][] = [
    [64, 0, 0.5], [67, 0.5, 0.5], [72, 1, 1], [71, 2, 0.5], [69, 2.5, 0.5], [67, 3, 1],
    [65, 4, 0.5], [69, 4.5, 0.5], [72, 5, 1], [71, 6, 1], [67, 7, 1],
    [64, 8, 0.5], [67, 8.5, 0.5], [72, 9, 1], [74, 10, 0.5], [72, 10.5, 0.5], [71, 11, 1],
  ]
  return m.map(([midi, b, d], i) => ({
    id: `demo_${i}`,
    midiNoteNumber: midi,
    startTime: b * spb,
    duration: d * spb * 0.95,
    velocity: 0.8,
    source: 'user',
  }))
}

export type Action =
  | { type: 'setSequence'; seq: Note[]; record?: boolean }
  | { type: 'addNotes'; notes: Note[] }
  | { type: 'updateNotes'; notes: Note[]; record?: boolean }
  | { type: 'removeNotes'; ids: string[] }
  | { type: 'commit' } // 現在の sequence を履歴に積む (ドラッグ開始時)
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'keyDown'; midi: number }
  | { type: 'keyUp'; midi: number }
  | { type: 'aiKey'; midi: number; on: boolean }
  | { type: 'clearAiKeys' }
  | { type: 'select'; ids: string[] }
  | { type: 'params'; patch: Partial<ComposeParams> }
  | { type: 'audio'; patch: Partial<AudioSettings> }
  | { type: 'tab'; tab: Tab }
  | { type: 'status'; status: Status; message?: string }
  | { type: 'result'; result: ComposeResult | null }
  | { type: 'analysis'; analysis: Analysis | null }
  | { type: 'toggle'; key: 'loop' | 'quantizeRec' }
  | { type: 'snap'; snap: number }
  | { type: 'octave'; delta: number }
  | { type: 'cursor'; t: number }

const pushHist = (s: State): Pick<State, 'history' | 'future'> => ({
  history: [...s.history.slice(-60), s.sequence],
  future: [],
})

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'setSequence':
      return { ...s, ...(a.record === false ? {} : pushHist(s)), sequence: a.seq, selected: [] }
    case 'addNotes':
      return { ...s, ...pushHist(s), sequence: [...s.sequence, ...a.notes] }
    case 'updateNotes': {
      const map = new Map(a.notes.map((n) => [n.id, n]))
      return {
        ...s,
        ...(a.record ? pushHist(s) : {}),
        sequence: s.sequence.map((n) => map.get(n.id) ?? n),
      }
    }
    case 'removeNotes': {
      const ids = new Set(a.ids)
      return { ...s, ...pushHist(s), sequence: s.sequence.filter((n) => !ids.has(n.id)), selected: [] }
    }
    case 'commit':
      return { ...s, ...pushHist(s) }
    case 'undo': {
      if (!s.history.length) return s
      const prev = s.history[s.history.length - 1]
      return { ...s, sequence: prev, history: s.history.slice(0, -1), future: [s.sequence, ...s.future], selected: [] }
    }
    case 'redo': {
      if (!s.future.length) return s
      const [next, ...rest] = s.future
      return { ...s, sequence: next, history: [...s.history, s.sequence], future: rest }
    }
    case 'keyDown':
      return s.activeKeys.includes(a.midi) ? s : { ...s, activeKeys: [...s.activeKeys, a.midi] }
    case 'keyUp':
      return { ...s, activeKeys: s.activeKeys.filter((k) => k !== a.midi) }
    case 'aiKey':
      return a.on
        ? { ...s, aiKeys: [...s.aiKeys, a.midi] }
        : { ...s, aiKeys: (() => { const i = s.aiKeys.indexOf(a.midi); if (i < 0) return s.aiKeys; const c = [...s.aiKeys]; c.splice(i, 1); return c })() }
    case 'clearAiKeys':
      return { ...s, aiKeys: [] }
    case 'select':
      return { ...s, selected: a.ids }
    case 'params':
      return { ...s, params: { ...s.params, ...a.patch } }
    case 'audio':
      return { ...s, audio: { ...s.audio, ...a.patch } }
    case 'tab':
      return { ...s, tab: a.tab }
    case 'status':
      return { ...s, status: a.status, message: a.message ?? s.message }
    case 'result':
      return { ...s, result: a.result, generation: s.generation + 1 }
    case 'analysis':
      return { ...s, analysis: a.analysis }
    case 'toggle':
      return { ...s, [a.key]: !s[a.key] }
    case 'snap':
      return { ...s, snap: a.snap }
    case 'octave':
      return { ...s, baseOctave: Math.max(1, Math.min(6, s.baseOctave + a.delta)) }
    case 'cursor':
      return { ...s, cursor: Math.max(0, a.t) }
  }
}

export function initState(): State {
  let saved: Partial<State> | null = null
  try {
    saved = JSON.parse(localStorage.getItem('fractone:v1') || 'null')
  } catch {}
  const params = { ...DEFAULT_PARAMS, ...(saved?.params ?? {}) }
  return {
    sequence: saved?.sequence ?? demoSequence(params.bpm),
    history: [],
    future: [],
    activeKeys: [],
    aiKeys: [],
    selected: [],
    params,
    audio: { ...DEFAULT_AUDIO, ...(saved?.audio ?? {}) },
    tab: 'roll',
    status: 'idle',
    message: '準備OK — 鍵盤を弾いてみよう',
    result: null,
    analysis: null,
    loop: false,
    quantizeRec: true,
    snap: 0.25,
    baseOctave: 4,
    cursor: 0,
    generation: 0,
  }
}
