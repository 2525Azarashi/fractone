// ヘッダー: ワードマーク (Kinetic Typography) / ステータス / 時間表示 / レベルメーター / 音声出力
import { useRef } from 'react'
import { audio } from '../../lib/audio-engine'
import { fmtTime, usePlayhead } from '../hooks/useTransport'
import { KineticText } from './ui'
import type { State } from '../state'
import { NOTE_NAMES, SCALES, TIME_SIGS } from '../../lib/theory'
import { IMute, IVol, ISearch, ILib } from './icons'

export function Header({ state, onToggleMute, onHelp, onPalette, onTakes, takeCount }: { state: State; onToggleMute: () => void; onHelp: () => void; onPalette: () => void; onTakes: () => void; takeCount: number }) {
  const timeRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLSpanElement>(null)
  const meterRef = useRef<HTMLDivElement>(null)
  const spb = 60 / state.params.bpm
  const bpb = TIME_SIGS[state.params.timeSig].beatsPerBar
  usePlayhead((t) => {
    if (timeRef.current) timeRef.current.textContent = fmtTime(t)
    if (barRef.current) {
      const beat = t / spb
      barRef.current.textContent = `${String(Math.floor(beat / bpb) + 1).padStart(2, '0')}.${(Math.floor(beat) % bpb) + 1}`
    }
    const lv = audio.level()
    const el = meterRef.current
    if (el) Array.from(el.children).forEach((c, i) => ((c as HTMLElement).style.transform = `scaleY(${Math.max(0.15, Math.min(1, lv * 1.6 - i * 0.04 + Math.random() * 0.08))})`))
  })
  const st = {
    idle: { t: 'Standby', c: 'bg-white/40' },
    playing: { t: 'Playing', c: 'bg-cyan-300' },
    recording: { t: 'Recording', c: 'bg-rose-400' },
    composing: { t: 'Composing', c: 'bg-fuchsia-400' },
    done: { t: 'Ready', c: 'bg-emerald-300' },
    error: { t: 'Error', c: 'bg-amber-300' },
  }[state.status]
  const muted = state.audio.volume === 0
  return (
    <header className="fade-up relative z-20 flex flex-wrap items-center gap-x-6 gap-y-3 px-1 py-1">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 32 32" className="h-8 w-8">
          <defs><linearGradient id="lg" x1="0" x2="1" y1="1" y2="0"><stop offset="0" stopColor="#ff5bd6" /><stop offset="1" stopColor="#4fe3ff" /></linearGradient></defs>
          <rect x=".5" y=".5" width="31" height="31" rx="9" fill="#14101e" stroke="rgba(255,255,255,.1)" />
          <path d="M6 21 L11 13 L14.5 17 L19 8.5 L22.5 15 L26 11.5" fill="none" stroke="url(#lg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="leading-none">
          <h1 className="font-display text-[19px] font-semibold tracking-[-0.02em]">
            <KineticText text="Frac" wave className="text-white" />
            <KineticText text="Tone" wave className="grad-text" />
          </h1>
          <p className="eyebrow mt-1 !text-[8.5px]">Fractal Composer · DTM Lab</p>
        </div>
      </div>

      <nav className="hidden items-center gap-5 text-[11.5px] text-[var(--tx-3)] lg:flex">
        <span className="flex items-center gap-2"><i className={`h-1.5 w-1.5 rounded-full ${st.c} ${state.status === 'idle' ? '' : 'breathe'}`} /><span key={st.t} className="kt-swap text-[var(--tx)]">{st.t}</span></span>
        <span className="h-3 w-px bg-[var(--line-2)]" />
        <span className="num">{NOTE_NAMES[state.params.key]} {SCALES[state.params.scale].label}</span>
        <span className="num">{state.params.timeSig}</span>
        <span className="num">{state.params.bpm} bpm</span>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-black/25 px-3.5 py-1.5">
          <span ref={timeRef} className="num text-[13px] font-medium text-white">00:00.00</span>
          <span className="h-3 w-px bg-[var(--line-2)]" />
          <span className="num text-[12px] text-[var(--tx-2)]">
            <span className="mr-1 text-[9px] tracking-[.18em] text-[var(--tx-3)]">BAR</span>
            <span ref={barRef}>01.1</span>
          </span>
          <div ref={meterRef} className="hidden h-4 items-end gap-[2px] sm:flex">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="h-full w-[2px] origin-bottom rounded-full" style={{ background: i > 3 ? '#ff5bd6' : '#4fe3ff', transform: 'scaleY(.15)', transition: 'transform 70ms linear' }} />
            ))}
          </div>
        </div>
        {/* Auto Complete: コマンドパレット */}
        <button onClick={onPalette} className="neu-btn hidden h-9 items-center gap-2 rounded-xl pl-3 pr-2 text-[11.5px] text-[var(--tx-3)] md:flex" aria-label="コマンドを検索">
          <ISearch size={14} />
          <span className="w-28 text-left">検索・コマンド</span>
          <kbd className="num rounded border border-[var(--line-2)] px-1.5 text-[10px]">/</kbd>
        </button>
        <button onClick={onPalette} className="neu-btn grid h-9 w-9 place-items-center rounded-xl md:hidden" aria-label="コマンドを検索"><ISearch size={15} /></button>
        <button onClick={onTakes} className="neu-btn relative grid h-9 w-9 place-items-center rounded-xl" aria-label="テイク・ライブラリ" title="テイク・ライブラリ">
          <ILib size={16} />
          {takeCount > 0 && <span key={takeCount} className="pop-in num absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ff5bd6] px-1 text-[9px] font-semibold text-white">{takeCount}</span>}
        </button>
        <button onClick={onHelp} className="neu-btn grid h-9 w-9 place-items-center rounded-xl text-[13px] font-semibold" aria-label="ショートカット" title="ショートカット">?</button>
        <button onClick={onToggleMute} className="neu-btn grid h-9 w-9 place-items-center rounded-xl" aria-label="音声出力" title="音声出力 ON/OFF">
          {muted ? <IMute size={16} /> : <IVol size={16} />}
        </button>
      </div>
    </header>
  )
}
