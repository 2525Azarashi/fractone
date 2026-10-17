// 右パネル: Algorithm Status / 楽典分析 (インフォグラフィック) / モチーフ & 楽式 / シーケンス情報
import { memo } from 'react'
import type { Analysis, ComposeResult, Note } from '../../lib/types'
import { NOTE_NAMES, SCALES } from '../../lib/theory'
import { AnimatedNumber, Card, Gauge, KineticText, SectionTitle } from './ui'
import type { State } from '../state'

const TRANSFORM_JA: Record<string, string> = {
  statement: '提示', repeat: '反復', sequence: '反復進行', inversion: '反行', retrograde: '逆行',
  variation: '変奏', fragment: '断片化', free: '自由展開', cadence: '終止',
}

function Row({ k, v, hl, delay = 0 }: { k: string; v: React.ReactNode; hl?: 'mint' | 'cy' | 'mag'; delay?: number }) {
  const c = hl === 'mint' ? 'text-emerald-300' : hl === 'cy' ? 'text-cyan-300' : hl === 'mag' ? 'text-fuchsia-300' : 'text-white'
  return (
    <div className="fade-up flex items-center justify-between border-b border-[var(--line)] py-2 last:border-0" style={{ ['--d' as any]: `${delay}ms` }}>
      <span className="text-[11.5px] text-[var(--tx-2)]">{k}</span>
      <span className={`num text-[12px] font-medium ${c}`}>{v}</span>
    </div>
  )
}

