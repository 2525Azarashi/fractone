// ============================================================
// lib/motif.ts — モチーフの「判断(検出)」「作成」「変形」
// ============================================================
import type { Motif, MotifNote, PhraseTransform } from './types'
import { degreeIndex, type Rng } from './theory'
import { midpointDisplace, sampleCurve } from './midpoint-displace'
import { generateBarRhythm } from './rhythm-generator'
import type { TimeSignature } from './types'

export interface BeatNote {
  beat: number
  dur: number
  midi: number
  vel?: number
}

const arrow = (d: number) => (d > 0 ? '↗' : d < 0 ? '↘' : '→')

function signatureOf(notes: MotifNote[]): string {
  return notes
    .slice(1)
    .map((n, i) => arrow(n.degree - notes[i].degree))
    .join('')
}

function toMotifNotes(seg: BeatNote[], pool: number[]): MotifNote[] {
  const b0 = seg[0].beat
  const d0 = degreeIndex(seg[0].midi, pool)
  return seg.map((n) => ({
    rel: +(n.beat - b0).toFixed(3),
    dur: +n.dur.toFixed(3),
    degree: degreeIndex(n.midi, pool) - d0,
    semis: n.midi - seg[0].midi,
  }))
}

/**
 * モチーフ判断: ユーザー入力から「繰り返されている音型」を探す
 *  - 音階度数の差分列 + 音価列(16分グリッド) を n-gram 化
 *  - 長さ×出現回数が最大のものを採用 (重複出現は除外)
 *  - 見つからなければ「冒頭フレーズ」をモチーフとみなす
 */
export function detectMotif(notes: BeatNote[], pool: number[], beatsPerBar: number): Motif | null {
  const ns = [...notes].sort((a, b) => a.beat - b.beat)
  if (ns.length < 3) return null
  const deg = ns.map((n) => degreeIndex(n.midi, pool))
  const q = (x: number) => Math.round(x * 4)
  let best: { start: number; len: number; occ: number; score: number } | null = null

  for (let len = Math.min(8, Math.floor(ns.length / 2)); len >= 3; len--) {
    const map = new Map<string, number[]>()
    for (let i = 0; i + len <= ns.length; i++) {
      const parts: string[] = []
      for (let k = 1; k < len; k++) {
        parts.push(`${deg[i + k] - deg[i + k - 1]}:${q(ns[i + k].beat - ns[i + k - 1].beat)}`)
      }
      const key = parts.join('|')
      const arr = map.get(key) ?? []
      // 重ならない出現のみカウント
      if (arr.length === 0 || i >= arr[arr.length - 1] + len) arr.push(i)
      map.set(key, arr)
    }
    for (const [, occ] of map) {
      if (occ.length >= 2) {
        const score = len * occ.length + len * 0.5
        if (!best || score > best.score) best = { start: occ[0], len, occ: occ.length, score }
      }
    }
  }

  if (best) {
    // 検出した核を「小節単位の音型」まで拡張 (人間が認識するモチーフは通常 1〜2 小節)
    const s0 = ns[best.start].beat
    const coreEnd = ns[best.start + best.len - 1].beat + ns[best.start + best.len - 1].dur
    const span = coreEnd - s0 > beatsPerBar + 1e-6 ? beatsPerBar * 2 : beatsPerBar
    let seg = ns.filter((n) => n.beat >= s0 - 1e-6 && n.beat < s0 + span - 1e-6)
    if (seg.length > 10) seg = seg.slice(0, 10)
    if (seg.length < best.len) seg = ns.slice(best.start, best.start + best.len)
    const mn = toMotifNotes(seg, pool)
    const last = mn[mn.length - 1]
    return {
      notes: mn,
      lengthBeats: Math.max(1, Math.ceil((last.rel + last.dur) * 2) / 2),
      origin: 'detected',
      occurrences: best.occ,
      anchorMidi: seg[0].midi,
      signature: signatureOf(mn),
    }
  }

  // 反復が見つからない → 冒頭1〜2小節をモチーフとする
  const firstBeat = ns[0].beat
  const span = ns[ns.length - 1].beat - firstBeat >= beatsPerBar * 2 ? beatsPerBar * 2 : beatsPerBar
  let seg = ns.filter((n) => n.beat < firstBeat + span - 1e-6)
  if (seg.length > 8) seg = seg.slice(0, 8)
  if (seg.length < 2) seg = ns.slice(0, Math.min(4, ns.length))
  const mn = toMotifNotes(seg, pool)
  const last = mn[mn.length - 1]
  return {
    notes: mn,
    lengthBeats: Math.max(1, Math.min(span, Math.ceil((last.rel + last.dur) * 2) / 2)),
    origin: 'firstPhrase',
    occurrences: 1,
    anchorMidi: seg[0].midi,
    signature: signatureOf(mn),
  }
}

