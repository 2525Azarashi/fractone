// ============================================================
// 音楽理論ユーティリティ: スケール / 音名 / 乱数 / 量子化
// ============================================================
import type { ScaleName, TimeSignature } from './types'

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const KEY_NAMES_JA = NOTE_NAMES

export const SCALES: Record<ScaleName, { label: string; steps: number[] }> = {
  major: { label: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor: { label: 'Harmonic Minor', steps: [0, 2, 3, 5, 7, 8, 11] },
  dorian: { label: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  lydian: { label: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
  pentatonic: { label: 'Pentatonic', steps: [0, 2, 4, 7, 9] },
  minorPentatonic: { label: 'Minor Penta', steps: [0, 3, 5, 7, 10] },
  blues: { label: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
}

export const TIME_SIGS: Record<TimeSignature, { beatsPerBar: number; strong: number[] }> = {
  '4/4': { beatsPerBar: 4, strong: [0, 2] },
  '3/4': { beatsPerBar: 3, strong: [0] },
  '6/8': { beatsPerBar: 3, strong: [0, 1.5] }, // 4分音符基準で 3 拍 (付点4分×2)
}

export function midiToName(m: number): string {
  const n = Math.round(m)
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`
}

export function isBlack(m: number): boolean {
  return [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12)
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12)
}

/** スケール内の全MIDIノート (0..127) */
export function scaleNotes(key: number, scale: ScaleName): number[] {
  const steps = SCALES[scale].steps
  const out: number[] = []
  for (let m = 0; m < 128; m++) {
    const pc = (((m - key) % 12) + 12) % 12
    if (steps.includes(pc)) out.push(m)
  }
  return out
}

export function inScale(m: number, key: number, scale: ScaleName): boolean {
  const pc = (((m - key) % 12) + 12) % 12
  return SCALES[scale].steps.includes(pc)
}

/** 連続値をスケール内最近傍ノートに量子化 */
export function quantizeToScale(v: number, pool: number[]): number {
  let best = pool[0]
  let bd = Infinity
  for (const m of pool) {
    const d = Math.abs(m - v)
    if (d < bd) {
      bd = d
      best = m
    }
  }
  return best
}

/** MIDI -> スケール内インデックス(度数) — 非スケール音は最近傍 */
export function degreeIndex(m: number, pool: number[]): number {
  let best = 0
  let bd = Infinity
  pool.forEach((p, i) => {
    const d = Math.abs(p - m)
    if (d < bd) {
      bd = d
      best = i
    }
  })
  return best
}

/** 決定論的乱数 (mulberry32) — seed を保存すれば同じ曲を再現可能 */
export function createRng(seed: number) {
  let a = seed >>> 0 || 1
  const next = () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (min: number, max: number) => min + next() * (max - min),
    /** 中心0, [-1,1] の三角分布 (平均的な変位を好む) */
    tri: () => next() + next() - 1,
    gauss: () => {
      const u = Math.max(1e-9, next())
      const v = next()
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
    pick: <T,>(arr: T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  }
}
export type Rng = ReturnType<typeof createRng>

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

export function uid(prefix = 'n'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}

/** キー推定 (Krumhansl-Schmuckler 簡易版) */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
export function estimateKey(midis: number[], durations: number[]): { key: number; scale: ScaleName; score: number } {
  const hist = new Array(12).fill(0)
  midis.forEach((m, i) => (hist[((m % 12) + 12) % 12] += durations[i] ?? 1))
  let best = { key: 0, scale: 'major' as ScaleName, score: -Infinity }
  const corr = (prof: number[], k: number) => {
    let s = 0
    for (let i = 0; i < 12; i++) s += hist[(i + k) % 12] * prof[i]
    return s
  }
  for (let k = 0; k < 12; k++) {
    const a = corr(MAJOR_PROFILE, k)
    const b = corr(MINOR_PROFILE, k)
    if (a > best.score) best = { key: k, scale: 'major', score: a }
    if (b > best.score) best = { key: k, scale: 'minor', score: b }
  }
  return best
}
