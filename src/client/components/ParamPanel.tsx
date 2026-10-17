// 左パネル: 生成パラメータ設定 (中点変位設定 / モチーフ&人間らしさ / 音楽設定)
import type { Dispatch } from 'react'
import type { Action, State } from '../state'
import type { ScaleName, TimeSignature } from '../../lib/types'
import { NOTE_NAMES, SCALES } from '../../lib/theory'
import { Card, SectionTitle, Select, Slider } from './ui'
import { midpointDisplace } from '../../lib/midpoint-displace'
import { createRng } from '../../lib/theory'
import { useMemo } from 'react'

/** パラメータに応じて形が変わる、中点変位のミニプレビュー (インフォグラフィック) */
function MPDPreview({ depth, displacement, roughness, seed }: { depth: number; displacement: number; roughness: number; seed: number }) {
  const res = useMemo(
    () => midpointDisplace({ start: 0, end: 0, depth, displacement: 0.5 + displacement * 3.5, roughness, min: -5, max: 5, rng: createRng(seed) }),
    [depth, displacement, roughness, seed],
  )
  const W = 220, H = 54
  const n = res.values.length - 1
  const pts = res.values.map((v, i) => [(i / n) * W, H / 2 - (v / 5) * (H / 2 - 4)] as const)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const colors = ['#fff', '#ff4fd8', '#d14bff', '#9b5cff', '#6f7bff', '#39b8ff', '#39e6ff', '#5effc4']
  return (
    <div className="neu-inset relative overflow-hidden rounded-xl px-2 py-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[54px] w-full">
        <defs>
          <linearGradient id="mpdp" x1="0" x2="1"><stop offset="0" stopColor="#ff4fd8" /><stop offset="1" stopColor="#39e6ff" /></linearGradient>
        </defs>
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,.08)" strokeDasharray="2 3" />
        <path d={d} fill="none" stroke="url(#mpdp)" strokeWidth={2} strokeLinejoin="round" style={{ transition: 'd .5s cubic-bezier(.3,1.3,.5,1)' }} />
        {pts.map((p, i) => res.levels[i] <= 3 && <circle key={i} cx={p[0]} cy={p[1]} r={3.2 - res.levels[i] * 0.6} fill={colors[res.levels[i]]} style={{ transition: 'cx .5s, cy .5s cubic-bezier(.3,1.3,.5,1)' }} />)}
      </svg>
      <span className="absolute right-2 top-1 font-mono text-[8.5px] text-violet-200/50">{n} 区間 · 2^{depth}</span>
    </div>
  )
}

