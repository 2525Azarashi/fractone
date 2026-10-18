// ============================================================
// fx.tsx — モーション/キネティック/インフォグラフィック用の小さな部品群
//  すべて React の再レンダーを最小化し、rAF + CSS 変数で DOM を直接更新する
// ============================================================
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const prefersReduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ------------------------------------------------------------------
 * ScrambleText — 文字が乱数列から「解読」されるキネティック・タイポ
 * ------------------------------------------------------------------ */
const GLYPH_LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>'
const GLYPH_JA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ音符律調拍旋'
export function ScrambleText({ text, className = '', duration = 700 }: { text: string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef('')
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReduced()) {
      el.textContent = text
      prev.current = text
      return
    }
    const from = prev.current
    const start = performance.now()
    let raf = 0
    const tail = 5
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      let s = ''
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        const reveal = k * (text.length + tail) - i
        if (reveal >= tail || ch === ' ') s += ch
        else if (reveal > 0) {
          const pool = ch.charCodeAt(0) > 255 ? GLYPH_JA : GLYPH_LATIN
          s += pool[Math.floor(Math.random() * pool.length)]
        } else s += from[i] ?? '\u00A0'
      }
      el.textContent = s
      if (k < 1) raf = requestAnimationFrame(step)
      else prev.current = text
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text, duration])
  return <span ref={ref} className={className} aria-label={text} />
}

/* ------------------------------------------------------------------
 * Magnetic — カーソルに吸い寄せられるボタン
 * ------------------------------------------------------------------ */
export function Magnetic({ children, strength = 0.22, className = '' }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el || e.pointerType !== 'mouse') return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - (r.left + r.width / 2)) * strength
    const y = (e.clientY - (r.top + r.height / 2)) * strength * 1.3
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`
  }
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = ''
  }
  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} className={`magnetic ${className}`}>
      {children}
    </div>
  )
}

/** カード上のスポットライト: 1つのグローバルリスナーで .spot 要素に --mx/--my を設定 */
export function useSpotlight() {
  useEffect(() => {
    let raf = 0
    let last: PointerEvent | null = null
    const apply = () => {
      raf = 0
      const e = last
      if (!e) return
      const el = (e.target as HTMLElement)?.closest?.('.spot') as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - r.left}px`)
      el.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    const on = (e: PointerEvent) => {
      last = e
      if (!raf) raf = requestAnimationFrame(apply)
    }
    window.addEventListener('pointermove', on, { passive: true })
    return () => {
      window.removeEventListener('pointermove', on)
      cancelAnimationFrame(raf)
    }
  }, [])
}

/* ------------------------------------------------------------------
 * ProximityWord — カーソルとの距離で文字の太さ(可変フォント)と位置が変化
 * ------------------------------------------------------------------ */
export function ProximityWord({ text, className = '', gradient = false, min = 260, max = 760, radius = 260, delay = 0 }: { text: string; className?: string; gradient?: boolean; min?: number; max?: number; radius?: number; delay?: number }) {
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = wrap.current
    if (!el || prefersReduced()) return
    const letters = Array.from(el.querySelectorAll<HTMLElement>('[data-l]'))
    const cur = letters.map(() => min)
    const target = letters.map(() => min)
    let mx = -9999, my = -9999
    let raf = 0
    const onMove = (e: PointerEvent) => {
      mx = e.clientX
      my = e.clientY
    }
    const tick = () => {
      letters.forEach((l, i) => {
        const r = l.getBoundingClientRect()
        const d = Math.hypot(mx - (r.left + r.width / 2), my - (r.top + r.height / 2))
        const k = Math.max(0, 1 - d / radius)
        target[i] = min + (max - min) * k * k
        cur[i] += (target[i] - cur[i]) * 0.14
        l.style.fontVariationSettings = `'wght' ${cur[i].toFixed(0)}`
        l.style.transform = `translateY(${(-k * 0.06).toFixed(3)}em)`
      })
      raf = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [min, max, radius])
  const chars = Array.from(text)
  return (
    <span ref={wrap} className={`inline-block ${className}`} aria-label={text}>
      {chars.map((c, i) => (
        <span key={i} className="kt-mask" aria-hidden>
          {/* 外側=立ち上がりアニメ / 内側=ウェイト・位置を rAF で制御 (競合させない) */}
          <span style={{ ['--d' as any]: `${delay + i * 55}ms` }}>
            <span
              data-l
              className={`inline-block ${gradient ? 'grad-text' : ''}`}
              style={{
                fontVariationSettings: `'wght' ${min}`,
                ...(gradient ? { backgroundSize: `${chars.length * 100}% 100%`, backgroundPosition: `${chars.length > 1 ? (i / (chars.length - 1)) * 100 : 0}% 0` } : {}),
              }}
            >
              {c}
            </span>
          </span>
        </span>
      ))}
    </span>
  )
}

