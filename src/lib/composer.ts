// ============================================================
// lib/composer.ts — 作曲オーケストレーター
//  ユーザーのシーケンス → (モチーフ判断/作成) → 楽式プラン → 中点変位(マクロ/ミクロ)
//  → リズム付与 → スケール量子化 → 人間らしい揺らぎ → Note[]
// ============================================================
import type { ComposeParams, ComposeRequest, ComposeResult, Motif, MPDPoint, Note, PhrasePlan, PhraseTransform } from './types'
import { TIME_SIGS, createRng, degreeIndex, quantizeToScale, scaleNotes, clamp, uid, type Rng } from './theory'
import { midpointDisplace, macroSkeleton, sampleCurve } from './midpoint-displace'
import { generatePhraseRhythm, humanize, snapBeat, accentAt } from './rhythm-generator'
import { createMotif, detectMotif, transformMotif, type BeatNote } from './motif'

/** 楽式テンプレート: 人間らしい「繰り返し + 対比 + 回帰」 */
function planForm(phraseCount: number, motifStrength: number, rng: Rng): { label: string; transform: PhraseTransform }[] {
  const strong: { label: string; transform: PhraseTransform }[][] = [
    [
      { label: 'A', transform: 'repeat' },
      { label: "A'", transform: 'variation' },
      { label: 'B', transform: 'sequence' },
      { label: "A''", transform: 'repeat' },
    ],
    [
      { label: 'A', transform: 'repeat' },
      { label: 'A→', transform: 'sequence' },
      { label: 'B', transform: 'free' },
      { label: "A'", transform: 'variation' },
    ],
    [
      { label: 'A', transform: 'repeat' },
      { label: 'Ā', transform: 'inversion' },
      { label: 'a·a', transform: 'fragment' },
      { label: "A'", transform: 'variation' },
    ],
  ]
  const tpl = rng.pick(strong)
  const out: { label: string; transform: PhraseTransform }[] = []
  for (let i = 0; i < phraseCount; i++) {
    const base = tpl[i % tpl.length]
    // motifStrength が低いほど自由フレーズ (純粋な中点変位) が増える
    if (base.transform !== 'repeat' && !rng.chance(0.25 + motifStrength * 0.75)) {
      out.push({ label: base.label.replace(/[A-Za-zĀ·→']+/, 'C'), transform: 'free' })
    } else if (base.transform === 'repeat' && !rng.chance(0.15 + motifStrength * 0.85)) {
      out.push({ label: 'C', transform: 'free' })
    } else {
      out.push({ ...base })
    }
    // 大きな周期ごとにラベルへプライム記号を付けて繰り返し感を表す
    if (i >= tpl.length) out[i].label = out[i].label + '²'
  }
  if (out.length) out[out.length - 1] = { label: out[out.length - 1].label.startsWith('C') ? 'End' : out[out.length - 1].label, transform: out[out.length - 1].transform === 'free' ? 'cadence' : out[out.length - 1].transform }
  return out
}

export function compose(req: ComposeRequest, engine: 'server' | 'client' = 'server'): ComposeResult {
  const t0 = Date.now()
  const p: ComposeParams = req.params
  const rng = createRng(p.seed)
  const { beatsPerBar } = TIME_SIGS[p.timeSig]
  const spb = 60 / p.bpm // seconds per beat
  const pool = scaleNotes(p.key, p.scale)

  // ---- 1. ユーザーシーケンスを拍単位に ----
  const userNotes: BeatNote[] =
    req.mode === 'continue'
      ? [...req.sequence]
          .sort((a, b) => a.startTime - b.startTime)
          .map((n) => ({ beat: n.startTime / spb, dur: n.duration / spb, midi: n.midiNoteNumber, vel: n.velocity }))
      : []

  const hasInput = userNotes.length >= 2
  const lastUser = userNotes[userNotes.length - 1]
  const inputEnd = hasInput ? Math.max(...userNotes.map((n) => n.beat + n.dur)) : 0
  // 続きは次の小節頭から (中途半端な位置で終わっていれば次の拍から埋める)
  const startBeat = hasInput ? Math.ceil((inputEnd - 0.01) / beatsPerBar) * beatsPerBar : 0

  // 音域: ユーザー入力の平均を中心に
  const userCenter = hasInput ? userNotes.reduce((s, n) => s + n.midi, 0) / userNotes.length : p.centerNote
  const center = clamp(Math.round(userCenter), 36, 96)
  const lo = clamp(center - p.range / 2, 21, 108)
  const hi = clamp(center + p.range / 2, 21, 108)
  const rangePool = pool.filter((m) => m >= lo && m <= hi)
  const usePool = rangePool.length >= 3 ? rangePool : pool.filter((m) => m >= center - 7 && m <= center + 7)

  // ---- 2. モチーフ判断 / 作成 ----
  let motif: Motif | null = hasInput ? detectMotif(userNotes, pool, beatsPerBar) : null
  if (!motif || motif.notes.length < 2) {
    motif = createMotif({
      pool,
      center,
      timeSig: p.timeSig,
      beatsPerBar,
      density: p.density,
      displacement: p.displacement,
      rng,
    })
  }

  // ---- 3. フレーズ構成 ----
  const motifBars = clamp(Math.ceil(motif.lengthBeats / beatsPerBar), 1, 2)
  const phraseBars = motifBars === 1 ? 2 : 2
  const phraseCount = Math.max(1, Math.round(p.bars / phraseBars))
  const formTpl = planForm(phraseCount, p.motifStrength, rng)

  // ---- 4. マクロ中点変位: 各フレーズの中心音 (大きな山と谷) ----
  const tonicNear = quantizeToScale(center, pool.filter((m) => ((m - p.key) % 12 + 12) % 12 === 0))
  const macroStart = hasInput ? lastUser.midi : quantizeToScale(center + rng.range(-3, 3), usePool)
  const macro = macroSkeleton(phraseCount, {
    start: macroStart,
    end: tonicNear,
    displacement: p.range * 0.45 * (0.3 + p.displacement),
    roughness: p.roughness,
    min: lo + 2,
    max: hi - 2,
    rng,
    center,
    gravity: 0.25,
  })

  const form: PhrasePlan[] = formTpl.map((f, i) => ({
    label: f.label,
    transform: f.transform,
    startBeat: startBeat + i * phraseBars * beatsPerBar,
    lengthBeats: phraseBars * beatsPerBar,
    center: macro[i].value,
  }))

  // ---- 5. 各フレーズの生成 ----
  const outBeats: { beat: number; dur: number; midi: number; accent: number; phrasePos: number; tag: string }[] = []
  const trace: MPDPoint[] = []
  let prevMidi = hasInput ? lastUser.midi : macroStart

  form.forEach((ph, pi) => {
    const isLast = pi === form.length - 1
    const nextCenter = macro[pi + 1]?.value ?? tonicNear
    // ミクロ中点変位: フレーズ内の滑らかな輪郭
    const micro = midpointDisplace({
      start: prevMidi,
      end: isLast ? tonicNear : (ph.center + nextCenter) / 2,
      depth: p.depth,
      displacement: p.range * 0.55 * p.displacement + 1,
      roughness: p.roughness,
      min: lo,
      max: hi,
      rng,
      center: ph.center,
      gravity: 0.2,
    })
    micro.values.forEach((v, i) => {
      trace.push({ beat: ph.startBeat + (i / (micro.values.length - 1)) * ph.lengthBeats, value: v, level: micro.levels[i] })
    })

    let events: { rel: number; dur: number; degree?: number; accent: number }[]
    const motifish = ph.transform !== 'free' && ph.transform !== 'cadence'
    if (motifish && motif) {
      // モチーフ由来: リズムもモチーフから (人間らしい反復)
      const mnotes = transformMotif(motif, ph.transform, rng, p.motifStrength)
      const mlen = Math.max(motif.lengthBeats, Math.max(...mnotes.map((n) => n.rel + n.dur)))
      events = []
      // フレーズ前半 = モチーフ, 後半 = モチーフ(変化) or 応答
      const reps = Math.max(1, Math.floor(ph.lengthBeats / Math.max(1, mlen)))
      for (let r = 0; r < reps; r++) {
        const off = r * mlen
        const shift = r === 0 ? 0 : ph.transform === 'sequence' ? r * rng.pick([1, -1, 2]) : r === reps - 1 && rng.chance(0.6 - p.motifStrength * 0.35) ? rng.pick([-1, 1]) : 0
        mnotes.forEach((n, k) => {
          if (off + n.rel >= ph.lengthBeats - 1e-6) return
          // 最終反復の末尾は応答として変形させる (問いと答え)
          const answer = r === reps - 1 && reps > 1 && k >= mnotes.length - 2 && rng.chance(0.75 - p.motifStrength * 0.45)
          events.push({
            rel: off + n.rel,
            dur: Math.min(n.dur, ph.lengthBeats - (off + n.rel)),
            degree: n.degree + shift + (answer ? rng.pick([-1, -2, 1]) : 0),
            accent: accentAt(off + n.rel, p.timeSig),
          })
        })
      }
      // 余った拍は中点変位カーブで埋める
      const used = reps * mlen
      if (used < ph.lengthBeats - 0.5) {
        const fill = generatePhraseRhythm({ bars: 1, timeSig: p.timeSig, density: p.density, depth: p.depth, repeatProb: 0, rng })
        fill.forEach((e) => {
          if (used + e.rel < ph.lengthBeats - 1e-6) events.push({ rel: used + e.rel, dur: Math.min(e.dur, ph.lengthBeats - used - e.rel), accent: e.accent })
        })
      }
    } else {
      events = generatePhraseRhythm({
        bars: phraseBars,
        timeSig: p.timeSig,
        density: p.density,
        depth: p.depth,
        repeatProb: 0.05 + p.motifStrength * 0.6,
        rng,
        cadence: isLast,
      })
    }

    // 音高決定
    let anchorIdx = degreeIndex(quantizeToScale(ph.center, usePool), pool)
    // モチーフ全体が音域に収まるようアンカーを平行移動 (音型の輪郭を壊さない)
    const degs = events.filter((e) => e.degree !== undefined).map((e) => e.degree as number)
    if (degs.length) {
      const maxD = Math.max(...degs), minD = Math.min(...degs)
      for (let guard = 0; guard < 14 && pool[clamp(anchorIdx + maxD, 0, pool.length - 1)] > hi; guard++) anchorIdx--
      for (let guard = 0; guard < 14 && pool[clamp(anchorIdx + minD, 0, pool.length - 1)] < lo; guard++) anchorIdx++
    }
    events.forEach((e, ei) => {
      const t = e.rel / ph.lengthBeats
      const curveV = sampleCurve(micro.values, t)
      let midi: number
      if (e.degree !== undefined) {
        // モチーフ音型は音階度数を厳密に保持 (= 聴いて分かる反復)。
        // 変奏フレーズのみ中点変位カーブを少し混ぜて「揺らぎ」を与える
        const motifMidi = pool[clamp(anchorIdx + e.degree, 0, pool.length - 1)]
        const blend = ph.transform === 'variation' ? 0.1 + p.displacement * 0.3 : 0
        midi = blend ? quantizeToScale(motifMidi * (1 - blend) + curveV * blend, pool) : motifMidi
      } else {
        midi = quantizeToScale(curveV, pool)
      }
      // 音域内へ折り返し (自由音のみ。モチーフ音はアンカー調整済みなので輪郭を保持)
      if (e.degree === undefined) {
        while (midi > hi) midi -= 12
        while (midi < lo) midi += 12
        midi = quantizeToScale(midi, usePool)
      }
      // 同音連打の抑制: 自由音は直前2音と同じなら、カーブの傾き方向へ1音階ずらす
      const recent = outBeats.slice(-2).map((o) => o.midi)
      if (e.degree === undefined && recent.length === 2 && recent.every((r) => r === midi)) {
        const slope = sampleCurve(micro.values, Math.min(1, t + 0.05)) - sampleCurve(micro.values, Math.max(0, t - 0.05))
        const dir = slope === 0 ? (rng.chance(0.5) ? 1 : -1) : Math.sign(slope)
        const di = degreeIndex(midi, usePool)
        midi = usePool[clamp(di + dir, 0, usePool.length - 1)]
        if (midi === recent[1]) midi = usePool[clamp(di - dir, 0, usePool.length - 1)]
      }
      // オクターブを超える跳躍は折りたたむ (歌いやすさ)
      if (e.degree === undefined && Math.abs(midi - prevMidi) > 12) midi = quantizeToScale(midi + (midi > prevMidi ? -12 : 12), usePool)
      // 強拍は主和音の構成音に寄せる (ハーモニー強化)
      if (e.degree === undefined && e.accent >= 0.99 && rng.chance(0.55)) {
        const chordPcs = [0, ['minor', 'harmonicMinor', 'dorian', 'minorPentatonic', 'blues'].includes(p.scale) ? 3 : 4, 7]
        const cands = usePool.filter((m) => chordPcs.includes(((m - p.key) % 12 + 12) % 12))
        if (cands.length) midi = quantizeToScale(midi, cands)
      }
      // 最終音はトニック
      if (isLast && ei === events.length - 1) midi = quantizeToScale(midi, usePool.filter((m) => ((m - p.key) % 12 + 12) % 12 === 0)) || midi
      outBeats.push({
        beat: ph.startBeat + snapBeat(e.rel),
        dur: Math.max(0.25, snapBeat(e.dur)),
        midi,
        accent: e.accent,
        phrasePos: t,
        tag: ph.label + (e.degree !== undefined ? '•' : ''),
      })
      prevMidi = midi
    })
  })

  // ---- 6. 重なり除去 + Humanize → 秒単位 Note ----
  outBeats.sort((a, b) => a.beat - b.beat)
  for (let i = 0; i < outBeats.length - 1; i++) {
    const gap = outBeats[i + 1].beat - outBeats[i].beat
    if (gap <= 1e-6) {
      outBeats.splice(i + 1, 1)
      i--
      continue
    }
    if (outBeats[i].dur > gap) outBeats[i].dur = gap
  }
  const notes: Note[] = outBeats.map((e) => {
    const h = humanize({ start: e.beat, dur: e.dur, accent: e.accent, phrasePos: e.phrasePos }, p.humanize, spb, rng)
    return {
      id: uid('ai'),
      midiNoteNumber: clamp(e.midi, 0, 127),
      startTime: +h.startSec.toFixed(4),
      duration: +h.durSec.toFixed(4),
      velocity: +h.velocity.toFixed(3),
      source: 'ai',
      tag: e.tag,
    }
  })

  return {
    notes,
    motif,
    form,
    macro: macro.map((m, i) => ({ index: i, value: m.value, level: m.level })),
    trace,
    startBeat,
    elapsedMs: Date.now() - t0,
    engine,
  }
}
