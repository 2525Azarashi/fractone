// ============================================================
// lib/rhythm-generator.ts — 音価(音符の長さ)とリズムパターンの生成・調整
// 単位はすべて「拍 (4分音符 = 1)」
// ============================================================
import type { TimeSignature } from './types'
import { TIME_SIGS, type Rng } from './theory'

export interface RhythmEvent {
  rel: number // 小節/フレーズ先頭からの拍
  dur: number // 音価 (拍)
  accent: number // 0-1 (強拍ほど大きい)
}

/** 1拍分のリズムセル。density によって重みが変化する */
interface Cell {
  pattern: number[] // 音価列 (合計 = 1 or 2 拍)
  span: number
  busy: number // 0 = 疎, 1 = 密
}

const CELLS_44: Cell[] = [
  { pattern: [2], span: 2, busy: 0 }, // 2分音符
  { pattern: [1], span: 1, busy: 0.15 }, // 4分
  { pattern: [1.5, 0.5], span: 2, busy: 0.3 }, // 付点4分 + 8分
  { pattern: [0.5, 0.5], span: 1, busy: 0.45 }, // 8分×2
  { pattern: [0.75, 0.25], span: 1, busy: 0.55 }, // 付点8分 + 16分
  { pattern: [0.5, 1, 0.5], span: 2, busy: 0.55 }, // シンコペーション
  { pattern: [0.5, 0.25, 0.25], span: 1, busy: 0.7 },
  { pattern: [0.25, 0.25, 0.5], span: 1, busy: 0.7 },
  { pattern: [0.25, 0.25, 0.25, 0.25], span: 1, busy: 0.9 }, // 16分×4
]

const CELLS_68: Cell[] = [
  { pattern: [1.5], span: 1.5, busy: 0.05 }, // 付点4分
  { pattern: [1, 0.5], span: 1.5, busy: 0.35 }, // 4分 + 8分 (ハネ)
  { pattern: [0.5, 0.5, 0.5], span: 1.5, busy: 0.6 }, // 8分×3
  { pattern: [0.75, 0.25, 0.5], span: 1.5, busy: 0.7 },
  { pattern: [0.5, 0.25, 0.25, 0.5], span: 1.5, busy: 0.85 },
]

function pickCell(cells: Cell[], remaining: number, density: number, rng: Rng): Cell {
  const ok = cells.filter((c) => c.span <= remaining + 1e-6)
  // density に近い busy 値ほど高い重み (ガウス型)
  const weights = ok.map((c) => Math.exp(-Math.pow((c.busy - density) / 0.22, 2)) + 0.02)
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng.next() * total
  for (let i = 0; i < ok.length; i++) {
    r -= weights[i]
    if (r <= 0) return ok[i]
  }
  return ok[ok.length - 1]
}

export function accentAt(beat: number, timeSig: TimeSignature): number {
  const { beatsPerBar, strong } = TIME_SIGS[timeSig]
  const pos = ((beat % beatsPerBar) + beatsPerBar) % beatsPerBar
  if (Math.abs(pos) < 1e-6) return 1
  if (strong.some((s) => Math.abs(s - pos) < 1e-6)) return 0.8
  if (Math.abs(pos - Math.round(pos)) < 1e-6) return 0.6
  if (Math.abs(pos * 2 - Math.round(pos * 2)) < 1e-6) return 0.4
  return 0.25
}

/** 1小節分のリズムを生成 */
export function generateBarRhythm(timeSig: TimeSignature, density: number, rng: Rng): RhythmEvent[] {
  const { beatsPerBar } = TIME_SIGS[timeSig]
  const cells = timeSig === '6/8' ? CELLS_68 : CELLS_44
  const out: RhythmEvent[] = []
  let t = 0
  while (t < beatsPerBar - 1e-6) {
    const cell = pickCell(cells, beatsPerBar - t, density, rng)
    let p = t
    for (const d of cell.pattern) {
      out.push({ rel: p, dur: d, accent: accentAt(p, timeSig) })
      p += d
    }
    t += cell.span
  }
  // 低密度時はときどき休符を入れて呼吸させる (先頭以外)
  if (density < 0.55 && out.length > 2 && rng.chance(0.25)) {
    const idx = 1 + Math.floor(rng.next() * (out.length - 1))
    out.splice(idx, 1)
  }
  return out
}

