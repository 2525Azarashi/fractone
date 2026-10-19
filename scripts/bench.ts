// 作曲アルゴリズムのベンチマーク: 反復度パラメータに対する分析値の応答を測る
//   npx esbuild scripts/bench.ts --bundle --platform=node --outfile=/tmp/bench.cjs && node /tmp/bench.cjs
import { compose } from '../src/lib/composer'
import { analyze } from '../src/lib/analysis'
import { DEFAULT_PARAMS, demoSequence } from '../src/client/state'

const SEEDS = 40
const rows: string[] = []
for (const mode of ['continue', 'new'] as const) {
  for (const ms of [0, 0.25, 0.5, 0.7, 1]) {
    let rep = 0, harm = 0, smooth = 0, rhy = 0, n = 0, motifPh = 0
    for (let s = 1; s <= SEEDS; s++) {
      const params = { ...DEFAULT_PARAMS, motifStrength: ms, seed: s * 7919 }
      const seq = mode === 'continue' ? demoSequence(params.bpm) : []
      const r = compose({ mode, sequence: seq, params })
      const a = analyze(r.notes, params.key, params.scale, params.bpm, params.timeSig)
      rep += a.motifRepetition; harm += a.harmony; smooth += a.smoothness; rhy += a.rhythmClarity; n += r.notes.length
      motifPh += r.form.filter((f) => f.transform !== 'free' && f.transform !== 'cadence').length / r.form.length
    }
    const k = SEEDS
    rows.push(`${mode.padEnd(8)} ms=${ms.toFixed(2)}  rep=${(rep / k * 100).toFixed(0).padStart(3)}%  motifPhrases=${(motifPh / k * 100).toFixed(0).padStart(3)}%  harm=${(harm / k).toFixed(1)}  smooth=${(smooth / k).toFixed(1)}  rhythm=${(rhy / k).toFixed(1)}  notes=${(n / k).toFixed(0)}`)
  }
}
console.log(rows.join('\n'))
