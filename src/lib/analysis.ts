// ============================================================
// lib/analysis.ts — 楽典分析 (ハーモニー指数 / 滑らかさ / リズム明瞭性 ...)
// ============================================================
import type { Analysis, Note, ScaleName, TimeSignature } from './types'
import { TIME_SIGS, inScale, clamp } from './theory'

// 音程(半音)ごとの協和度 (0=不協和 1=完全協和)
const CONSONANCE = [1, 0.1, 0.45, 0.75, 0.8, 0.9, 0.15, 1, 0.75, 0.8, 0.4, 0.2, 1]

export function analyze(notes: Note[], key: number, scale: ScaleName, bpm: number, timeSig: TimeSignature): Analysis {
  const ns = [...notes].sort((a, b) => a.startTime - b.startTime)
  const n = ns.length
  const pitchClassHist = new Array(12).fill(0)
  const intervalHist = new Array(13).fill(0)
  const empty: Analysis = {
    noteCount: 0, durationSec: 0, harmony: 0, smoothness: 0, rhythmClarity: 0, motifRepetition: 0,
    materialUsage: 0, inScaleRatio: 0, consonance: 0, stepRatio: 0, leapRatio: 0, avgInterval: 0,
    maxLeap: 0, rangeSemis: 0, lowest: 0, highest: 0, density: 0, syncopation: 0, pitchClassHist,
    intervalHist, durationHist: [], contour: { up: 0, down: 0, same: 0 }, character: '—',
  }
  if (n === 0) return empty

  const spb = 60 / bpm
  const { beatsPerBar } = TIME_SIGS[timeSig]
  const midis = ns.map((x) => x.midiNoteNumber)
  const durationSec = Math.max(...ns.map((x) => x.startTime + x.duration))

  // --- ピッチクラス & スケール適合 ---
  let inCount = 0
  ns.forEach((x) => {
    pitchClassHist[x.midiNoteNumber % 12] += 1
    if (inScale(x.midiNoteNumber, key, scale)) inCount++
  })
  const inScaleRatio = inCount / n

  // --- 音程 ---
  let up = 0, down = 0, same = 0, steps = 0, leaps = 0, sumI = 0, maxLeap = 0, cons = 0
  for (let i = 1; i < n; i++) {
    const d = midis[i] - midis[i - 1]
    const a = Math.abs(d)
    intervalHist[Math.min(12, a)]++
    if (d > 0) up++
    else if (d < 0) down++
    else same++
    if (a > 0 && a <= 2) steps++
    if (a >= 5) leaps++
    sumI += a
    maxLeap = Math.max(maxLeap, a)
    cons += a > 12 ? CONSONANCE[a % 12] * 0.8 : CONSONANCE[a]
  }
  const pairs = Math.max(1, n - 1)
  const avgInterval = sumI / pairs
  const consonance = cons / pairs
  const stepRatio = steps / pairs
  const leapRatio = leaps / pairs

  // --- ハーモニー指数: スケール適合 + 協和度 + 強拍のトニック/ドミナント率 ---
  let strongChord = 0, strongN = 0
  ns.forEach((x) => {
    const beat = x.startTime / spb
    const pos = beat % beatsPerBar
    if (Math.abs(pos - Math.round(pos)) < 0.08 && Math.round(pos) % beatsPerBar === 0) {
      strongN++
      const pc = ((x.midiNoteNumber - key) % 12 + 12) % 12
      if ([0, 3, 4, 7].includes(pc)) strongChord++
    }
  })
  const strongRatio = strongN ? strongChord / strongN : 0.5
  const harmony = clamp((inScaleRatio * 0.45 + consonance * 0.35 + strongRatio * 0.2) * 10, 0, 10)

  // --- 滑らかさ: 順次進行率が高く、大跳躍が少ないほど高い / 跳躍後の反行(gap-fill) を加点 ---
  let gapFill = 0, bigLeaps = 0
  for (let i = 2; i < n; i++) {
    const d1 = midis[i - 1] - midis[i - 2]
    const d2 = midis[i] - midis[i - 1]
    if (Math.abs(d1) >= 5) {
      bigLeaps++
      if (Math.sign(d1) !== Math.sign(d2) && d2 !== 0) gapFill++
    }
  }
  const gf = bigLeaps ? gapFill / bigLeaps : 1
  const smoothness = clamp((stepRatio * 0.5 + (1 - clamp(avgInterval / 7, 0, 1)) * 0.3 + gf * 0.2) * 10 + (same / pairs < 0.4 ? 0.3 : -0.8), 0, 10)

  // --- リズム明瞭性: グリッド上の一致度 + 強拍の発音率 + 音価の種類が適度 ---
  let onGrid = 0, sync = 0
  const durMap = new Map<string, number>()
  const durLabel = (b: number) => (b >= 3.5 ? '全' : b >= 1.75 ? '2分' : b >= 1.25 ? '付点4' : b >= 0.85 ? '4分' : b >= 0.6 ? '付点8' : b >= 0.4 ? '8分' : '16分')
  ns.forEach((x) => {
    const beat = x.startTime / spb
    const off = Math.abs(beat * 4 - Math.round(beat * 4))
    if (off < 0.18) onGrid++
    const frac = beat - Math.floor(beat)
    const db = x.duration / spb
    if (frac > 0.2 && frac < 0.8 && db >= 0.9) sync++
    const l = durLabel(db)
    durMap.set(l, (durMap.get(l) ?? 0) + 1)
  })
  const variety = durMap.size
  const varietyScore = variety === 0 ? 0 : variety <= 1 ? 0.5 : variety <= 4 ? 1 : 0.7
  const totalBars = Math.max(1, Math.ceil(durationSec / spb / beatsPerBar))
  let downbeatHits = 0
  for (let b = 0; b < totalBars; b++) {
    const t = b * beatsPerBar * spb
    if (ns.some((x) => Math.abs(x.startTime - t) < spb * 0.12)) downbeatHits++
  }
  const rhythmClarity = clamp(((onGrid / n) * 0.45 + (downbeatHits / totalBars) * 0.35 + varietyScore * 0.2) * 10, 0, 10)

  // --- モチーフ反復度: 4音 n-gram (度数差 + 音価) の重複率 ---
  const grams = new Map<string, number>()
  for (let i = 0; i + 3 < n; i++) {
    const g = [1, 2, 3].map((k) => `${midis[i + k] - midis[i + k - 1]}/${Math.round((ns[i + k].startTime - ns[i + k - 1].startTime) / spb * 4)}`).join(',')
    grams.set(g, (grams.get(g) ?? 0) + 1)
  }
  let repeated = 0, totalG = 0
  grams.forEach((c) => {
    totalG += c
    if (c > 1) repeated += c
  })
  const motifRepetition = totalG ? repeated / totalG : 0

  // --- 音素材利用率: スケール音のうち実際に使われた割合 ---
  const usedPcs = new Set(midis.filter((m) => inScale(m, key, scale)).map((m) => ((m - key) % 12 + 12) % 12))
  const scaleSize = { major: 7, minor: 7, harmonicMinor: 7, dorian: 7, lydian: 7, pentatonic: 5, minorPentatonic: 5, blues: 6 }[scale]
  const materialUsage = usedPcs.size / scaleSize

  const lowest = Math.min(...midis)
  const highest = Math.max(...midis)
  const order = ['16分', '8分', '付点8', '4分', '付点4', '2分', '全']
  const durationHist = order.map((label) => ({ label, count: durMap.get(label) ?? 0 }))

  // --- 性格判定 (学習者向けの一言) ---
  let character = ''
  if (smoothness > 7 && harmony > 7) character = '歌いやすく穏やかなメロディ'
  else if (leapRatio > 0.35) character = '跳躍の多いドラマチックなメロディ'
  else if (motifRepetition > 0.35) character = 'モチーフが印象に残るキャッチーな構成'
  else if (rhythmClarity < 5) character = 'リズムが揺らぐ自由な即興風'
  else if (harmony < 5) character = 'スケール外の音を含む実験的なメロディ'
  else character = 'バランスの取れたメロディ'

  return {
    noteCount: n, durationSec, harmony, smoothness, rhythmClarity, motifRepetition, materialUsage,
    inScaleRatio, consonance, stepRatio, leapRatio, avgInterval, maxLeap, rangeSemis: highest - lowest,
    lowest, highest, density: n / Math.max(0.001, durationSec), syncopation: sync / n, pitchClassHist,
    intervalHist, durationHist, contour: { up, down, same }, character,
  }
}