/**
 * モチーフ作成: 入力がない場合、1小節の短いリズム + 小さな中点変位カーブから
 * 覚えやすい音型を作る (音数 3〜7)
 */
export function createMotif(opts: {
  pool: number[]
  center: number
  timeSig: TimeSignature
  beatsPerBar: number
  density: number
  displacement: number
  rng: Rng
}): Motif {
  const { rng } = opts
  let rhythm = generateBarRhythm(opts.timeSig, Math.min(0.75, opts.density + 0.1), rng)
  while (rhythm.length < 3) rhythm = generateBarRhythm(opts.timeSig, 0.6, rng)
  if (rhythm.length > 7) rhythm = rhythm.slice(0, 7)
  const curve = midpointDisplace({
    start: 0,
    end: rng.pick([-1, 1, 2, -2, 0]),
    depth: 3,
    displacement: 2 + opts.displacement * 4,
    roughness: 0.55,
    min: -5,
    max: 5,
    rng,
  })
  const mn: MotifNote[] = rhythm.map((e) => {
    const v = sampleCurve(curve.values, e.rel / opts.beatsPerBar)
    return { rel: e.rel, dur: e.dur, degree: Math.round(v), semis: 0 }
  })
  mn[0].degree = 0
  // 同音連続が多すぎる場合は動きを付ける
  for (let i = 1; i < mn.length; i++) {
    if (mn[i].degree === mn[i - 1].degree && rng.chance(0.6)) mn[i].degree += rng.pick([-1, 1])
  }
  const anchorIdx = degreeIndex(opts.center, opts.pool)
  mn.forEach((n) => (n.semis = opts.pool[Math.max(0, Math.min(opts.pool.length - 1, anchorIdx + n.degree))] - opts.pool[anchorIdx]))
  const last = mn[mn.length - 1]
  return {
    notes: mn,
    lengthBeats: Math.max(1, Math.ceil(last.rel + last.dur)),
    origin: 'created',
    occurrences: 0,
    anchorMidi: opts.pool[anchorIdx],
    signature: signatureOf(mn),
  }
}

/**
 * モチーフ変形 (人間の作曲家がよく使う展開技法)
 *  repeat     : そのまま (度数空間で移調)
 *  sequence   : 反復進行 (度数をずらす)
 *  inversion  : 反行 (上下反転)
 *  retrograde : 逆行
 *  variation  : 一部の音だけ変える / 末尾を変える
 *  fragment   : 前半だけを切り出して2回 (ゼクエンツ付き)
 */
/** strength (= モチーフ反復度) が高いほど変奏が控えめになり、原形がはっきり聴こえる */
export function transformMotif(m: Motif, t: PhraseTransform, rng: Rng, strength = 0.7): MotifNote[] {
  const ns = m.notes.map((n) => ({ ...n }))
  switch (t) {
    case 'sequence': {
      const shift = rng.pick([1, 2, -1, -2])
      return ns.map((n) => ({ ...n, degree: n.degree + shift }))
    }
    case 'inversion':
      return ns.map((n) => ({ ...n, degree: -n.degree }))
    case 'retrograde': {
      const L = m.lengthBeats
      const rev = ns
        .map((n) => ({ ...n, rel: Math.max(0, L - (n.rel + n.dur)) }))
        .sort((a, b) => a.rel - b.rel)
      const d0 = rev[0].degree
      return rev.map((n) => ({ ...n, degree: n.degree - d0 }))
    }
    case 'variation': {
      const out = ns.map((n, i) => {
        if (i > 0 && rng.chance(0.45 - strength * 0.3)) return { ...n, degree: n.degree + rng.pick([-1, 1, 2, -2]) }
        return n
      })
      // 末尾を変化させて「問い→答え」感を出す
      const last = out[out.length - 1]
      last.degree += rng.pick([-1, -2, 1])
      return out
    }
    case 'fragment': {
      const half = m.lengthBeats / 2
      const head = ns.filter((n) => n.rel < half - 1e-6)
      const base = head.length >= 2 ? head : ns.slice(0, Math.max(2, Math.ceil(ns.length / 2)))
      const shift = rng.pick([1, -1, 2])
      const seg = Math.max(...base.map((n) => n.rel + n.dur))
      return [...base, ...base.map((n) => ({ ...n, rel: n.rel + seg, degree: n.degree + shift }))]
    }
    default:
      return ns
  }
}
