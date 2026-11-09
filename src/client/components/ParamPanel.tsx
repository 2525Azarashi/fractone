// 左パネル: 生成パラメータ設定 (中点変位設定 / モチーフ & 人間らしさ / 音楽設定)
import { useMemo, type Dispatch } from 'react'
import type { Action, State } from '../state'
import type { ScaleName, TimeSignature } from '../../lib/types'
import { NOTE_NAMES, SCALES, createRng } from '../../lib/theory'
import { midpointDisplace } from '../../lib/midpoint-displace'
import { Card, SectionTitle, Select, Slider, Toggle } from './ui'
import type { ChordStyle, HarmonyResult } from '../../lib/chord-generator'
import { midiToName } from '../../lib/theory'
import { IDice, ISave } from './icons'

/** パラメータに応じて形が変わる、中点変位のライブプレビュー (インフォグラフィック) */
function MPDPreview({ depth, displacement, roughness, seed }: { depth: number; displacement: number; roughness: number; seed: number }) {
  const res = useMemo(
    () => midpointDisplace({ start: 0, end: 0, depth, displacement: 0.5 + displacement * 3.5, roughness, min: -5, max: 5, rng: createRng(seed) }),
    [depth, displacement, roughness, seed],
  )
  const W = 240, H = 64
  const n = res.values.length - 1
  const pts = res.values.map((v, i) => [(i / n) * W, H / 2 - (v / 5) * (H / 2 - 6)] as const)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <div className="neu-inset relative overflow-hidden rounded-xl">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-16 w-full">
        <defs>
          <linearGradient id="mpdp" x1="0" x2="1"><stop offset="0" stopColor="#ff5bd6" /><stop offset=".6" stopColor="#8b5cff" /><stop offset="1" stopColor="#4fe3ff" /></linearGradient>
          <linearGradient id="mpdpA" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8b5cff" stopOpacity=".22" /><stop offset="1" stopColor="#8b5cff" stopOpacity="0" /></linearGradient>
        </defs>
        {[1, 2, 3].map((k) => <line key={k} x1={(W / 4) * k} x2={(W / 4) * k} y1={0} y2={H} stroke="rgba(255,255,255,.04)" />)}
        <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#mpdpA)" style={{ transition: 'd .6s var(--ease)' }} />
        <path d={d} fill="none" stroke="url(#mpdp)" strokeWidth={1.5} strokeLinejoin="round" style={{ transition: 'd .6s var(--ease)' }} />
        {pts.map((p, i) => res.levels[i] <= 2 && (
          <circle key={i} cx={p[0]} cy={p[1]} r={res.levels[i] === 0 ? 2.6 : 2} fill={res.levels[i] === 0 ? '#fff' : '#0a0812'} stroke={res.levels[i] === 0 ? 'none' : '#ff5bd6'} strokeWidth={1.2} style={{ transition: 'cx .6s var(--ease), cy .6s var(--ease)' }} />
        ))}
      </svg>

    </div>
  )
}

const STYLES: { id: ChordStyle; label: string; desc: string; glyph: number[][] }[] = [
  // glyph: [拍位置 0-7, 高さ 0-3] — ボタン内のミニ譜面
  { id: 'block', label: 'ブロック', desc: '和音を拍ごとに刻む', glyph: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2], [4, 0], [4, 1], [4, 2], [6, 0], [6, 1], [6, 2]] },
  { id: 'arpeggio', label: 'アルペジオ', desc: '分散和音で上下に流れる', glyph: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 2], [5, 1], [6, 2], [7, 3]] },
  { id: 'alberti', label: 'アルベルティ', desc: '低・高・中・高 の古典的な伴奏', glyph: [[0, 0], [1, 2], [2, 1], [3, 2], [4, 0], [5, 2], [6, 1], [7, 2]] },
  { id: 'bass', label: 'ベース+和音', desc: 'ルートと5度のベースに裏拍の和音', glyph: [[0, 0], [1, 2], [1, 3], [2, 1], [3, 2], [3, 3], [4, 0], [5, 2], [5, 3], [6, 1], [7, 2], [7, 3]] },
]

