// 右パネル: Algorithm Status / 楽典分析 (インフォグラフィック) / モチーフ & 楽式 / シーケンス情報
import { Skeleton } from './patterns'
import { memo, useRef } from 'react'
import { usePlayhead } from '../hooks/useTransport'
import type { Analysis, ComposeResult } from '../../lib/types'
import { NOTE_NAMES, SCALES } from '../../lib/theory'
import { AnimatedNumber, Card, SectionTitle } from './ui'
import { Radar } from './fx'
import type { State } from '../state'
import type { HarmonyResult } from '../../lib/chord-generator'
import { FUNC_COLOR, FUNC_JA } from './NowPlaying'

const TRANSFORM_JA: Record<string, string> = {
  statement: '提示', repeat: '反復', sequence: '反復進行', inversion: '反行', retrograde: '逆行',
  variation: '変奏', fragment: '断片化', free: '自由展開', cadence: '終止',
}

function Row({ k, v, hl, delay = 0, d }: { k: string; v: React.ReactNode; hl?: 'mint' | 'cy' | 'mag'; delay?: number; d?: React.ReactNode }) {
  const c = hl === 'mint' ? 'text-emerald-300' : hl === 'cy' ? 'text-cyan-300' : hl === 'mag' ? 'text-fuchsia-300' : 'text-white'
  return (
    <div className="fade-up flex items-center justify-between border-b border-[var(--line)] py-2 last:border-0" style={{ ['--d' as any]: `${delay}ms` }}>
      <span className="text-[11.5px] text-[var(--tx-2)]">{k}</span>
      <span className="flex items-center gap-2">{d}<span className={`num text-[12px] font-medium ${c}`}>{v}</span></span>
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

function FormTimeline({ result, bpm }: { result: ComposeResult; bpm: number }) {
  const f = result.form
  const svgRef = useRef<SVGSVGElement>(null)
  const headRef = useRef<SVGLineElement>(null)
  // 再生位置に連動して、いま鳴っているフレーズを点灯 (React 再レンダーなし)
  usePlayhead((t, playing) => {
    const beat = t / (60 / bpm)
    const svg = svgRef.current
    if (!svg || !f.length) return
    const x0 = f[0].startBeat, x1 = f[f.length - 1].startBeat + f[f.length - 1].lengthBeats
    svg.querySelectorAll<SVGRectElement>('[data-ph]').forEach((r, i) => {
      const on = playing && beat >= f[i].startBeat && beat < f[i].startBeat + f[i].lengthBeats
      r.style.opacity = !playing ? '0.85' : on ? '1' : '0.3'
      r.style.filter = on ? 'drop-shadow(0 0 6px currentColor)' : ''
    })
    const k = (beat - x0) / (x1 - x0)
    if (headRef.current) {
      headRef.current.style.opacity = playing && k >= 0 && k <= 1 ? '1' : '0'
      headRef.current.setAttribute('x1', String(k * 240))
      headRef.current.setAttribute('x2', String(k * 240))
    }
  })
  if (!f.length) return null
  const cs = f.map((x) => x.center)
  const lo = Math.min(...cs) - 1, hi = Math.max(...cs) + 1
  const W = 240, H = 54
  const x0 = f[0].startBeat, x1 = f[f.length - 1].startBeat + f[f.length - 1].lengthBeats
  const X = (b: number) => ((b - x0) / (x1 - x0)) * W
  const Y = (c: number) => 6 + ((hi - c) / (hi - lo)) * (H - 20)
  return (
    <div className="mt-3">
      <p className="mb-1 text-[10.5px] text-[var(--tx-3)]">フレーズごとの中心音</p>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block w-full overflow-visible">
        <line ref={headRef} y1={0} y2={H - 10} stroke="#fff" strokeWidth={1} style={{ opacity: 0 }} />
        <path d={'M' + f.map((x) => `${(X(x.startBeat) + X(x.startBeat + x.lengthBeats)) / 2},${Y(x.center)}`).join(' L')} fill="none" stroke="rgba(255,255,255,.35)" strokeDasharray="2 3" className="line-draw" style={{ ['--len' as any]: 400 }} />
        {f.map((x, i) => {
          const free = x.transform === 'free' || x.transform === 'cadence'
          return (
            <g key={i}>
              <rect data-ph className="form-block form-live" style={{ ['--d' as any]: `${i * 90}ms`, color: free ? '#ffcf7a' : '#4fe3ff' }} x={X(x.startBeat) + 1} y={Y(x.center) - 3} width={X(x.startBeat + x.lengthBeats) - X(x.startBeat) - 2} height={6} rx={2} fill={free ? '#ffcf7a' : '#4fe3ff'} opacity={0.85} />
              <text x={(X(x.startBeat) + X(x.startBeat + x.lengthBeats)) / 2} y={H - 1} textAnchor="middle" fontSize={8.5} fill="rgba(236,232,245,.6)" fontFamily="JetBrains Mono">{x.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function AnalysisPanelImpl({ state, analysis, prev, result, loading = false, harmony = null }: { state: State; analysis: Analysis | null; prev: Analysis | null; result: ComposeResult | null; loading?: boolean; harmony?: HarmonyResult | null }) {
  const a = analysis
  const pv = result ? prev : null
  const radarOf = (x: Analysis | null) =>
    x ? [x.harmony / 10, x.smoothness / 10, x.rhythmClarity / 10, Math.min(1, x.motifRepetition), Math.min(1, x.leapRatio * 2.5), Math.min(1, x.rangeSemis / 24)] : [0, 0, 0, 0, 0, 0]
  const p = state.params

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4" delay={0}>
        <SectionTitle title="音から読み取れること" />
        <p className="mb-3 text-xs leading-relaxed text-[var(--tx-2)]">入力・提案・採用済みのメロディ全体を、発音順に計算しています。伴奏の音符は含みません。曲の良し悪しを採点するものではありません。</p>
        {loading ? <AnalysisSkeleton /> : !a?.noteCount ? <p className="text-sm text-[var(--tx-2)]">音符を生成・入力すると、音の動きや使っている音階を説明します。</p> : <>
          <dl className="analysis-observations space-y-4">
            <div><dt className="text-sm font-semibold text-white">音の動き</dt><dd className="mt-1 text-[13px] leading-relaxed text-[var(--tx-2)]">{a.noteCount < 2 ? '比較するには2音以上必要です。' : `隣り合う${a.noteCount - 1}組のうち、5半音以上の跳躍が${a.intervalHist.slice(5).reduce((x, y) => x + y, 0)}回。1〜2半音の小さな動きは${a.intervalHist[1] + a.intervalHist[2]}回です。最大の動きは${a.maxLeap}半音。`}</dd></div>
            <div><dt className="text-sm font-semibold text-white">選んだ音階との関係</dt><dd className="mt-1 text-[13px] leading-relaxed text-[var(--tx-2)]">{NOTE_NAMES[p.key]} {SCALES[p.scale].label}の音は{Math.round(a.inScaleRatio * a.noteCount)} / {a.noteCount}音（{Math.round(a.inScaleRatio * 100)}%）。音階外の音も表現として使えます。高いほど良いという評価ではありません。</dd></div>
            <div><dt className="text-sm font-semibold text-white">リズムと繰り返し</dt><dd className="mt-1 text-[13px] leading-relaxed text-[var(--tx-2)]">{(() => { const onGrid = state.sequence.filter((n) => Math.abs(n.startTime / (60 / p.bpm) * 4 - Math.round(n.startTime / (60 / p.bpm) * 4)) < .18).length; return `16分音符の格子付近（±0.045拍）で始まる音は${onGrid} / ${a.noteCount}音。` })()} {a.noteCount < 8 ? '反復の比率は8音以上で計算します。' : `4音の音程・発音間隔パターンの反復に含まれる音は約${Math.round(a.motifRepetition * 100)}%。`}</dd></div>
          </dl>
          <details className="disclosure mt-4">
            <summary>詳細な観測値・参考指標 <span>計算方法を見る</span></summary>
            <div className="space-y-3 p-3 text-xs leading-relaxed text-[var(--tx-2)]">
              <Row k="音素材の利用" v={`${Math.round(a.materialUsage * SCALES[p.scale].steps.length)} / ${SCALES[p.scale].steps.length}種類`} />
              <p>選択中の音階に含まれる音名を、何種類使ったかです。オクターブ違いは同じ種類として数えます。</p>
              <Row k="隣接音の協和・参考値" v={a.noteCount > 1 ? `${Math.round(a.consonance * 100)}%` : '対象なし'} />
              <p>発音順に隣り合う音程へ固定の重み（同音・5度・オクターブ=1、半音=0.1など）を付けた平均です。同時に鳴る和音の評価や聴感の正解ではありません。</p>
              <Row k="平均音程 / 最大跳躍" v={`${a.avgInterval.toFixed(1)} / ${a.maxLeap} 半音`} />
              <Row k="シンコペーション候補" v={`${Math.round(a.syncopation * a.noteCount)}音`} />
              <p>拍の途中（0.2〜0.8拍の位置）で始まり、0.9拍以上続く音の数。楽譜上の厳密なシンコペーション判定ではありません。</p>
              <h4 className="pt-2 font-semibold text-white">旧表示の参考指数（0〜10の独自計算）</h4>
              <p>学習用に残した概算です。AIによる採点・一般的な品質基準ではなく、比較の目安です。小数の精密な点数表示は行いません。</p>
              <Row k="調和の参考指数" v={`${Math.round(a.harmony)} / 10`} />
              <p>音階内の音の比率45%＋隣接音程の協和重み35%＋小節頭の主和音構成音の比率20%。伴奏との一致ではありません。</p>
              <Row k="滑らかさの参考指数" v={`${Math.round(a.smoothness)} / 10`} />
              <p>1〜2半音の動きの割合、平均音程の小ささ、跳躍後の逆向きの動きから計算し、同音の連続割合で補正します。</p>
              <Row k="リズムの参考指数" v={`${Math.round(a.rhythmClarity)} / 10`} />
              <p>16分格子付近の発音45%＋小節頭に音がある比率35%＋音の長さの種類数20%。自由なリズムの価値を否定する指標ではありません。</p>
              <div className="mx-auto max-w-[240px]"><Radar axes={['調和(参考)', '滑らか(参考)', '格子(参考)', '反復', '跳躍', '音域']} values={radarOf(a)} prev={pv && pv.noteCount ? radarOf(pv) : null} /></div>
              {pv && <p>破線は前の生成時点。長さや音符数が違う場合は単純な優劣比較はできません。</p>}
            </div>
          </details>
        </>}
      </Card>

      {/* ---- Motif ---- */}
      <Card className="p-5" delay={200}>
        <SectionTitle title="生成時のモチーフと楽式" />
        <p className="mb-3 text-xs leading-relaxed text-[var(--tx-2)]">生成時点の構成図です。音符を編集した後の評価ではありません。現在のメロディの観測値は上の説明をご覧ください。</p>
        {loading ? (
          <div className="flex flex-col gap-2.5" aria-busy="true">
            <div className="flex justify-between"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-16" /></div>
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <div className="grid grid-cols-4 gap-1">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div>
          </div>
        ) : result?.motif ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] text-[var(--tx-2)]">
                {result.motif.origin === 'detected' ? `反復を検出 ×${result.motif.occurrences}` : result.motif.origin === 'created' ? '新しく作成' : '冒頭フレーズを採用'}
              </span>
              <span className="num text-[11px] tracking-[.25em] text-amber-200/90">{result.motif.signature}</span>
            </div>
            <div className="neu-inset mt-2 rounded-xl px-2.5 py-2"><MotifGlyph result={result} /></div>
            {/* 楽式タイムライン: 各フレーズの中心音 (マクロ中点変位) の高さで配置 */}
            <FormTimeline result={result} bpm={p.bpm} />
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

      {/* ---- コード進行 ---- */}
      {harmony && harmony.chords.length > 0 && <Progression harmony={harmony} bpb={TIME_SIGS_BPB[state.params.timeSig]} spb={60 / state.params.bpm} />}

      {/* ---- Sequence ---- */}
      <Card className="p-5" delay={260}>
        <SectionTitle title="シーケンス情報" />
        <div className="flex items-center gap-4">
          <PitchWheel hist={a?.pitchClassHist ?? new Array(12).fill(0)} keyRoot={p.key} steps={SCALES[p.scale].steps} />
          <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-3">
            {[
              { k: '音符数', v: <AnimatedNumber value={a?.noteCount ?? 0} className="text-cyan-200" /> },
              { k: '長さ', v: <AnimatedNumber value={a?.durationSec ?? 0} decimals={1} suffix="s" /> },
              { k: '音域', v: <span className="num">{a?.rangeSemis ?? 0}st</span> },
              { k: '密度', v: <AnimatedNumber value={a?.density ?? 0} decimals={1} suffix="/s" /> },
            ].map((x) => (
              <div key={x.k}>
                <p className="text-[10.5px] text-[var(--tx-3)]">{x.k}</p>
                <p className="mt-0.5 font-display text-[18px] font-semibold leading-none text-white">{x.v}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="mb-2 mt-5 text-[10.5px] text-[var(--tx-3)]">音程の分布</p>
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
        <div className="num mt-1 flex justify-between text-[8.5px] text-[var(--tx-3)]"><span>0</span><span>順次</span><span>跳躍</span><span>12</span></div>
        <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-3 text-[11px]">
          <span className="text-[var(--tx-2)]">順次 <b className="num font-medium text-emerald-300">{Math.round((a?.stepRatio ?? 0) * 100)}%</b></span>
          <span className="text-[var(--tx-2)]">跳躍 <b className="num font-medium text-fuchsia-300">{Math.round((a?.leapRatio ?? 0) * 100)}%</b></span>
          <span className="num text-[var(--tx)]">{NOTE_NAMES[p.key]} {SCALES[p.scale].label}</span>
        </div>
      </Card>
    </div>
  )
}
const TIME_SIGS_BPB: Record<string, number> = { '4/4': 4, '3/4': 3, '6/8': 3 }

/** コード進行カード: 小節グリッド上の和音 + 機能 (T/S/D) の流れ + 再生位置 */
function Progression({ harmony, bpb, spb }: { harmony: HarmonyResult; bpb: number; spb: number }) {
  const cs = harmony.chords
  const bars = Math.max(1, Math.ceil((cs[cs.length - 1].startBeat + cs[cs.length - 1].lengthBeats) / bpb - 1e-6))
  // 半小節以下の和音がある時は 1 行 2 小節にして名前が切れないようにする
  const perRow = cs.some((c) => c.lengthBeats < bpb) ? 2 : 4
  const box = useRef<HTMLDivElement>(null)
  const last = useRef(-1)
  usePlayhead((t, playing) => {
    const b = t / spb
    const i = playing ? cs.findIndex((c) => b >= c.startBeat && b < c.startBeat + c.lengthBeats) : -1
    if (i === last.current || !box.current) return
    last.current = i
    box.current.querySelectorAll<HTMLElement>('[data-ci]').forEach((el) => el.classList.toggle('prog-on', Number(el.dataset.ci) === i))
  })
  const counts = { T: 0, S: 0, D: 0 }
  cs.forEach((c) => (counts[c.func] += c.lengthBeats))
  const tot = Math.max(1, counts.T + counts.S + counts.D)
  const fitAvg = cs.reduce((s, c) => s + c.fit * c.lengthBeats, 0) / tot
  // 機能の流れ (T=下, S=中, D=上) を折れ線で
  const W = 260, H = 34
  const lv = { T: 26, S: 16, D: 6 }
  const totalBeats = bars * bpb
  const pts = cs.map((c) => [((c.startBeat + c.lengthBeats / 2) / totalBeats) * W, lv[c.func]] as const)
  return (
    <Card className="p-5" delay={230}>
      <SectionTitle title="コード進行" right={<span className="num text-xs text-[var(--tx-2)]">適合・参考 {Math.round(fitAvg * 100)}%</span>} />
      <p className="mb-3 text-xs leading-relaxed text-[var(--tx-2)]">各区間のメロディ音と、候補の三和音の構成音（重み1）と7thの音（重み0.6）の重なりを、長さと拍位置で重み付けした値です。休符区間は便宜的に50%とします。区間の長さで平均しており、曲全体の正解率ではありません。</p>
      <div ref={box} className="flex flex-col gap-1">
        {Array.from({ length: Math.ceil(bars / perRow) }).map((_, r) => (
          <div key={r} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${perRow * bpb}, minmax(0,1fr))` }}>
            {cs.filter((c) => c.startBeat >= r * perRow * bpb - 1e-6 && c.startBeat < (r + 1) * perRow * bpb - 1e-6).map((c) => {
              const ci = cs.indexOf(c)
              const col = Math.round(c.startBeat - r * perRow * bpb) + 1
              return (
                <div
                  key={`${c.startBeat}-${c.name}`}
                  data-ci={ci}
                  className="prog-cell prog-chip relative min-w-0 overflow-hidden rounded-lg px-1.5 py-1.5"
                  style={{ gridColumn: `${col} / span ${Math.max(1, Math.round(c.lengthBeats))}`, ['--fc' as any]: FUNC_COLOR[c.func], animationDelay: `${Math.min(800, ci * 50)}ms` }}
                  title={`${c.name} (${c.roman}) · ${FUNC_JA[c.func]} · 適合の参考値 ${Math.round(c.fit * 100)}%`}
                >
                  <span className="num block truncate text-[12px] font-semibold leading-tight text-white">{c.name}</span>
                  <span className="num block truncate text-[9px] leading-tight text-white/50">{c.roman}</span>
                  <span className="absolute bottom-0 left-0 h-[2px] bg-[var(--fc)]" style={{ width: `${Math.round(c.fit * 100)}%`, opacity: 0.8 }} />
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block h-[34px] w-full" preserveAspectRatio="none">
        {(['D', 'S', 'T'] as const).map((f) => <line key={f} x1={0} x2={W} y1={lv[f]} y2={lv[f]} stroke="rgba(255,255,255,.05)" strokeDasharray="2 3" />)}
        <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="rgba(236,232,245,.35)" strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="draw-line" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={2.4} fill={FUNC_COLOR[cs[i].func]} />)}
      </svg>
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full">
        {(['T', 'S', 'D'] as const).map((f) => <div key={f} className="h-full transition-all duration-700" style={{ width: `${(counts[f] / tot) * 100}%`, background: FUNC_COLOR[f] }} />)}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-[var(--tx-3)]">
        {(['T', 'S', 'D'] as const).map((f) => (
          <span key={f} className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: FUNC_COLOR[f] }} />{FUNC_JA[f]} <b className="num font-medium text-[var(--tx-2)]">{Math.round((counts[f] / tot) * 100)}%</b></span>
        ))}
      </div>
    </Card>
  )
}

/** 作曲中: 分析カードの骨格をシマー付きで表示 (レイアウトを崩さず「計算中」を伝える) */
function AnalysisSkeleton() {
  return (
    <div aria-busy="true" aria-label="分析中">
      <div className="grid grid-cols-3 justify-items-center gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton className="h-[74px] w-[74px] rounded-full" style={{ animationDelay: `${i * 120}ms` }} />
            <Skeleton className="h-2.5 w-14" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-4 h-[200px] w-full rounded-xl" />
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between"><Skeleton className="h-3" style={{ width: `${38 + ((i * 17) % 30)}%` }} /><Skeleton className="h-3 w-10" /></div>
        ))}
      </div>
    </div>
  )
}

export const AnalysisPanel = memo(AnalysisPanelImpl)