/* ------------------------------------------------------------------
 * Delta — 直前の値からの変化を ▲▼ で一瞬表示 (パラメータ→結果の因果を可視化)
 * ------------------------------------------------------------------ */
export function Delta({ v, decimals = 1, suffix = '', threshold = 0.05, className = '' }: { v: number | null | undefined; decimals?: number; suffix?: string; threshold?: number; className?: string }) {
  if (v == null || !isFinite(v) || Math.abs(v) < threshold) return null
  const up = v > 0
  return (
    <span key={`${v.toFixed(3)}`} className={`delta num inline-flex items-center gap-0.5 rounded px-1 text-[9.5px] font-medium ${up ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'} ${className}`}>
      <svg width="7" height="7" viewBox="0 0 10 10" className={up ? '' : 'rotate-180'}><path d="M5 1 9 8H1z" fill="currentColor" /></svg>
      {up ? '+' : ''}
      {v.toFixed(decimals)}
      {suffix}
    </span>
  )
}

/* ------------------------------------------------------------------
 * useTween — 配列値を滑らかに補間 (レーダーチャート等のモーフィング)
 * ------------------------------------------------------------------ */
export function useTween(values: number[], duration = 900) {
  const [out, setOut] = useState(values.map(() => 0))
  const from = useRef(values.map(() => 0))
  const key = values.map((v) => v.toFixed(4)).join(',')
  useLayoutEffect(() => {
    const a = from.current.slice()
    const b = values
    const start = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      const e = 1 - Math.pow(1 - k, 3)
      const v = b.map((x, i) => (a[i] ?? 0) + (x - (a[i] ?? 0)) * e)
      from.current = v
      setOut(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, duration])
  return out
}

/* ------------------------------------------------------------------
 * Radar — 楽曲プロファイルのレーダー。前回の形を破線ゴーストで重ねて比較
 * ------------------------------------------------------------------ */
export function Radar({ axes, values, prev, size = 200 }: { axes: string[]; values: number[]; prev?: number[] | null; size?: number }) {
  const v = useTween(values)
  const C = size / 2
  const R = size / 2 - 26
  const pt = (i: number, k: number) => {
    const a = (i / axes.length) * Math.PI * 2 - Math.PI / 2
    return [C + Math.cos(a) * R * k, C + Math.sin(a) * R * k] as const
  }
  const poly = (arr: number[]) => arr.map((k, i) => pt(i, Math.max(0.02, Math.min(1, k))).map((n) => n.toFixed(1)).join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="block w-full">
      <defs>
        <linearGradient id="radarFill" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ff5bd6" stopOpacity=".38" />
          <stop offset="1" stopColor="#4fe3ff" stopOpacity=".22" />
        </linearGradient>
        <linearGradient id="radarStroke" x1="0" x2="1"><stop offset="0" stopColor="#ff5bd6" /><stop offset="1" stopColor="#4fe3ff" /></linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={poly(axes.map(() => k))} fill="none" stroke="rgba(255,255,255,.06)" strokeDasharray={k === 1 ? undefined : '2 3'} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1)
        return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="rgba(255,255,255,.06)" />
      })}
      {prev && <polygon points={poly(prev)} fill="none" stroke="rgba(255,255,255,.35)" strokeDasharray="3 3" strokeWidth={1} />}
      <polygon points={poly(v)} fill="url(#radarFill)" stroke="url(#radarStroke)" strokeWidth={1.4} strokeLinejoin="round" />
      {v.map((k, i) => {
        const [x, y] = pt(i, Math.max(0.02, Math.min(1, k)))
        return <circle key={i} cx={x} cy={y} r={2.4} fill="#0a0812" stroke="#fff" strokeWidth={1.2} />
      })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1.2)
        return (
          <text key={a} x={x} y={y + 3} fontSize={8.5} textAnchor="middle" fill="rgba(236,232,245,.55)" fontFamily="JetBrains Mono">
            {a}
          </text>
        )
      })}
    </svg>
  )
}
