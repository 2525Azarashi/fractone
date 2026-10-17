// 左パネル: 生成パラメータ設定 (中点変位設定 / モチーフ & 人間らしさ / 音楽設定)
import { useMemo, type Dispatch } from 'react'
import type { Action, State } from '../state'
import type { ScaleName, TimeSignature } from '../../lib/types'
import { NOTE_NAMES, SCALES, createRng } from '../../lib/theory'
import { midpointDisplace } from '../../lib/midpoint-displace'
import { Card, SectionTitle, Select, Slider } from './ui'
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
      <span className="num absolute left-2.5 top-1.5 text-[9px] text-[var(--tx-3)]">MIDPOINT · 2^{depth} = {n}</span>
    </div>
  )
}

export function ParamPanel({ state, dispatch, onSave }: { state: State; dispatch: Dispatch<Action>; onSave: () => void }) {
  const p = state.params
  const set = (patch: Partial<State['params']>) => dispatch({ type: 'params', patch })
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-5" delay={60}>
        <SectionTitle index="01" en="Midpoint Displacement" title="中点変位設定" />
        <MPDPreview depth={p.depth} displacement={p.displacement} roughness={p.roughness} seed={p.seed} />
        <div className="mt-4 space-y-3.5">
          <Slider label="基長 (小節数)" value={p.bars} min={2} max={32} step={2} format={(v) => `${v} bars`} onChange={(v) => set({ bars: v })} hint="続き／新規として生成する小節数" />
          <Slider label="音域幅" value={p.range} min={5} max={36} format={(v) => `${v} st`} onChange={(v) => set({ range: v })} hint="狭いほど歌いやすいメロディに" />
          <Slider label="変位強度" value={p.displacement} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set({ displacement: v })} hint="中点に加えるランダム変位の振幅。大きいほど跳躍が増える" />
          <Slider label="分解深度" value={p.depth} min={1} max={7} format={(v) => `Lv ${v}`} onChange={(v) => set({ depth: v })} hint="再帰分割の回数。深いほど音符が細かくなる" />
          <Slider label="粗さ (減衰率)" tone="cy" value={p.roughness} min={0.3} max={0.9} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set({ roughness: v })} hint="階層ごとに変位がどれだけ小さくなるか" />
        </div>
      </Card>

      <Card className="p-5" delay={120}>
        <SectionTitle index="02" en="Motif & Humanize" title="モチーフと人間らしさ" />
        <div className="space-y-3.5">
          <Slider label="モチーフ反復度" value={p.motifStrength} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ motifStrength: v })} hint="高いほど A–A'–B–A のような繰り返し構造に" />
          <Slider label="リズム密度" tone="cy" value={p.density} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ density: v })} />
          <Slider label="Humanize" tone="cy" value={p.humanize} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ humanize: v })} hint="タイミングと強弱の自然な揺らぎ" />
        </div>
      </Card>

      <Card className="p-5" delay={180}>
        <SectionTitle index="03" en="Music" title="音楽設定" />
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
