// 汎用UI部品: Kinetic Typography / アニメーション数値 / スライダー / セレクト / ゲージ
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ScrambleText } from './fx'

/** 1文字ずつ立ち上がる Kinetic Typography */
export function KineticText({ text, className = '', wave = false, stagger = 32 }: { text: string; className?: string; wave?: boolean; stagger?: number }) {
  const grad = className.includes('grad-text')
  return (
    <span className={`${wave ? '' : 'kt-in'} ${className}`} aria-label={text} key={text} style={{ perspective: 400 }}>
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          aria-hidden
          className={`${wave ? 'kt-letter' : ''} ${grad ? 'grad-text' : ''}`}
          style={{
            ['--i' as any]: i,
            animationDelay: wave ? undefined : `${i * stagger}ms`,
            ...(grad ? { backgroundSize: `${text.length * 100}% 100%`, backgroundPosition: `${text.length > 1 ? (i / (text.length - 1)) * 100 : 0}% 0` } : {}),
          }}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
    </span>
  )
}

/** マスクから迫り上がる見出し (行単位) */
export function RiseText({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <span className="kt-mask">
      {/* グラデーション等のクラスはアニメーションする内側に付ける (background-clip:text 対策) */}
      <span className={className} style={{ ['--d' as any]: `${delay}ms` }}>{children}</span>
    </span>
  )
}

/** 値が変わるとカウントアップ/ダウンする数値 */
export function AnimatedNumber({ value, decimals = 0, suffix = '', className = '', duration = 800 }: { value: number; decimals?: number; suffix?: string; className?: string; duration?: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    const b = value
    if (a === b) return
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      const e = 1 - Math.pow(1 - k, 4)
      setShown(a + (b - a) * e)
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = b
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      from.current = b
    }
  }, [value, duration])
  return (
    <span className={`num inline-block ${className}`}>
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  )
}

export function Slider({
  label, value, min, max, step = 1, onChange, format, hint, tone = 'mag',
}: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void
  format?: (v: number) => string; hint?: string; tone?: 'mag' | 'cy'; icon?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  const [pulse, setPulse] = useState(0)
  return (
    <label className="group block select-none" title={hint}>
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-[var(--tx-2)] transition-colors group-hover:text-[var(--tx)]">{label}</span>
        <span key={pulse} className={`kt-swap num text-[11px] font-semibold ${tone === 'cy' ? 'text-cyan-200' : 'text-[var(--tx)]'}`}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        className={`slider mt-1 ${tone === 'cy' ? 'cy' : ''}`}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--p' as any]: `${pct}%` }}
        onChange={(e) => {
          onChange(Number(e.target.value))
          setPulse((x) => x + 1)
        }}
      />
      {hint && (
        <p className="grid grid-rows-[0fr] text-[10.5px] leading-snug text-[var(--tx-3)] transition-all duration-300 group-hover:grid-rows-[1fr]">
          <span className="overflow-hidden">{hint}</span>
        </p>
      )}
    </label>
  )
}

export function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium text-[var(--tx-3)]">{label}</span>
      <select
        className="select"
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value)
          if (o) onChange(o.value)
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** 円形ゲージ (インフォグラフィック) — 細いリング + 目盛り */
export function Gauge({ value, max = 10, label, color = '#4fe3ff', size = 76, sub }: { value: number; max?: number; label: string; color?: string; size?: number; sub?: string }) {
  const r = size / 2 - 5
  const c = 2 * Math.PI * r
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const k = mounted ? Math.max(0, Math.min(1, value / max)) : 0
  const ticks = Array.from({ length: 40 })
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {ticks.map((_, i) => {
            const a = (i / ticks.length) * Math.PI * 2
            const on = i / ticks.length < k
            const r1 = r + 3.5, r2 = r + 5
            return <line key={i} x1={size / 2 + Math.cos(a) * r1} y1={size / 2 + Math.sin(a) * r1} x2={size / 2 + Math.cos(a) * r2} y2={size / 2 + Math.sin(a) * r2} stroke={on ? color : 'rgba(255,255,255,.08)'} strokeWidth={1} style={{ transition: `stroke .3s ${i * 18}ms` }} />
          })}
          <circle cx={size / 2} cy={size / 2} r={r - 2} stroke="rgba(255,255,255,0.06)" strokeWidth={2} fill="none" />
          <circle className="gauge-ring" cx={size / 2} cy={size / 2} r={r - 2} stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - k)} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatedNumber value={value} decimals={1} className="font-display text-[19px] font-semibold tracking-tight text-white" />
        </div>
      </div>
      <span className="mt-1.5 text-[11px] font-medium text-[var(--tx)]">{label}</span>
      {sub && <span className="eyebrow !text-[8.5px] !tracking-[.16em]">{sub}</span>}
    </div>
  )
}

export function Card({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <section className={`neu spot fade-up rounded-2xl ${className}`} style={{ ['--d' as any]: `${delay}ms` }}>
      {children}
    </section>
  )
}

/** セクション見出し: 番号 + 英字アイブロウ + 日本語タイトル */
export function SectionTitle({ index, title, en, right }: { index?: string; title: string; en?: string; right?: ReactNode; icon?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-2">
      <div>
        <p className="eyebrow flex items-center gap-2">
          {index && <span className="num text-[var(--tx-2)]">{index}</span>}
          {index && <span className="h-px w-4 bg-[var(--line-2)]" />}
          <ScrambleText text={en ?? ''} duration={600} />
        </p>
        <h3 className="mt-1 text-[14px] font-semibold tracking-tight text-white">
          <KineticText text={title} />
        </h3>
      </div>
      {right}
    </div>
  )
}

export function Chip({ children, tone = 'mag', className = '' }: { children: ReactNode; tone?: 'mag' | 'cy' | 'mint' | 'sun' | 'mute'; className?: string }) {
  const dot = { mag: 'bg-[#ff5bd6]', cy: 'bg-[#4fe3ff]', mint: 'bg-emerald-300', sun: 'bg-amber-300', mute: 'bg-white/40' }[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--line-2)] bg-white/[0.025] px-2.5 py-[3px] text-[11px] font-medium text-[var(--tx)] ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-2.5 text-[12px] font-medium text-[var(--tx-2)]" aria-pressed={on}>
      <span className={`relative h-[18px] w-8 rounded-full border transition-colors duration-300 ${on ? 'border-transparent grad-bg' : 'border-[var(--line-2)] bg-white/5'}`}>
        <span className={`absolute top-[2px] h-3 w-3 rounded-full bg-white shadow transition-all duration-300 ${on ? 'left-[16px]' : 'left-[2px]'}`} style={{ transitionTimingFunction: 'var(--spring)' }} />
      </span>
      {label}
    </button>
  )
}