export function ParamPanel({ state, dispatch, onGenerate, onContinue, onPlay, onSave, busy }: {
  state: State; dispatch: Dispatch<Action>; onGenerate: () => void; onContinue: () => void; onPlay: () => void; onSave: () => void; busy: boolean
}) {
  const p = state.params
  const set = (patch: Partial<State['params']>) => dispatch({ type: 'params', patch })
  const userCount = state.sequence.filter((n) => n.source !== 'ai').length
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4" delay={60}>
        <SectionTitle icon="🌀" title="中点変位設定" en="Midpoint" />
        <MPDPreview depth={p.depth} displacement={p.displacement} roughness={p.roughness} seed={p.seed} />
        <div className="mt-3 space-y-3">
          <Slider label="基長 (小節数)" icon="📏" value={p.bars} min={2} max={32} step={2} format={(v) => `${v} bars`} onChange={(v) => set({ bars: v })} hint="続き/新規として生成する小節数" />
          <Slider label="音域幅" icon="↕️" value={p.range} min={5} max={36} format={(v) => `${v} 半音`} onChange={(v) => set({ range: v })} hint="狭いほど歌いやすいメロディに" />
          <Slider label="変位強度" icon="⚡" value={p.displacement} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set({ displacement: v })} hint="中点に加えるランダムノイズの振幅。大きいほど跳躍が増える" />
          <Slider label="分解深度" icon="🔬" value={p.depth} min={1} max={7} format={(v) => `Lv.${v}`} onChange={(v) => set({ depth: v })} hint="再帰分割の回数。深いほど音符が細かく" />
          <Slider label="粗さ (減衰率)" icon="🪨" tone="cy" value={p.roughness} min={0.3} max={0.9} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set({ roughness: v })} hint="階層ごとに変位がどれだけ小さくなるか" />
        </div>
      </Card>

      <Card className="p-4" delay={120}>
        <SectionTitle icon="🧠" title="モチーフ & 人間らしさ" en="Motif" />
        <div className="space-y-3">
          <Slider label="モチーフ反復度" icon="🔁" value={p.motifStrength} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ motifStrength: v })} hint="高いほど A-A'-B-A のような繰り返し構造に" />
          <Slider label="リズム密度" icon="🥁" tone="cy" value={p.density} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ density: v })} />
          <Slider label="Humanize" icon="🫶" tone="cy" value={p.humanize} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ humanize: v })} hint="タイミングと強弱の自然な揺らぎ" />
        </div>
      </Card>

      <Card className="p-4" delay={180}>
        <SectionTitle icon="🎼" title="音楽設定" en="Music" />
        <div className="grid grid-cols-2 gap-2.5">
          <Select label="キー" value={p.key} options={NOTE_NAMES.map((n, i) => ({ value: i, label: n }))} onChange={(v) => set({ key: v })} />
          <Select label="スケール" value={p.scale} options={(Object.keys(SCALES) as ScaleName[]).map((s) => ({ value: s, label: SCALES[s].label }))} onChange={(v) => set({ scale: v })} />
          <Select label="拍子" value={p.timeSig} options={(['4/4', '3/4', '6/8'] as TimeSignature[]).map((t) => ({ value: t, label: t }))} onChange={(v) => set({ timeSig: v })} />
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-violet-100/70">シード</span>
            <div className="flex gap-1">
              <input className="select !bg-none !pr-2 font-mono" type="number" value={p.seed} onChange={(e) => set({ seed: Number(e.target.value) || 1 })} />
              <button className="neu-btn shrink-0 rounded-xl px-2 text-sm" title="ランダム" onClick={() => set({ seed: Math.floor(Math.random() * 99999) })}>🎲</button>
            </div>
          </label>
        </div>
        <div className="mt-3">
          <Slider label="テンポ" icon="⏱" value={p.bpm} min={50} max={200} format={(v) => `${v} BPM`} onChange={(v) => set({ bpm: v })} />
        </div>
      </Card>

      <div className="fade-up flex flex-col gap-2" style={{ ['--d' as any]: '240ms' }}>
        <button onClick={onContinue} disabled={busy || userCount < 2} className="btn-continue group relative overflow-hidden rounded-2xl px-4 py-3.5 text-left text-white disabled:cursor-not-allowed disabled:opacity-40">
          <span className="flex items-center gap-2 text-[15px] font-extrabold">
            <span className="text-lg transition-transform duration-500 group-hover:rotate-[360deg]">✨</span>
            <span className={busy ? 'kt-stretch' : ''}>続きを作曲</span>
          </span>
          <span className="mt-0.5 block text-[10px] font-semibold opacity-85">あなたの {userCount} 音からモチーフを判断 → 中点変位で展開</span>
        </button>
        <button onClick={onGenerate} disabled={busy} className="btn-generate group relative overflow-hidden rounded-2xl px-4 py-3.5 text-left text-white disabled:opacity-50">
          <span className="flex items-center gap-2 text-[15px] font-extrabold">
            <span className="text-lg transition-transform duration-500 group-hover:scale-125">🪄</span>
            <span className={busy ? 'kt-stretch' : ''}>新規生成</span>
          </span>
          <span className="mt-0.5 block text-[10px] font-semibold opacity-85">モチーフを作成してゼロから作曲</span>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onPlay} className="neu-btn flex items-center justify-center gap-2 rounded-2xl py-2.5 text-[12.5px] font-extrabold" data-active={state.status === 'playing'}>
            {state.status === 'playing' ? '⏸ 停止' : '▶ 再生'}
          </button>
          <button onClick={onSave} className="neu-btn flex items-center justify-center gap-2 rounded-2xl py-2.5 text-[12.5px] font-extrabold">
            💾 保存
          </button>
        </div>
      </div>
    </div>
  )
}