/**
 * フレーズのリズムを生成。
 * - targetCount: 分解深度から導かれる目標音数 (深いほど細かい)
 * - rhythmicMotif: 同じ小節パターンを繰り返す確率 (人間らしいリズムの反復)
 */
export function generatePhraseRhythm(opts: {
  bars: number
  timeSig: TimeSignature
  density: number
  depth: number
  repeatProb: number
  rng: Rng
  cadence?: boolean
}): RhythmEvent[] {
  const { beatsPerBar } = TIME_SIGS[opts.timeSig]
  // 分解深度を密度に反映: depth 1→疎, 7→密
  const depthFactor = (opts.depth - 1) / 6
  const eff = Math.max(0, Math.min(1, opts.density * 0.65 + depthFactor * 0.35))
  const out: RhythmEvent[] = []
  let prev: RhythmEvent[] | null = null
  for (let b = 0; b < opts.bars; b++) {
    let bar: RhythmEvent[]
    if (prev && opts.rng.chance(opts.repeatProb)) {
      bar = prev.map((e) => ({ ...e }))
    } else {
      bar = generateBarRhythm(opts.timeSig, eff, opts.rng)
    }
    prev = bar
    for (const e of bar) out.push({ ...e, rel: e.rel + b * beatsPerBar })
  }
  // フレーズ末尾は長めに伸ばして句読点をつける
  if (out.length > 1) {
    const total = opts.bars * beatsPerBar
    const lastBarStart = (opts.bars - 1) * beatsPerBar
    if (opts.cadence) {
      // 終止: 最終小節の頭で全音符級に
      const trimmed = out.filter((e) => e.rel < lastBarStart - 1e-6)
      trimmed.push({ rel: lastBarStart, dur: beatsPerBar, accent: 1 })
      return trimmed
    }
    const last = out[out.length - 1]
    if (last.dur < 1 && opts.rng.chance(0.7)) {
      // 最後の数音をまとめて伸ばす
      const keepUntil = Math.max(lastBarStart, total - 1.5)
      const trimmed = out.filter((e) => e.rel < keepUntil - 1e-6)
      const tail = trimmed[trimmed.length - 1]
      if (tail) tail.dur = total - tail.rel
      return trimmed
    }
  }
  return out
}

/** 拍位置をグリッドにスナップ */
export function snapBeat(beat: number, grid = 0.25): number {
  return Math.round(beat / grid) * grid
}

/**
 * 人間らしい揺らぎ (Humanize)
 * - タイミング: 強拍は正確、弱拍ほど揺れる / 少し前ノリ・後ノリ
 * - ベロシティ: アクセント + ランダム + フレーズ内の山なり
 * - 音価: レガート/スタッカートの揺れ
 */
export function humanize(
  ev: { start: number; dur: number; accent: number; phrasePos: number },
  amount: number,
  secPerBeat: number,
  rng: Rng,
) {
  const jitter = rng.gauss() * 0.012 * amount * (1.2 - ev.accent)
  const swingLate = ev.accent < 0.5 ? 0.006 * amount : 0
  const arch = Math.sin(Math.PI * Math.max(0, Math.min(1, ev.phrasePos))) * 0.12
  const vel = 0.55 + ev.accent * 0.25 + arch + rng.tri() * 0.12 * amount
  const legato = 0.92 + rng.tri() * 0.06 * amount
  return {
    startSec: Math.max(0, ev.start * secPerBeat + (jitter + swingLate) * (amount > 0 ? 1 : 0)),
    durSec: Math.max(0.05, ev.dur * secPerBeat * legato),
    velocity: Math.max(0.2, Math.min(1, vel)),
  }
}