function StyleGlyph({ g, on }: { g: number[][]; on: boolean }) {
  return (
    <svg viewBox="0 0 64 22" className="h-[18px] w-full">
      {g.map(([x, y], i) => (
        <rect key={i} x={x * 8 + 1} y={18 - y * 5} width={6} height={3} rx={1.2} fill={on ? (y === 0 ? '#fff' : '#4fe3ff') : 'rgba(236,232,245,.3)'} style={{ transition: `fill .3s ${i * 25}ms` }} />
      ))}
    </svg>
  )
}

function HarmonyCard({ state, dispatch, harmony }: { state: State; dispatch: Dispatch<Action>; harmony: HarmonyResult | null }) {
  const h = state.harmony
  const on = state.chordsOn
  const set = (patch: Partial<State['harmony']>) => dispatch({ type: 'harmony', patch })
  const bpb = state.params.timeSig === '4/4' ? 4 : 3
  const rates = [{ value: 0, label: '自動' }, { value: bpb, label: '1小節' }, ...(state.params.timeSig === '4/4' ? [{ value: 2, label: '2拍' }] : []), { value: 1, label: '1拍' }]
  return (
    <Card className="p-5" delay={150}>
      <SectionTitle title="コード生成" right={<Toggle on={on} onChange={() => dispatch({ type: 'toggle', key: 'chordsOn' })} label={on ? 'オン' : 'オフ'} />} />
      <div className={`grid transition-all duration-500 ${on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-40'}`} style={{ transitionTimingFunction: 'var(--ease)' }}>
        <div className="overflow-hidden">
          <p className="mb-3 text-[11px] leading-relaxed text-[var(--tx-3)]">
            メロディの音から和音を選び、機能和声のつながりで進行を決めます。
            {harmony && <span className="num text-[var(--tx-2)]"> {harmony.chords.length} 和音 · {harmony.elapsedMs}ms</span>}
          </p>
          <span className="mb-1.5 block text-[11px] font-medium text-[var(--tx-3)]">伴奏の型</span>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="伴奏の型">
            {STYLES.map((st) => {
              const sel = h.style === st.id
              return (
                <button
                  key={st.id}
                  role="radio"
                  aria-checked={sel}
                  title={st.desc}
                  onClick={() => set({ style: st.id })}
                  className={`rounded-xl border px-2.5 pb-1.5 pt-2 text-left transition-all duration-300 ${sel ? 'border-cyan-300/50 bg-cyan-300/[0.07] shadow-[0_0_0_1px_rgba(79,227,255,.15),0_6px_18px_-8px_rgba(79,227,255,.5)]' : 'border-[var(--line)] bg-white/[0.015] hover:border-[var(--line-2)]'}`}
                >
                  <StyleGlyph g={st.glyph} on={sel} />
                  <span className={`mt-1 block text-[11.5px] font-medium ${sel ? 'text-white' : 'text-[var(--tx-2)]'}`}>{st.label}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Select label="変化の間隔" value={rates.some((r) => r.value === h.rate) ? h.rate : 0} options={rates} onChange={(v) => set({ rate: v })} />
            <Select label="伴奏の音域" value={h.register} options={[{ value: 45, label: '低め' }, { value: 52, label: '標準' }, { value: 59, label: '高め' }]} onChange={(v) => set({ register: v })} />
          </div>
          <div className="mt-3.5 space-y-3.5">
            <Slider label="7th の割合" tone="cy" value={h.color} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ color: v })} hint="高いほど CM7 や Dm7 のようなおしゃれな響きに" />
            <Slider label="伴奏の音量" value={h.volume} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ volume: v })} hint={`メロディより小さめが聴きやすい。伴奏は ${midiToName(h.register)} 付近で、前の和音から近い形を選びます`} />
          </div>
        </div>
      </div>
    </Card>
  )
}

