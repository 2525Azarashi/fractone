// ============================================================
// lib/chord-generator.ts — メロディからのコード進行生成と伴奏づけ
//
//  1. メロディを「コード区間」(1小節 or 半小節) に区切る
//  2. 各区間で、スケールのダイアトニック・コード候補に点数を付ける
//       ・区間内のメロディ音がコード構成音か (音価 × 拍の強さで重み付け)
//       ・強拍の音が構成音なら大きく加点、非和声音は減点
//  3. 機能和声 (T: トニック / S: サブドミナント / D: ドミナント) の
//     つながりやすさを遷移点数とし、動的計画法 (Viterbi) で全体最適の進行を選ぶ
//       ・最後は D → T の終止 (カデンツ)、最初は T を好む
//  4. 選んだ進行を、スタイル (ブロック / アルペジオ / アルベルティ / ベース+和音) で
//     伴奏の音符に展開する。ボイシングは前の和音から最も近い転回形を選ぶ (滑らかな声部進行)
//
//  サーバー / クライアントの両方で動く純粋関数
// ============================================================
import type { Note, ScaleName, TimeSignature } from './types'
import { SCALES, TIME_SIGS, NOTE_NAMES, createRng, uid } from './theory'

export type ChordStyle = 'block' | 'arpeggio' | 'alberti' | 'bass'
export type ChordFunc = 'T' | 'S' | 'D'

export interface HarmonyParams {
  style: ChordStyle
  /** コードを変える間隔 (拍)。0 = 自動 (小節ごと、メロディが動く所は半小節) */
  rate: number
  /** 7th を使う割合 0-1 */
  color: number
  /** 伴奏の音量 0-1 */
  volume: number
  /** 伴奏の音域の中心 (MIDI) */
  register: number
}

export const DEFAULT_HARMONY: HarmonyParams = { style: 'arpeggio', rate: 0, color: 0.35, volume: 0.6, register: 52 }

export interface Chord {
  startBeat: number
  lengthBeats: number
  root: number // ピッチクラス 0-11
  quality: 'maj' | 'min' | 'dim' | 'aug'
  seventh: boolean
  degree: number // 0-6 (スケールの何度目から積んだか)
  roman: string // I, ii, V7 ...
  name: string // C, Dm, G7 ...
  func: ChordFunc
  pcs: number[] // 構成音のピッチクラス
  fit: number // メロディとの一致度 0-1
}

