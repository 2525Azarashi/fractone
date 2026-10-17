// 汎用UI部品: Kinetic Typography / アニメーション数値 / スライダー / セレクト / ゲージ
import { useEffect, useRef, useState, type ReactNode } from 'react'

/** 1文字ずつ跳ねて登場する Kinetic Typography */
export function KineticText({ text, className = '', wave = false, stagger = 38 }: { text: string; className?: string; wave?: boolean; stagger?: number }) {
  return (
    <span className={`${wave ? '' : 'kt-in'} ${className}`} aria-label={text} key={text}>
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          aria-hidden
          className={`${wave ? 'kt-letter' : ''} ${className.includes('grad-text') ? 'grad-text' : ''}`}
          style={{
            ['--i' as any]: i,
            animationDelay: wave ? undefined : `${i * stagger}ms`,
            // 単語全体で連続したグラデーションになるよう文字ごとに位置をずらす
            ...(className.includes('grad-text') ? { backgroundSize: `${text.length * 100}% 100%`, backgroundPosition: `${text.length > 1 ? (i / (text.length - 1)) * 100 : 0}% 0` } : {}),
          }}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
    </span>
  )
}

/** 値が変わるとカウントアップ/ダウンする数値 */
export function AnimatedNumber({ value, decimals = 0, suffix = '', className = '', duration = 700 }: { value: number; decimals?: number; suffix?: string; className?: string; duration?: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const [bump, setBump] = useState(0)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    const b = value
    if (a === b) return
    setBump((x) => x + 1)
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
    <span key={bump} className={`inline-block tabular-nums kt-swap ${className}`}>
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  )
}

export function Slider({
  label, value, min, max, step = 1, onChange, format, hint, tone = 'mag', icon,
}: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void
  format?: (v: number) => string; hint?: string; tone?: 'mag' | 'cy'; icon?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  const [pulse, setPulse] = useState(0)
  return (
    <label className="group block select-none" title={hint}>
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] font-bold text-violet-100/85">
          {icon && <span className="text-[13px] transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-12">{icon}</span>}
          {label}
        </span>
        <span key={pulse} className={`kt-swap rounded-full px-2 py-0.5 font-mono text-[10.5px] font-semibold ${tone === 'cy' ? 'bg-cyan-400/10 text-cyan-200' : 'bg-fuchsia-400/10 text-fuchsia-200'}`}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        className={`slider ${tone === 'cy' ? 'cy' : ''}`}
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
      {hint && <p className="mt-0.5 hidden text-[10px] leading-snug text-violet-200/45 group-hover:block">{hint}</p>}
    </label>
  )
}

export function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold text-violet-100/70">{label}</span>
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

/** 円形ゲージ (インフォグラフィック) */
export function Gauge({ value, max = 10, label, color = '#39e6ff', size = 78, sub }: { value: number; max?: number; label: string; color?: string; size?: number; sub?: string }) {
  const r = size / 2 - 7
  const c = 2 * Math.PI * r
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const k = mounted ? Math.max(0, Math.min(1, value / max)) : 0
  const gid = `g-${label}`
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id={gid} x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#ff4fd8" />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.07)" strokeWidth={7} fill="none" />
          <circle
            className="gauge-ring"
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={`url(#${gid})`}
            strokeWidth={7}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - k)}
            style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatedNumber value={value} decimals={1} className="font-display text-[17px] font-extrabold text-white" />
          <span className="text-[8.5px] font-bold text-violet-200/50">/ {max}</span>
        </div>
      </div>
      <span className="mt-1 text-[10.5px] font-bold text-violet-100/80">{label}</span>
      {sub && <span className="text-[9px] text-violet-200/45">{sub}</span>}
    </div>
  )
}

export function Card({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <section className={`neu fade-up rounded-[22px] ${className}`} style={{ ['--d' as any]: `${delay}ms` }}>
      {children}
    </section>
  )
}

export function SectionTitle({ icon, title, en, right }: { icon: string; title: string; en?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-[13px] font-extrabold text-white">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-fuchsia-500/30 to-violet-500/20 text-[13px] shadow-inner">{icon}</span>
        <KineticText text={title} />
        {en && <span className="font-display text-[9.5px] font-semibold uppercase tracking-[0.18em] text-violet-200/40">{en}</span>}
      </h3>
      {right}
    </div>
  )
}

export function Chip({ children, tone = 'mag', className = '' }: { children: ReactNode; tone?: 'mag' | 'cy' | 'mint' | 'sun'; className?: string }) {
  const tones = {
    mag: 'from-fuchsia-500/25 to-violet-500/20 text-fuchsia-100 border-fuchsia-300/20',
    cy: 'from-cyan-400/20 to-indigo-500/20 text-cyan-100 border-cyan-300/20',
    mint: 'from-emerald-400/20 to-teal-500/15 text-emerald-100 border-emerald-300/20',
    sun: 'from-amber-300/20 to-pink-400/15 text-amber-100 border-amber-200/20',
  }
  return <span className={`inline-flex items-center gap-1 rounded-full border bg-gradient-to-r px-2.5 py-1 text-[10.5px] font-bold ${tones[tone]} ${className}`}>{children}</span>
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-2 text-[11.5px] font-bold text-violet-100/80" aria-pressed={on}>
      <span className={`relative h-5 w-9 rounded-full transition-colors duration-300 ${on ? 'grad-bg' : 'bg-white/10'}`} style={{ boxShadow: 'inset 1px 1px 3px rgba(0,0,0,.5)' }}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-300 ${on ? 'left-[18px]' : 'left-0.5'}`} style={{ transitionTimingFunction: 'cubic-bezier(.3,1.6,.5,1)' }} />
      </span>
      {label}
    </button>
  )
}