export function ParamPanel({ state, dispatch, onSave, harmony = null }: { state: State; dispatch: Dispatch<Action>; onSave: () => void; harmony?: HarmonyResult | null }) {
  const p = state.params
  const set = (patch: Partial<State['params']>) => dispatch({ type: 'params', patch })
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-5" delay={60}>
        <SectionTitle title="中点変位設定" />
        <MPDPreview depth={p.depth} displacement={p.displacement} roughness={p.roughness} seed={p.seed} />
        <div className="mt-4 space-y-3.5">
          <Slider label="基長 (小節数)" value={p.bars} min={2} max={32} step={2} format={(v) => `${v} 小節`} onChange={(v) => set({ bars: v })} hint="続き／新規として生成する小節数" />
          <Slider label="音域幅" value={p.range} min={5} max={36} format={(v) => `${v} st`} onChange={(v) => set({ range: v })} hint="狭いほど歌いやすいメロディに" />
          <Slider label="変位強度" value={p.displacement} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set({ displacement: v })} hint="中点に加えるランダム変位の振幅。大きいほど跳躍が増える" />
          <Slider label="分解深度" value={p.depth} min={1} max={7} format={(v) => `Lv ${v}`} onChange={(v) => set({ depth: v })} hint="再帰分割の回数。深いほど音符が細かくなる" />
          <Slider label="粗さ (減衰率)" tone="cy" value={p.roughness} min={0.3} max={0.9} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set({ roughness: v })} hint="階層ごとに変位がどれだけ小さくなるか" />
        </div>
      </Card>

      <Card className="p-5" delay={120}>
        <SectionTitle title="モチーフと人間らしさ" />
        <div className="space-y-3.5">
          <Slider label="モチーフ反復度" value={p.motifStrength} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ motifStrength: v })} hint="高いほど A–A'–B–A のような繰り返し構造に" />
          <Slider label="リズム密度" tone="cy" value={p.density} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ density: v })} />
          <Slider label="人間らしい揺らぎ" tone="cy" value={p.humanize} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ humanize: v })} hint="タイミングと強弱の自然な揺らぎ" />
        </div>
      </Card>

      <HarmonyCard state={state} dispatch={dispatch} harmony={harmony} />

      <Card className="p-5" delay={180}>
        <SectionTitle title="音楽設定" />
        <div className="grid grid-cols-2 gap-2.5">
          <Select label="キー" value={p.key} options={NOTE_NAMES.map((n, i) => ({ value: i, label: n }))} onChange={(v) => set({ key: v })} />
          <Select label="スケール" value={p.scale} options={(Object.keys(SCALES) as ScaleName[]).map((s) => ({ value: s, label: SCALES[s].label }))} onChange={(v) => set({ scale: v })} />
          <Select label="拍子" value={p.timeSig} options={(['4/4', '3/4', '6/8'] as TimeSignature[]).map((t) => ({ value: t, label: t }))} onChange={(v) => set({ timeSig: v })} />
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-[var(--tx-3)]">シード</span>
            <div className="flex gap-1">
              <input className="select num !bg-none !pr-2" type="number" value={p.seed} onChange={(e) => set({ seed: Number(e.target.value) || 1 })} />
              <button className="neu-btn grid w-9 shrink-0 place-items-center rounded-[10px]" title="ランダム" onClick={() => set({ seed: Math.floor(Math.random() * 99999) })}><IDice size={15} /></button>
            </div>
          </label>
        </div>
        <div className="mt-4">
          <Slider label="テンポ" value={p.bpm} min={50} max={200} format={(v) => `${v} bpm`} onChange={(v) => set({ bpm: v })} />
        </div>
      </Card>

      <button onClick={onSave} className="btn-ghost fade-up flex items-center justify-between rounded-2xl px-5 py-3.5 text-left" style={{ ['--d' as any]: '240ms' }}>
        <span>
          <span className="block text-[13px] font-semibold">MIDI に書き出す</span>
          <span className="block text-[10.5px] text-[var(--tx-3)]">ブラウザにも自動保存されています</span>
        </span>
        <ISave size={18} className="text-[var(--tx-2)]" />
      </button>
    </div>
  )
}
