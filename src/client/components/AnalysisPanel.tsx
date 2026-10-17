// 右パネル: Algorithm Status / 楽典分析 (ゲージ・インフォグラフィック) / モチーフ / 楽式 / シーケンス情報
import { memo } from 'react'
import type { Analysis, ComposeResult, Note } from '../../lib/types'
import { NOTE_NAMES, SCALES } from '../../lib/theory'
import { AnimatedNumber, Card, Chip, Gauge, KineticText, SectionTitle } from './ui'
import type { State } from '../state'

const TRANSFORM_JA: Record<string, string> = {
  statement: '提示', repeat: '反復', sequence: '反復進行', inversion: '反行', retrograde: '逆行',
  variation: '変奏', fragment: '断片化', free: '自由展開', cadence: '終止',
}

function Row({ k, v, hl, delay = 0 }: { k: string; v: React.ReactNode; hl?: 'mint' | 'cy' | 'mag'; delay?: number }) {
  const c = hl === 'mint' ? 'text-emerald-300' : hl === 'cy' ? 'text-cyan-300' : hl === 'mag' ? 'text-fuchsia-300' : 'text-white'
  return (
    <div className="fade-up flex items-center justify-between border-b border-white/[0.05] py-1.5 last:border-0" style={{ ['--d' as any]: `${delay}ms` }}>
      <span className="text-[11px] text-violet-200/65">{k}</span>
      <span className={`font-mono text-[11.5px] font-semibold ${c}`}>{v}</span>
    </div>
  )
}

/** 12音のピッチクラス・ホイール */
function PitchWheel({ hist, keyRoot, steps }: { hist: number[]; keyRoot: number; steps: number[] }) {
  const max = Math.max(1, ...hist)
  const R = 46, C = 60
  return (
    <svg viewBox="0 0 120 120" className="h-[118px] w-[118px]">
      <circle cx={C} cy={C} r={R + 6} fill="none" stroke="rgba(255,255,255,.05)" />
      {hist.map((v, i) => {
        const a = ((i * 30 - 90) * Math.PI) / 180
        const inS = steps.includes(((i - keyRoot) % 12 + 12) % 12)
        const len = 8 + (v / max) * (R - 12)
        const x1 = C + Math.cos(a) * 10, y1 = C + Math.sin(a) * 10
        const x2 = C + Math.cos(a) * (10 + len), y2 = C + Math.sin(a) * (10 + len)
        const lx = C + Math.cos(a) * (R + 8), ly = C + Math.sin(a) * (R + 8)
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={inS ? (i === keyRoot ? '#ff4fd8' : '#39e6ff') : 'rgba(255,255,255,.18)'} strokeWidth={7} strokeLinecap="round" opacity={v ? 0.95 : 0.25} style={{ transition: 'all .8s cubic-bezier(.2,1.3,.4,1)' }} />
            <text x={lx} y={ly + 2.5} fontSize={6.5} textAnchor="middle" fill={inS ? '#efe4ff' : 'rgba(255,255,255,.3)'} fontWeight={800}>{NOTE_NAMES[i]}</text>
          </g>
        )
      })}
      <circle cx={C} cy={C} r={8} fill="url(#wheelC)" />
      <defs><radialGradient id="wheelC"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#b23cff" /></radialGradient></defs>
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
  const W = 200, H = 44
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-11 w-full">
      {m.notes.map((n, i) => {
        const x = (n.rel / L) * W
        const w = Math.max(5, (n.dur / L) * W - 2)
        const y = hi === lo ? H / 2 - 4 : ((hi - n.degree) / (hi - lo)) * (H - 10)
        return <rect key={i} className="note-pop" style={{ ['--d' as any]: `${i * 70}ms` }} x={x} y={y} width={w} height={8} rx={3} fill="url(#gMot)" />
      })}
      <defs><linearGradient id="gMot" x1="0" x2="1"><stop offset="0" stopColor="#ffd166" /><stop offset="1" stopColor="#ff4fd8" /></linearGradient></defs>
    </svg>
  )
}

