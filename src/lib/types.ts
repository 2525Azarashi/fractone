// ============================================================
// FracTone — 共通型定義 (サーバー / クライアント共有)
// ============================================================

/** シーケンスデータの型定義 (企画書 2.2 準拠 + 拡張フィールド) */
export interface Note {
  id: string // 一意のID
  midiNoteNumber: number // 鍵盤に対応するMIDIノートナンバー (0-127)
  startTime: number // シーケンス開始からの相対時間（秒）
  duration: number // 音の持続時間（秒）
  velocity?: number // 0-1 (省略時 0.8)
  source?: 'user' | 'ai' // 誰が作った音符か
  tag?: string // フレーズラベル (A, A', B ...) やモチーフ印
}

export type ScaleName =
  | 'major'
  | 'minor'
  | 'harmonicMinor'
  | 'dorian'
  | 'lydian'
  | 'pentatonic'
  | 'minorPentatonic'
  | 'blues'

export type TimeSignature = '4/4' | '3/4' | '6/8'

export type Instrument = 'piano' | 'bell' | 'lead' | 'marimba' | 'pad' | 'chip'

/** 作曲パラメータ (左パネルのスライダー群) */
export interface ComposeParams {
  bars: number // 基長: 生成する小節数
  range: number // 音域幅 (半音)
  displacement: number // 変位強度 0-1
  depth: number // 分解深度 1-7
  roughness: number // 粗さ (各階層での振幅減衰率) 0.3-0.9
  motifStrength: number // モチーフ反復度 0-1
  humanize: number // 人間らしさ (タイミング/ベロシティ揺らぎ) 0-1
  density: number // リズム密度 0-1
  key: number // 0=C ... 11=B
  scale: ScaleName
  timeSig: TimeSignature
  bpm: number
  seed: number
  centerNote: number // 音域の中心 MIDI
}

export interface ComposeRequest {
  mode: 'continue' | 'new'
  sequence: Note[]
  params: ComposeParams
}

export interface MotifNote {
  rel: number // モチーフ開始からの拍
  dur: number // 拍
  degree: number // 先頭音からの音階度数差
  semis: number // 先頭音からの半音差
}

export interface Motif {
  notes: MotifNote[]
  lengthBeats: number
  origin: 'detected' | 'firstPhrase' | 'created'
  occurrences: number
  anchorMidi: number
  signature: string // 可視化用: 音程の上下を矢印で表現
}

export type PhraseTransform =
  | 'statement'
  | 'repeat'
  | 'sequence'
  | 'inversion'
  | 'retrograde'
  | 'variation'
  | 'fragment'
  | 'free'
  | 'cadence'

export interface PhrasePlan {
  label: string // A, A', B, A'' ...
  startBeat: number
  lengthBeats: number
  transform: PhraseTransform
  center: number // 中点変位(マクロ)で決まったフレーズ中心音
}

export interface MPDPoint {
  beat: number // 絶対拍位置
  value: number // 連続ピッチ値
  level: number // 何階層目の変位で決まった点か (0 = 端点)
}

export interface ComposeResult {
  notes: Note[]
  motif: Motif | null
  form: PhrasePlan[]
  macro: { index: number; value: number; level: number }[]
  trace: MPDPoint[]
  startBeat: number
  elapsedMs: number
  engine: 'server' | 'client'
}

export interface Analysis {
  noteCount: number
  durationSec: number
  harmony: number // 0-10
  smoothness: number // 0-10
  rhythmClarity: number // 0-10
  motifRepetition: number // 0-1
  materialUsage: number // 0-1
  inScaleRatio: number // 0-1
  consonance: number // 0-1
  stepRatio: number
  leapRatio: number
  avgInterval: number
  maxLeap: number
  rangeSemis: number
  lowest: number
  highest: number
  density: number // notes / sec
  syncopation: number // 0-1
  pitchClassHist: number[] // 12
  intervalHist: number[] // 0..12 (13は12以上)
  durationHist: { label: string; count: number }[]
  contour: { up: number; down: number; same: number }
  character: string
}
