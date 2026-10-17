// ヘッダー: ロゴ (Kinetic Typography) / ステータス / 時間表示 / レベルメーター / 音声出力
import { useRef } from 'react'
import { audio } from '../../lib/audio-engine'
import { fmtTime, usePlayhead } from '../hooks/useTransport'
import { KineticText } from './ui'
import type { State } from '../state'
import { TIME_SIGS } from '../../lib/theory'

export function Header({ state, onToggleMute }: { state: State; onToggleMute: () => void }) {
  const timeRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLSpanElement>(null)
  const meterRef = useRef<HTMLDivElement>(null)
  const spb = 60 / state.params.bpm
  const bpb = TIME_SIGS[state.params.timeSig].beatsPerBar
  usePlayhead((t) => {
    if (timeRef.current) timeRef.current.textContent = fmtTime(t)
    if (barRef.current) {
      const beat = t / spb
      barRef.current.textContent = `${Math.floor(beat / bpb) + 1}.${(Math.floor(beat) % bpb) + 1}`
    }
    const lv = audio.level()
    const el = meterRef.current
    if (el) Array.from(el.children).forEach((c, i) => ((c as HTMLElement).style.opacity = lv * 8 > i ? '1' : '0.15'))
  })
  const st = state.status
  const stMap = {
    idle: { t: 'STANDBY', c: 'bg-violet-300' },
    playing: { t: 'PLAYING', c: 'bg-cyan-300' },
    recording: { t: 'REC', c: 'bg-rose-400' },
    composing: { t: 'COMPOSING', c: 'bg-fuchsia-400' },
    done: { t: 'READY', c: 'bg-emerald-300' },
    error: { t: 'ERROR', c: 'bg-amber-300' },
  }[st]
  const muted = state.audio.volume === 0
  return (
    <header className="neu fade-up relative z-20 flex flex-wrap items-center gap-3 rounded-[22px] px-4 py-2.5 md:flex-nowrap">
      <div className="flex items-center gap-2.5">
        <div className="float relative grid h-10 w-10 place-items-center rounded-2xl grad-bg shadow-[0_8px_24px_rgba(255,79,216,.45)]">
          <svg viewBox="0 0 32 32" className="h-6 w-6">
            <path d="M3 22 L9 12 L13 17 L18 7 L23 15 L29 10" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="18" cy="7" r="2.4" fill="#fff" />
          </svg>
        </div>
        <div className="leading-none">
          <h1 className="font-display text-[22px] font-black tracking-tight">
            <KineticText text="Frac" wave className="grad-text" />
            <KineticText text="Tone" wave className="text-white" />
          </h1>
          <p className="mt-0.5 text-[9.5px] font-bold tracking-[0.12em] text-violet-200/50">フラクタル作曲 × DTMまなび</p>
        </div>
      </div>

      <div className="order-3 hidden min-w-0 flex-1 overflow-hidden md:order-none md:block">
        <div className="marquee flex w-max gap-8 whitespace-nowrap text-[10.5px] font-semibold text-violet-200/45">
          {[0, 1].map((k) => (
            <span key={k} className="flex gap-8">
              <span>🎹 A〜; キーで演奏 / Z・X でオクターブ</span>
              <span>🌀 中点変位法 = 両端の平均 + ランダム変位 を再帰的に繰り返す</span>
              <span>🔁 モチーフの反復・反復進行・反行で「人間らしい」曲に</span>
              <span>🖱 音符はドラッグで移動・右端で長さ変更・ダブルクリックで追加</span>
              <span>⌨ Space 再生 / R 録音 / Delete 削除 / Ctrl+Z 元に戻す</span>
            </span>
          ))}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="neu-inset flex items-center gap-2 rounded-full px-3 py-1.5">
          <span className={`pulse-dot h-2 w-2 rounded-full ${stMap.c}`} style={{ color: 'rgba(255,255,255,.4)' }} />
          <span key={stMap.t} className="kt-swap font-display text-[10.5px] font-extrabold tracking-[0.16em] text-white">{stMap.t}</span>
        </div>
        <div className="neu-inset flex items-center gap-2 rounded-full px-3 py-1.5 font-mono">
          <span ref={timeRef} className="text-[13px] font-semibold text-cyan-200">00:00.00</span>
          <span className="text-[10px] text-violet-300/50">BAR</span>
          <span ref={barRef} className="text-[12px] font-semibold text-fuchsia-200">1.1</span>
        </div>
        <div ref={meterRef} className="hidden h-6 items-end gap-[2px] sm:flex">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="w-[4px] rounded-full" style={{ height: 6 + i * 2.4, background: i > 5 ? '#ff4fd8' : i > 3 ? '#b23cff' : '#39e6ff', opacity: 0.15, transition: 'opacity 80ms' }} />
          ))}
        </div>
        <button onClick={onToggleMute} className="neu-btn grid h-9 w-9 place-items-center rounded-full text-[15px]" aria-label="音声出力" title="音声出力 ON/OFF">
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
    </header>
  )
}