export interface HarmonyResult {
  chords: Chord[]
  notes: Note[] // 伴奏 (source = 'chord')
  elapsedMs: number
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

/** 7音スケール以外 (ペンタ・ブルース) は、親のメジャー / マイナーで和声づけする */
function harmonicSteps(scale: ScaleName): number[] {
  if (scale === 'pentatonic') return SCALES.major.steps
  if (scale === 'minorPentatonic' || scale === 'blues') return SCALES.minor.steps
  return SCALES[scale].steps
}

interface Cand { degree: number; root: number; quality: Chord['quality']; pcs3: number[]; pcs7: number[]; func: ChordFunc; roman: string; name: string; name7: string; roman7: string }

/** スケール上の各音に 3度を積んでダイアトニック・コードを作る */
function diatonic(key: number, scale: ScaleName): Cand[] {
  const st = harmonicSteps(scale)
  const minorish = st[2] === 3
  const out: Cand[] = []
  for (let d = 0; d < 7; d++) {
    const r = st[d], t = st[(d + 2) % 7], f = st[(d + 4) % 7], s = st[(d + 6) % 7]
    const i3 = (t - r + 12) % 12, i5 = (f - r + 12) % 12
    const quality: Chord['quality'] = i3 === 4 && i5 === 7 ? 'maj' : i3 === 3 && i5 === 7 ? 'min' : i3 === 3 && i5 === 6 ? 'dim' : 'aug'
    const root = (key + r) % 12
    const pcs3 = [r, t, f].map((x) => (key + x) % 12)
    const pcs7 = [...pcs3, (key + s) % 12]
    const i7 = (s - r + 12) % 12
    // 機能: 長調 I iii vi = T / ii IV = S / V vii = D (iii は T 寄り)。短調も度数で同様に扱う
    const func: ChordFunc = [0, 2, 5].includes(d) ? 'T' : [1, 3].includes(d) ? 'S' : 'D'
    const base = ROMAN[d]
    const roman = quality === 'maj' || quality === 'aug' ? base : base.toLowerCase()
    const suf = quality === 'min' ? 'm' : quality === 'dim' ? 'dim' : quality === 'aug' ? 'aug' : ''
    const name = NOTE_NAMES[root] + suf
    // 7th の表記: 長三和音+長7 = M7, 長三和音+短7 = 7, 短三和音+短7 = m7, 減三和音+短7 = m7♭5
    const s7 = quality === 'maj' ? (i7 === 11 ? 'M7' : '7') : quality === 'min' ? (i7 === 11 ? 'mM7' : 'm7') : quality === 'dim' ? (i7 === 10 ? 'm7♭5' : 'dim7') : 'augM7'
    const r7 = quality === 'maj' ? (i7 === 11 ? 'M7' : '7') : quality === 'dim' ? 'ø7' : '7'
    out.push({ degree: d, root, quality, pcs3, pcs7, func, roman, name, name7: NOTE_NAMES[root] + s7, roman7: roman + r7 })
  }
  // 短調系: 導音を半音上げた「長三和音の V (V7)」を追加 — 終止感が強くなる (和声的短音階)
  if (minorish && out[4].quality === 'min') {
    const r = (key + st[4]) % 12
    const lead = (r + 4) % 12
    out.push({ degree: 4, root: r, quality: 'maj', pcs3: [r, lead, (r + 7) % 12], pcs7: [r, lead, (r + 7) % 12, (r + 10) % 12], func: 'D', roman: 'V', name: NOTE_NAMES[r], name7: NOTE_NAMES[r] + '7', roman7: 'V7' })
  }
  return out
}

/** 機能和声の遷移点数 (前 → 次)。大きいほど自然 */
const FLOW: Record<ChordFunc, Record<ChordFunc, number>> = {
  T: { T: 0.1, S: 0.9, D: 0.6 },
  S: { T: 0.35, S: 0.25, D: 1.0 },
  D: { T: 1.0, S: 0.05, D: 0.2 },
}
/** よく使われる度数進行の個別ボーナス (例: ii→V, V→I, IV→V, vi→ii, I→vi) */
const MOVE_BONUS: Record<string, number> = { '1-4': 0.6, '4-0': 0.7, '3-4': 0.4, '5-1': 0.35, '0-5': 0.3, '0-3': 0.35, '5-3': 0.3, '3-0': 0.2, '6-0': 0.4, '2-5': 0.3 }

export function harmonize(melody: Note[], opt: { key: number; scale: ScaleName; bpm: number; timeSig: TimeSignature; seed: number; harmony: HarmonyParams }): HarmonyResult {
  const t0 = Date.now()
  const { key, scale, bpm, timeSig, harmony } = opt
  const spb = 60 / bpm
  const { beatsPerBar, strong } = TIME_SIGS[timeSig]
  const rng = createRng(opt.seed * 31 + 7)
  const mel = [...melody].sort((a, b) => a.startTime - b.startTime)
  if (!mel.length) return { chords: [], notes: [], elapsedMs: 0 }
  const endBeat = Math.max(...mel.map((n) => (n.startTime + n.duration) / spb))
  const totalBars = Math.max(1, Math.ceil(endBeat / beatsPerBar - 1e-6))
  const cands = diatonic(key, scale)
  const wCache = new Map<string, { w: number[]; total: number }>() // 区間ごとの音の重み (候補間で共有)

  // ---- 1. コード区間 ----
  // 自動: 基本は1小節。小節前半と後半で別のコードの方が明らかに合う場合だけ半小節に割る
  const segs: { s: number; l: number }[] = []
  const fixedRate = harmony.rate > 0 ? harmony.rate : 0
  for (let b = 0; b < totalBars; b++) {
    const s = b * beatsPerBar
    if (fixedRate) {
      for (let x = 0; x < beatsPerBar - 1e-6; x += fixedRate) segs.push({ s: s + x, l: Math.min(fixedRate, beatsPerBar - x) })
      continue
    }
    if (beatsPerBar === 4) {
      const whole = bestFit(s, 4), h1 = bestFit(s, 2), h2 = bestFit(s + 2, 2)
      if (h1.c !== h2.c && (h1.v + h2.v) / 2 > whole.v + 0.18) { segs.push({ s, l: 2 }, { s: s + 2, l: 2 }); continue }
    }
    segs.push({ s, l: beatsPerBar })
  }

  // ---- 2. 各区間 × 候補の「メロディ適合度」----
  function weightsIn(s: number, l: number) {
    const ck = `${s}:${l}`
    const hit = wCache.get(ck)
    if (hit) return hit
    const r = weightsCalc(s, l)
    wCache.set(ck, r)
    return r
  }
  function weightsCalc(s: number, l: number) {
    const w = new Array(12).fill(0)
    let total = 0
    mel.forEach((n) => {
      const a = n.startTime / spb, b = a + n.duration / spb
      const ov = Math.min(b, s + l) - Math.max(a, s)
      if (ov <= 0) return
      const pos = ((Math.max(a, s) % beatsPerBar) + beatsPerBar) % beatsPerBar
      const onStrong = a >= s - 1e-6 && strong.some((x) => Math.abs(pos - x) < 0.13)
      const k = ov * (onStrong ? 1.8 : 1) * (a <= s + 1e-6 ? 1.3 : 1) // 区間頭にかかる音は和音を決めやすい
      w[n.midiNoteNumber % 12] += k
      total += k
    })
    return { w, total }
  }
  function fitOf(c: Cand, s: number, l: number) {
    const { w, total } = weightsIn(s, l)
    if (!total) return 0.5 // 休符区間はどれでもよい
    let inC = 0
    w.forEach((v, pc) => { if (c.pcs3.includes(pc)) inC += v; else if (c.pcs7[3] === pc) inC += v * 0.6 })
    return inC / total
  }
  function bestFit(s: number, l: number) {
    let best = { c: 0, v: -1 }
    cands.forEach((c, i) => {
      if (c.quality === 'dim' || c.quality === 'aug') return
      const v = fitOf(c, s, l)
      if (v > best.v) best = { c: i, v }
    })
    return best
  }

  // ---- 3. Viterbi で進行を決める ----
  const N = segs.length
  const K = cands.length
  const emit = segs.map((g) => cands.map((c) => {
    let v = fitOf(c, g.s, g.l) * 3
    if (c.quality === 'dim') v -= 0.9 // 減三和音は控えめに
    if (c.quality === 'aug') v -= 1.4
    if (c.degree === 2) v -= 0.25 // iii はやや使いにくい
    return v
  }))
  const score: number[][] = [], back: number[][] = []
  for (let i = 0; i < N; i++) {
    score.push(new Array(K).fill(-Infinity))
    back.push(new Array(K).fill(0))
    for (let c = 0; c < K; c++) {
      if (i === 0) {
        score[0][c] = emit[0][c] + (c === 0 ? 0.9 : cands[c].func === 'T' ? 0.2 : 0)
        continue
      }
      for (let p = 0; p < K; p++) {
        const same = p === c
        // 同じ和音の連続は、区間が短い (半小節) ときだけ許容
        const tr = (same ? (segs[i].l < beatsPerBar ? 0.1 : -0.35) : FLOW[cands[p].func][cands[c].func] + (MOVE_BONUS[`${cands[p].degree}-${cands[c].degree}`] ?? 0)) + rng.range(-0.06, 0.06)
        const v = score[i - 1][p] + tr + emit[i][c]
        if (v > score[i][c]) { score[i][c] = v; back[i][c] = p }
      }
      // 終止: 最後は I、その手前は V (or IV) を強く好む
      const dg = cands[c].degree
      if (i === N - 1) score[i][c] += dg === 0 ? 3 : -0.8
      // 終止の手前は V (短調では長三和音の V を優先)
      if (i === N - 2 && N > 2) score[i][c] += dg === 4 ? (cands[c].quality === 'maj' ? 0.9 : 0.4) : dg === 3 ? 0.3 : 0
    }
  }
  const path = new Array(N).fill(0)
  path[N - 1] = score[N - 1].indexOf(Math.max(...score[N - 1]))
  for (let i = N - 1; i > 0; i--) path[i - 1] = back[i][path[i]]

  const chords: Chord[] = segs.map((g, i) => {
    const c = cands[path[i]]
    // 7th: V は 7th が自然。最後の主和音は三和音で閉じる。他は color の確率で
    const seventh = i === N - 1 ? false : c.degree === 4 ? harmony.color > 0.15 : c.quality !== 'dim' && rng.chance(harmony.color * 0.8)
    return {
      startBeat: g.s, lengthBeats: g.l, root: c.root, quality: c.quality, seventh, degree: c.degree,
      roman: seventh ? c.roman7 : c.roman, name: seventh ? c.name7 : c.name, func: c.func,
      pcs: seventh ? c.pcs7 : c.pcs3, fit: Math.min(1, fitOf(c, g.s, g.l)),
    }
  })

  // ---- 4. 伴奏パターン ----
  const notes: Note[] = []
  const reg = harmony.register
  const vol = 0.35 + harmony.volume * 0.4
  let prevVoicing: number[] | null = null
  const push = (midi: number, beat: number, len: number, vel: number) => {
    notes.push({ id: uid('c'), midiNoteNumber: midi, startTime: beat * spb, duration: Math.max(0.05, len * spb - 0.02), velocity: Math.min(1, vel * vol), source: 'chord' })
  }
  chords.forEach((ch, ci) => {
    const voicing = voiceLead(ch.pcs, reg, prevVoicing)
    prevVoicing = voicing
    const bass = nearestBelow(ch.root, voicing[0] - 1, reg - 14)
    const s = ch.startBeat, l = ch.lengthBeats
    const last = ci === chords.length - 1
    switch (harmony.style) {
      case 'block': {
        // 頭で和音、残りは拍ごとに軽く刻む (最終和音は伸ばす)
        push(bass, s, l, 0.85)
        if (last) { voicing.forEach((m) => push(m, s, l, 0.7)); break }
        for (let b = 0; b < l - 1e-6; b += timeSig === '6/8' ? 1.5 : 1) voicing.forEach((m) => push(m, s + b, Math.min(timeSig === '6/8' ? 1.4 : 0.9, l - b), b === 0 ? 0.72 : 0.5))
        break
      }
      case 'arpeggio': {
        // ベース → 上行 → 下行 の 8分アルペジオ
        push(bass, s, last ? l : Math.min(2, l), 0.85)
        const up = [...voicing, voicing[1] + 12]
        const seq = [...up, ...up.slice(1, -1).reverse()]
        const step = 0.5
        for (let k = 1; k * step < l - 1e-6; k++) {
          if (last && k * step >= 1) break
          push(seq[(k - 1) % seq.length], s + k * step, step * 1.6, 0.55 + (k % 2 ? 0 : 0.08))
        }
        if (last) voicing.forEach((m) => push(m, s + 0.5, l - 0.5, 0.55))
        break
      }
      case 'alberti': {
        // ド・ソ・ミ・ソ (低・高・中・高) の 8分 — 古典派の定番
        const [lo, mid, hi] = [voicing[0], voicing[1], voicing[voicing.length - 1]]
        const pat = [lo, hi, mid, hi]
        if (last) { push(bass, s, l, 0.8); voicing.forEach((m) => push(m, s, l, 0.6)); break }
        for (let k = 0; k * 0.5 < l - 1e-6; k++) push(pat[k % 4], s + k * 0.5, 0.5, k % 4 === 0 ? 0.68 : 0.5)
        if (ci % 2 === 0) push(bass, s, l, 0.6)
        break
      }
      case 'bass': {
        // ルート + 5度のベースと、裏拍の和音 (ポップス的)
        const fifth = bass + 7
        const beats = timeSig === '6/8' ? [0, 1.5] : timeSig === '3/4' ? [0, 1, 2] : [0, 1, 2, 3]
        beats.forEach((b, k) => {
          if (b >= l - 1e-6) return
          if (k % 2 === 0) push(k === 0 ? bass : fifth, s + b, 0.9, 0.8)
          else voicing.forEach((m) => push(m, s + b, 0.45, 0.48))
          if (timeSig === '4/4' && k % 2 === 0) voicing.forEach((m) => push(m, s + b + 0.5, 0.4, 0.4))
        })
        if (last) voicing.forEach((m) => push(m, s, l, 0.55))
        break
      }
    }
  })
  return { chords, notes, elapsedMs: Date.now() - t0 }
}

/** 中心 center 付近で、前の和音から合計移動量が最小になる配置 (転回形) を選ぶ */
function voiceLead(pcs: number[], center: number, prev: number[] | null): number[] {
  const tones = pcs.slice(0, 4)
  const options: number[][] = []
  for (let inv = 0; inv < tones.length; inv++) {
    const order = [...tones.slice(inv), ...tones.slice(0, inv)]
    for (let base = center - 9; base <= center + 3; base++) {
      if (((base % 12) + 12) % 12 !== order[0]) continue
      const v = [base]
      for (let k = 1; k < order.length; k++) {
        let m = v[k - 1] + 1
        while (((m % 12) + 12) % 12 !== order[k]) m++
        v.push(m)
      }
      options.push(v)
    }
  }
  const cost = (v: number[]) => {
    const spread = v[v.length - 1] - v[0]
    let c = Math.abs((v[0] + v[v.length - 1]) / 2 - center) * 0.35 + (spread > 12 ? 4 : 0)
    if (prev) {
      const a = [...prev].sort((x, y) => x - y), b = [...v].sort((x, y) => x - y)
      for (let i = 0; i < Math.min(a.length, b.length); i++) c += Math.abs(a[i] - b[i])
    }
    return c
  }
  options.sort((a, b) => cost(a) - cost(b))
  return options[0] ?? tones.map((p) => center - 6 + p)
}

function nearestBelow(pc: number, maxMidi: number, target: number): number {
  let m = Math.min(maxMidi, target + 6)
  while (((m % 12) + 12) % 12 !== pc) m--
  if (m < 28) m += 12
  return m
}