/** 12音のピッチクラス・ホイール */
function PitchWheel({ hist, keyRoot, steps }: { hist: number[]; keyRoot: number; steps: number[] }) {
  const max = Math.max(1, ...hist)
  const R = 44, C = 60
  return (
    <svg viewBox="0 0 120 120" className="h-[112px] w-[112px] shrink-0">
      <circle cx={C} cy={C} r={R + 4} fill="none" stroke="rgba(255,255,255,.06)" strokeDasharray="1 3" />
      <circle cx={C} cy={C} r={10} fill="none" stroke="rgba(255,255,255,.08)" />
      {hist.map((v, i) => {
        const a = ((i * 30 - 90) * Math.PI) / 180
        const inS = steps.includes(((i - keyRoot) % 12 + 12) % 12)
        const len = 2 + (v / max) * (R - 14)
        const x1 = C + Math.cos(a) * 13, y1 = C + Math.sin(a) * 13
        const x2 = C + Math.cos(a) * (13 + len), y2 = C + Math.sin(a) * (13 + len)
        const lx = C + Math.cos(a) * (R + 10), ly = C + Math.sin(a) * (R + 10)
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={i === keyRoot ? '#ff5bd6' : inS ? '#4fe3ff' : 'rgba(255,255,255,.2)'} strokeWidth={4} strokeLinecap="round" opacity={v ? 1 : 0.25} style={{ transition: 'all .9s var(--ease)' }} />
            <text x={lx} y={ly + 2.5} fontSize={6.5} textAnchor="middle" fill={inS ? 'rgba(236,232,245,.75)' : 'rgba(236,232,245,.25)'} fontFamily="JetBrains Mono">{NOTE_NAMES[i]}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** モチーフのミニ・ピアノロール */
function MotifGlyph({ result }: { result: ComposeResult }) {
  const m = result.motif
  if (!m) return null
  const degs = m.notes.map((n) => n.degree)
  const lo = Math.min(...degs), hi = Math.max(...degs)
  const L = Math.max(m.lengthBeats, ...m.notes.map((n) => n.rel + n.dur))
  const W = 220, H = 46
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-[46px] w-full">
      {Array.from({ length: Math.ceil(L) + 1 }).map((_, b) => <line key={b} x1={(b / L) * W} x2={(b / L) * W} y1={0} y2={H} stroke="rgba(255,255,255,.05)" />)}
      {m.notes.map((n, i) => {
        const x = (n.rel / L) * W
        const w = Math.max(5, (n.dur / L) * W - 2)
        const y = hi === lo ? H / 2 - 3 : 4 + ((hi - n.degree) / (hi - lo)) * (H - 14)
        return <rect key={i} className="note-pop" style={{ ['--d' as any]: `${i * 70}ms` }} x={x} y={y} width={w} height={6} rx={2} fill="url(#gMot)" />
      })}
      <defs><linearGradient id="gMot" x1="0" x2="1"><stop offset="0" stopColor="#ffcf7a" /><stop offset="1" stopColor="#ff5bd6" /></linearGradient></defs>
    </svg>
  )
}

function AnalysisPanelImpl({ state, analysis, result }: { state: State; analysis: Analysis | null; result: ComposeResult | null }) {
  const a = analysis
  const p = state.params
  const userN = state.sequence.filter((n: Note) => n.source !== 'ai').length
  const aiN = state.sequence.length - userN
  const total = Math.max(1, userN + aiN)
  const statusText =
    state.status === 'composing' ? '中点変位を計算中' :
    result ? `${result.notes.length} 音符を生成` :
    state.status === 'recording' ? '録音中' : '待機中'

  return (
    <div className="flex flex-col gap-3">
      {/* ---- Status ---- */}
      <Card className="p-5" delay={80}>
        <div className="flex items-center justify-between">
          <p className="eyebrow">Algorithm Status</p>
          <span className={`flex items-center gap-1.5 text-[10px] font-medium ${result ? 'text-emerald-300' : 'text-[var(--tx-3)]'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${result ? 'bg-emerald-300' : state.status === 'composing' ? 'bg-fuchsia-400 breathe' : 'bg-white/30'}`} />
            {result ? 'Success' : state.status === 'composing' ? 'Running' : 'Idle'}
          </span>
        </div>
        <p className="mt-2 font-display text-[22px] font-semibold leading-tight tracking-tight text-white">
          <KineticText key={statusText} text={statusText} />
        </p>
        <p className="num mt-1 truncate text-[10.5px] text-[var(--tx-3)]">
          {result ? `${result.engine === 'server' ? 'edge api' : 'local'} · ${result.elapsedMs}ms · seed ${p.seed}` : 'パラメータを調整して生成'}
        </p>
        <div className="mt-4">
          <div className="flex h-1 overflow-hidden rounded-full bg-white/5">
            <div className="h-full bg-[#ff5bd6] transition-all duration-700" style={{ width: `${(userN / total) * 100}%` }} />
            <div className="h-full bg-[#4fe3ff] transition-all duration-700" style={{ width: `${(aiN / total) * 100}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[10.5px]">
            <span className="flex items-center gap-1.5 text-[var(--tx-2)]"><i className="h-1.5 w-1.5 rounded-full bg-[#ff5bd6]" />You <b className="num font-medium text-white">{userN}</b></span>
            <span className="flex items-center gap-1.5 text-[var(--tx-2)]">AI <b className="num font-medium text-white">{aiN}</b><i className="h-1.5 w-1.5 rounded-full bg-[#4fe3ff]" /></span>
          </div>
        </div>
      </Card>

      {/* ---- Analysis ---- */}
      <Card className="p-5" delay={140}>
        <SectionTitle index="04" en="Analysis" title="楽典分析" />
        <div className="grid grid-cols-3">
          <Gauge value={a?.harmony ?? 0} label="ハーモニー" color="#4fe3ff" sub="Harmony" />
          <Gauge value={a?.smoothness ?? 0} label="滑らかさ" color="#7af0c4" sub="Smooth" />
          <Gauge value={a?.rhythmClarity ?? 0} label="リズム明瞭" color="#ffcf7a" sub="Rhythm" />
        </div>
        {a && a.noteCount > 0 && (
          <p className="mt-4 border-l-2 border-fuchsia-400/60 pl-3 text-[12px] leading-relaxed text-[var(--tx)]">
            <span key={a.character} className="kt-swap inline-block">{a.character}</span>
          </p>
        )}
        <div className="mt-3">
          <Row k="スケール適合率" v={<AnimatedNumber value={(a?.inScaleRatio ?? 0) * 100} suffix="%" />} hl={(a?.inScaleRatio ?? 0) > 0.95 ? 'mint' : undefined} delay={40} />
          <Row k="音素材利用率" v={<AnimatedNumber value={(a?.materialUsage ?? 0) * 100} suffix="%" />} hl={(a?.materialUsage ?? 0) >= 0.99 ? 'mint' : 'cy'} delay={80} />
          <Row k="モチーフ反復度" v={<AnimatedNumber value={(a?.motifRepetition ?? 0) * 100} suffix="%" />} hl="mag" delay={120} />
          <Row k="協和度" v={<AnimatedNumber value={(a?.consonance ?? 0) * 100} suffix="%" />} delay={160} />
          <Row k="平均音程 / 最大跳躍" v={<><AnimatedNumber value={a?.avgInterval ?? 0} decimals={1} /> / {a?.maxLeap ?? 0} st</>} delay={200} />
          <Row k="シンコペーション" v={<AnimatedNumber value={(a?.syncopation ?? 0) * 100} suffix="%" />} delay={240} />
        </div>
        {a && a.noteCount > 1 && (
          <div className="mt-3">
            <div className="mb-1.5 flex justify-between text-[10px] text-[var(--tx-3)]">
              <span>上行 {Math.round((a.contour.up / (a.noteCount - 1)) * 100)}%</span>
              <span>同音 {Math.round((a.contour.same / (a.noteCount - 1)) * 100)}%</span>
              <span>下行 {Math.round((a.contour.down / (a.noteCount - 1)) * 100)}%</span>
            </div>
            <div className="flex h-1 gap-0.5 overflow-hidden rounded-full">
              <div className="barx-grow bg-[#ff5bd6]" style={{ width: `${(a.contour.up / (a.noteCount - 1)) * 100}%` }} />
              <div className="barx-grow bg-white/30" style={{ width: `${(a.contour.same / (a.noteCount - 1)) * 100}%`, ['--d' as any]: '120ms' }} />
              <div className="barx-grow bg-[#8b5cff]" style={{ width: `${(a.contour.down / (a.noteCount - 1)) * 100}%`, ['--d' as any]: '240ms' }} />
            </div>
          </div>
        )}
      </Card>

      {/* ---- Motif ---- */}
      <Card className="p-5" delay={200}>
        <SectionTitle index="05" en="Motif & Form" title="モチーフと楽式" />
        {result?.motif ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] text-[var(--tx-2)]">
                {result.motif.origin === 'detected' ? `反復を検出 ×${result.motif.occurrences}` : result.motif.origin === 'created' ? '新しく作成' : '冒頭フレーズを採用'}
              </span>
              <span className="num text-[11px] tracking-[.25em] text-amber-200/90">{result.motif.signature}</span>
            </div>
            <div className="neu-inset mt-2 rounded-xl px-2.5 py-2"><MotifGlyph result={result} /></div>
            <div className="mt-3 grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)]">
              {result.form.map((f, i) => (
                <div key={i} className="pop-in flex flex-col items-center bg-[var(--s1)] py-2" style={{ animationDelay: `${i * 70}ms` }}>
                  <span className={`font-display text-[15px] font-semibold ${f.transform === 'free' || f.transform === 'cadence' ? 'text-amber-200' : 'text-cyan-200'}`}>{f.label}</span>
                  <span className="text-[9.5px] text-[var(--tx-3)]">{TRANSFORM_JA[f.transform]}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[12px] leading-relaxed text-[var(--tx-2)]">「続きを作曲」を押すと、メロディから繰り返し音型（モチーフ）を探し、反復・反復進行・反行・変奏で展開します。</p>
        )}
      </Card>

      {/* ---- Sequence ---- */}
      <Card className="p-5" delay={260}>
        <SectionTitle index="06" en="Sequence" title="シーケンス情報" />
        <div className="flex items-center gap-4">
          <PitchWheel hist={a?.pitchClassHist ?? new Array(12).fill(0)} keyRoot={p.key} steps={SCALES[p.scale].steps} />
          <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-3">
            {[
              { k: 'Notes', v: <AnimatedNumber value={a?.noteCount ?? 0} className="text-cyan-200" /> },
              { k: 'Length', v: <AnimatedNumber value={a?.durationSec ?? 0} decimals={1} suffix="s" /> },
              { k: 'Range', v: <span className="num">{a?.rangeSemis ?? 0}st</span> },
              { k: 'Density', v: <AnimatedNumber value={a?.density ?? 0} decimals={1} suffix="/s" /> },
            ].map((x) => (
              <div key={x.k}>
                <p className="eyebrow !text-[8.5px]">{x.k}</p>
                <p className="mt-0.5 font-display text-[18px] font-semibold leading-none text-white">{x.v}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="eyebrow mb-2 mt-5 !text-[8.5px]">Interval distribution</p>
        <div className="flex h-12 items-end gap-[3px]">
          {(a?.intervalHist ?? new Array(13).fill(0)).map((v, i, arr) => {
            const mx = Math.max(1, ...arr)
            return (
              <div key={`${state.generation}-${i}`} className="flex h-full flex-1 flex-col justify-end">
                <div className="bar-grow w-full rounded-[2px]" style={{ height: `${(v / mx) * 100}%`, minHeight: 2, background: i <= 2 ? '#7af0c4' : i <= 4 ? '#4fe3ff' : '#ff5bd6', opacity: v ? 0.9 : 0.15, ['--d' as any]: `${i * 40}ms` }} />
              </div>
            )
          })}
        </div>
        <div className="num mt-1 flex justify-between text-[8.5px] text-[var(--tx-3)]"><span>0</span><span>step</span><span>leap</span><span>12</span></div>
        <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-3 text-[11px]">
          <span className="text-[var(--tx-2)]">順次 <b className="num font-medium text-emerald-300">{Math.round((a?.stepRatio ?? 0) * 100)}%</b></span>
          <span className="text-[var(--tx-2)]">跳躍 <b className="num font-medium text-fuchsia-300">{Math.round((a?.leapRatio ?? 0) * 100)}%</b></span>
          <span className="num text-[var(--tx)]">{NOTE_NAMES[p.key]} {SCALES[p.scale].label}</span>
        </div>
      </Card>
    </div>
  )
}
export const AnalysisPanel = memo(AnalysisPanelImpl)
