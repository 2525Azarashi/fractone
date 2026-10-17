// オーディオ設定タブ: 音色カード / ミキサー / ADSR 可視化 / スペクトラム
import { useEffect, useRef, type Dispatch } from 'react'
import { INSTRUMENTS, audio, type AudioSettings } from '../../lib/audio-engine'
import type { Action } from '../state'
import { Slider, Toggle } from './ui'

export function AudioPanel({ settings, dispatch }: { settings: AudioSettings; dispatch: Dispatch<Action> }) {
  const set = (patch: Partial<AudioSettings>) => dispatch({ type: 'audio', patch })
  const specRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const s = audio.spectrum(32)
      const el = specRef.current
      if (el) s.forEach((v, i) => ((el.children[i] as HTMLElement).style.transform = `scaleY(${0.04 + v * 0.96})`))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ADSR 形状
  const a = settings.attack * 400, r = settings.release * 120
  const env = `M10,90 L${10 + a},14 L${40 + a},44 L${150 - r},44 L150,90`

  return (
    <div className="thin-scroll grid h-full gap-3 overflow-auto md:grid-cols-2">
      <div className="neu-inset rounded-2xl p-3">
        <p className="mb-2 text-[11px] font-extrabold text-violet-100">🎨 音色を選ぼう</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {INSTRUMENTS.map((ins, i) => (
            <button
              key={ins.id}
              data-active={settings.instrument === ins.id}
              onClick={() => {
                set({ instrument: ins.id })
                audio.update({ instrument: ins.id })
                ;[60, 64, 67, 72].forEach((m, k) => setTimeout(() => audio.preview(m, 0.25, 0.7), k * 90))
              }}
              className="neu-btn fade-up flex flex-col items-center gap-1 rounded-2xl px-2 py-3"
              style={{ ['--d' as any]: `${i * 50}ms` }}
            >
              <span className="text-2xl transition-transform duration-300 hover:scale-125">{ins.emoji}</span>
              <span className="text-[11px] font-extrabold">{ins.label}</span>
              <span className="text-[9px] opacity-60">{ins.desc}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="neu-inset flex flex-col gap-3 rounded-2xl p-3">
        <p className="text-[11px] font-extrabold text-violet-100">🎚 ミキサー & エンベロープ</p>
        <Slider label="マスター音量" icon="🔊" value={settings.volume} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ volume: v })} />
        <Slider label="リバーブ (残響)" icon="🌌" tone="cy" value={settings.reverb} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ reverb: v })} />
        <Slider label="明るさ (フィルター)" icon="✨" value={settings.brightness} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ brightness: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Slider label="アタック" tone="cy" value={settings.attack} min={0.002} max={0.3} step={0.002} format={(v) => `${Math.round(v * 1000)}ms`} onChange={(v) => set({ attack: v })} />
          <Slider label="リリース" tone="cy" value={settings.release} min={0.03} max={1.2} step={0.01} format={(v) => `${v.toFixed(2)}s`} onChange={(v) => set({ release: v })} />
        </div>
        <Toggle on={settings.metronome} onChange={(v) => set({ metronome: v })} label="メトロノーム (再生/録音時)" />
      </div>
      <div className="neu-inset rounded-2xl p-3">
        <p className="mb-1 text-[11px] font-extrabold text-violet-100">📈 ADSR エンベロープ</p>
        <svg viewBox="0 0 160 100" className="h-28 w-full">
          <defs>
            <linearGradient id="adsr" x1="0" x2="1"><stop offset="0" stopColor="#ff4fd8" /><stop offset="1" stopColor="#39e6ff" /></linearGradient>
          </defs>
          <path d={`${env} Z`} fill="url(#adsr)" opacity={0.18} />
          <path d={env} fill="none" stroke="url(#adsr)" strokeWidth={2.5} strokeLinejoin="round" style={{ transition: 'd .4s' }} />
          {['A', 'D', 'S', 'R'].map((l, i) => (
            <text key={l} x={[10 + a / 2, 25 + a, 95, 150 - r / 2][i]} y={98} fontSize={8} fill="#cbb8ff" textAnchor="middle" fontWeight={800}>{l}</text>
          ))}
        </svg>
        <p className="text-[10px] leading-relaxed text-violet-200/55">音の「立ち上がり(A)→減衰(D)→持続(S)→余韻(R)」。DTM で音色づくりの基本になる考え方です。</p>
      </div>
      <div className="neu-inset rounded-2xl p-3">
        <p className="mb-2 text-[11px] font-extrabold text-violet-100">🌈 リアルタイム・スペクトラム</p>
        <div ref={specRef} className="flex h-28 items-end gap-[3px]">
          {Array.from({ length: 32 }).map((_, i) => (
            <div key={i} className="h-full flex-1 origin-bottom rounded-t-sm" style={{ background: `linear-gradient(to top, #ff4fd8, hsl(${290 - i * 4} 100% 70%))`, transform: 'scaleY(.04)', transition: 'transform 60ms linear' }} />
          ))}
        </div>
        <p className="mt-2 text-[10px] text-violet-200/55">鍵盤を弾くと周波数成分が光ります。低音は左、高音は右。</p>
      </div>
    </div>
  )
}