function AnalysisPanelImpl({ state, analysis, result }: { state: State; analysis: Analysis | null; result: ComposeResult | null }) {
  const a = analysis
  const p = state.params
  const userN = state.sequence.filter((n: Note) => n.source !== 'ai').length
  const aiN = state.sequence.length - userN
  const statusText =
    state.status === 'composing' ? '中点変位を計算中…' :
    result ? `${result.notes.length}音符 生成済み` :
    state.status === 'recording' ? '録音中…' : '待機中'

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4" delay={80}>
        <SectionTitle icon="🛰" title="Algorithm Status" />
        <div className="flex items-center gap-3">
          <div className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${result ? 'bg-emerald-400/15 text-emerald-300' : 'bg-violet-400/10 text-violet-200'}`}>
            {state.status === 'composing' ? <span className="spin-slow text-xl">🌀</span> : result ? <span className="pop-in text-xl">✅</span> : <span className="text-xl">💤</span>}
            {result && <span className="pulse-dot absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-300 text-emerald-300" />}
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-extrabold text-white"><KineticText key={statusText} text={statusText} /></p>
            <p className="truncate text-[10.5px] text-violet-200/55">
              {result ? `${result.engine === 'server' ? 'Edge API' : 'Local'} · ${result.elapsedMs}ms · seed ${p.seed}` : 'パラメータを調整して生成しよう'}
            </p>
          </div>
        </div>
        {/* YOU / AI 比率バー */}
        <div className="mt-3">
          <div className="flex justify-between text-[9.5px] font-bold"><span className="text-fuchsia-300">YOU {userN}</span><span className="text-cyan-300">AI {aiN}</span></div>
          <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-white/5">
            <div className="h-full bg-gradient-to-r from-fuchsia-500 to-violet-500 transition-all duration-700" style={{ width: `${(userN / Math.max(1, userN + aiN)) * 100}%` }} />
            <div className="h-full bg-gradient-to-r from-violet-500 to-cyan-300 transition-all duration-700" style={{ width: `${(aiN / Math.max(1, userN + aiN)) * 100}%` }} />
          </div>
        </div>
      </Card>

      <Card className="p-4" delay={140}>
        <SectionTitle icon="📊" title="楽典分析" en="Analysis" />
        {a && a.noteCount > 0 && <div className="-mt-1 mb-3"><Chip tone="sun"><span key={a.character} className="kt-swap inline-block">💡 {a.character}</span></Chip></div>}
        <div className="grid grid-cols-3 gap-1">
          <Gauge value={a?.harmony ?? 0} label="ハーモニー" color="#39e6ff" sub="調和" />
          <Gauge value={a?.smoothness ?? 0} label="滑らかさ" color="#5effc4" sub="順次進行" />
          <Gauge value={a?.rhythmClarity ?? 0} label="リズム明瞭" color="#ffd166" sub="グリッド" />
        </div>
        <div className="mt-3">
          <Row k="スケール適合率" v={<AnimatedNumber value={(a?.inScaleRatio ?? 0) * 100} suffix="%" />} hl={(a?.inScaleRatio ?? 0) > 0.95 ? 'mint' : undefined} delay={40} />
          <Row k="音素材利用率" v={<AnimatedNumber value={(a?.materialUsage ?? 0) * 100} suffix="%" />} hl={(a?.materialUsage ?? 0) >= 0.99 ? 'mint' : 'cy'} delay={80} />
          <Row k="モチーフ反復度" v={<AnimatedNumber value={(a?.motifRepetition ?? 0) * 100} suffix="%" />} hl="mag" delay={120} />
          <Row k="協和度" v={<AnimatedNumber value={(a?.consonance ?? 0) * 100} suffix="%" />} delay={160} />
          <Row k="平均音程 / 最大跳躍" v={<><AnimatedNumber value={a?.avgInterval ?? 0} decimals={1} /> / {a?.maxLeap ?? 0}半音</>} delay={200} />
          <Row k="シンコペーション" v={<AnimatedNumber value={(a?.syncopation ?? 0) * 100} suffix="%" />} delay={240} />
        </div>
        {/* 輪郭 (上行/下行/同音) */}
        {a && a.noteCount > 1 && (
          <div className="mt-2">
            <p className="mb-1 text-[9.5px] font-bold text-violet-200/55">メロディ輪郭</p>
            <div className="flex h-5 overflow-hidden rounded-full text-[9px] font-black">
              {[
                { k: '↗ 上行', v: a.contour.up, c: 'from-fuchsia-500 to-pink-400' },
                { k: '↘ 下行', v: a.contour.down, c: 'from-violet-500 to-indigo-400' },
                { k: '→', v: a.contour.same, c: 'from-cyan-500 to-teal-400' },
              ].map((s, i) => (
                <div key={s.k} className={`barx-grow flex items-center justify-center bg-gradient-to-r ${s.c}`} style={{ width: `${(s.v / (a.noteCount - 1)) * 100}%`, ['--d' as any]: `${i * 120}ms` }}>
                  {s.v / (a.noteCount - 1) > 0.14 ? s.k : ''}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4" delay={200}>
        <SectionTitle icon="🧬" title="モチーフ & 楽式" en="Motif" />
        {result?.motif ? (
          <>
            <div className="flex items-center gap-2">
              <Chip tone={result.motif.origin === 'detected' ? 'mint' : result.motif.origin === 'created' ? 'mag' : 'cy'}>
                {result.motif.origin === 'detected' ? `🔍 反復を検出 ×${result.motif.occurrences}` : result.motif.origin === 'created' ? '🪄 新規作成' : '📌 冒頭フレーズ採用'}
              </Chip>
              <span className="font-mono text-[11px] tracking-widest text-amber-200">{result.motif.signature}</span>
            </div>
            <div className="neu-inset mt-2 rounded-xl px-2 py-1"><MotifGlyph result={result} /></div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.form.map((f, i) => (
                <div key={i} className="pop-in flex flex-col items-center rounded-xl bg-white/[0.04] px-2 py-1" style={{ animationDelay: `${i * 70}ms` }}>
                  <span className={`font-display text-[13px] font-black ${f.transform === 'free' || f.transform === 'cadence' ? 'text-amber-200' : 'text-cyan-200'}`}>{f.label}</span>
                  <span className="text-[8.5px] text-violet-200/60">{TRANSFORM_JA[f.transform]}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11px] leading-relaxed text-violet-200/55">「続きを作曲」を押すと、あなたのメロディから繰り返し音型（モチーフ）を探し、反復・反復進行・反行・変奏で人間らしく展開します。</p>
        )}
      </Card>

      <Card className="p-4" delay={260}>
        <SectionTitle icon="🎯" title="シーケンス情報" en="Sequence" />
        <div className="flex items-center gap-3">
          <PitchWheel hist={a?.pitchClassHist ?? new Array(12).fill(0)} keyRoot={p.key} steps={SCALES[p.scale].steps} />
          <div className="flex-1">
            <Row k="総音符数" v={<AnimatedNumber value={a?.noteCount ?? 0} />} hl="cy" />
            <Row k="演奏時間" v={<AnimatedNumber value={a?.durationSec ?? 0} decimals={1} suffix="s" />} />
            <Row k="音域" v={`${a?.rangeSemis ?? 0}半音`} />
            <Row k="密度" v={<AnimatedNumber value={a?.density ?? 0} decimals={2} suffix="/s" />} />
          </div>
        </div>
        {/* 音程ヒストグラム */}
        <p className="mb-1 mt-2 text-[9.5px] font-bold text-violet-200/55">音程の分布 (半音)</p>
        <div className="flex h-12 items-end gap-[3px]">
          {(a?.intervalHist ?? new Array(13).fill(0)).map((v, i, arr) => {
            const mx = Math.max(1, ...arr)
            return (
              <div key={`${state.generation}-${i}`} className="flex flex-1 flex-col items-center">
                <div className="bar-grow w-full rounded-t-[3px]" style={{ height: `${(v / mx) * 40 + 2}px`, background: i <= 2 ? 'linear-gradient(#5effc4,#39b8ff)' : i <= 4 ? 'linear-gradient(#39e6ff,#7a5cff)' : 'linear-gradient(#ff4fd8,#9b3dff)', ['--d' as any]: `${i * 40}ms` }} />
                <span className="mt-0.5 font-mono text-[7.5px] text-violet-200/45">{i}</span>
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip tone="mint">順次 {Math.round((a?.stepRatio ?? 0) * 100)}%</Chip>
          <Chip tone="mag">跳躍 {Math.round((a?.leapRatio ?? 0) * 100)}%</Chip>
          <Chip tone="cy">{NOTE_NAMES[p.key]} {SCALES[p.scale].label}</Chip>
        </div>
      </Card>
    </div>
  )
}
export const AnalysisPanel = memo(AnalysisPanelImpl)
