// ============================================================
// ComposeDock — ピアノロール直上の作曲ドック
//  生成ボタンを編集中の音符のすぐ近くに置き、主要パラメータもワンタッチで調整
// ============================================================
import type { Dispatch } from 'react'
import type { Action, State } from '../state'
import { IArrowR, IDice, IWand, ISpark } from './icons'

function MiniParam({ label, value, display, min, max, step, onChange }: { label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="group flex min-w-[96px] flex-1 flex-col gap-0.5 px-3 py-1.5" title={label}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="eyebrow !text-[8.5px] !tracking-[.18em] transition-colors group-hover:!text-[var(--tx-2)]">{label}</span>
        <span key={display} className="kt-swap num text-[11px] font-semibold text-white">{display}</span>
      </span>
      <input type="range" className="slider" min={min} max={max} step={step} value={value} style={{ ['--p' as any]: `${pct}%` }} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export function ComposeDock({ state, dispatch, onContinue, onGenerate, onReroll, busy }: {
  state: State; dispatch: Dispatch<Action>; onContinue: () => void; onGenerate: () => void; onReroll: () => void; busy: boolean
}) {
  const p = state.params
  const set = (patch: Partial<State['params']>) => dispatch({ type: 'params', patch })
  const userCount = state.sequence.filter((n) => n.source !== 'ai').length
  const canContinue = userCount >= 2

  return (
    <div className="neu-inset relative flex flex-col gap-1 rounded-2xl p-1.5 md:flex-row md:flex-wrap md:items-stretch xl:flex-nowrap">
      {/* 主アクション */}
      <div className="flex shrink-0 items-stretch gap-1.5">
        <button
          onClick={onContinue}
          disabled={busy || !canContinue}
          className="btn-primary group flex flex-1 items-center gap-3 rounded-xl py-2 pl-3 pr-4 text-left md:flex-none"
          title={canContinue ? 'あなたのメロディからモチーフを判断し、中点変位法で続きを作曲' : '2音以上入力すると使えます'}
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15">
            {busy ? <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white spin" /> : <ISpark size={17} className="transition-transform duration-700 group-hover:rotate-90" />}
          </span>
          <span className="leading-tight">
            <span className={`block text-[13px] font-semibold ${busy ? 'kt-stretch' : ''}`}>続きを作曲</span>
            <span className="num block text-[10px] text-white/70">{userCount} notes → +{p.bars} bars</span>
          </span>
          <IArrowR size={15} className="opacity-70 transition-transform duration-300 group-hover:translate-x-0.5" />
          {busy && <span className="scan" />}
        </button>
        <button onClick={onGenerate} disabled={busy} className="btn-ghost group flex items-center gap-2 rounded-xl px-3 text-[12.5px] font-medium" title="モチーフを新しく作ってゼロから作曲">
          <IWand size={16} className="text-fuchsia-300 transition-transform duration-500 group-hover:-rotate-12" />
          <span className="hidden sm:inline">新規生成</span>
        </button>
        <button onClick={onReroll} disabled={busy || !state.result} className="btn-ghost grid w-10 place-items-center rounded-xl" title="シードを変えて別案を生成">
          <IDice size={16} className="transition-transform duration-500 hover:rotate-180" />
        </button>
      </div>

      <span className="mx-1 hidden w-px self-stretch bg-[var(--line)] xl:block" />
      <span className="hairline-x md:hidden" />

      {/* クイックパラメータ */}
      <div className="grid min-w-0 flex-1 grid-cols-2 items-center sm:flex sm:flex-wrap">
        <MiniParam label="Bars" value={p.bars} display={`${p.bars}`} min={2} max={32} step={2} onChange={(v) => set({ bars: v })} />
        <MiniParam label="変位強度" value={p.displacement} display={p.displacement.toFixed(2)} min={0} max={1} step={0.01} onChange={(v) => set({ displacement: v })} />
        <MiniParam label="分解深度" value={p.depth} display={`Lv${p.depth}`} min={1} max={7} step={1} onChange={(v) => set({ depth: v })} />
        <MiniParam label="反復度" value={p.motifStrength} display={`${Math.round(p.motifStrength * 100)}%`} min={0} max={1} step={0.01} onChange={(v) => set({ motifStrength: v })} />
      </div>
    </div>
  )
}
