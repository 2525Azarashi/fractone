// ============================================================
// patterns.tsx — モバイル由来のインタラクション・パターン
//   Toaster      : スタック/スワイプで消去/残り時間バー/アクション(元に戻す 等)
//   Skeleton     : 読み込み中のシマー付きプレースホルダ
//   BottomSheet  : ドラッグで開閉・スナップ (half / full)・慣性で閉じる
//   SwipeRow     : 左右スワイプで行アクション (しきい値でハプティクス風の弾み)
//   PullToRefresh: 引っ張ると中点変位カーブが再帰的に描かれ、離すと再生成
//   (AutoComplete はコマンドパレットとして CommandPalette.tsx)
// すべてポインタイベントで実装 (タッチ / マウス / ペン共通)
// ============================================================
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { midpointDisplace } from '../../lib/midpoint-displace'
import { createRng } from '../../lib/theory'

const vibrate = (ms: number) => { try { navigator.vibrate?.(ms) } catch {} }

/* ==================================================================
 * Toaster
 * ================================================================== */
export interface ToastItem {
  id: number
  text: string
  tone: 'mag' | 'cy' | 'mint' | 'warn'
  action?: { label: string; run: () => void }
  ms?: number
}

export function useToaster() {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((text: string, tone: ToastItem['tone'] = 'mag', opt: { action?: ToastItem['action']; ms?: number } = {}) => {
    const id = Date.now() + Math.random()
    setItems((t) => [...t.slice(-3), { id, text, tone, ...opt }])
    return id
  }, [])
  const dismiss = useCallback((id: number) => setItems((t) => t.filter((x) => x.id !== id)), [])
  return { items, push, dismiss }
}

const TONE: Record<ToastItem['tone'], string> = { mag: '#ff5bd6', cy: '#4fe3ff', mint: '#7af0c4', warn: '#ffcf7a' }

function ToastCard({ t, index, total, onDismiss }: { t: ToastItem; index: number; total: number; onDismiss: () => void }) {
  const ms = t.ms ?? (t.action ? 5200 : 2800)
  const el = useRef<HTMLDivElement>(null)
  const [leaving, setLeaving] = useState<0 | 1 | -1 | 2>(0) // 2 = 時間切れ
  const [paused, setPaused] = useState(false)
  const drag = useRef<{ x0: number; dx: number; id: number } | null>(null)
  const remain = useRef(ms)
  const since = useRef(performance.now())

  // 残り時間: ホバー/ドラッグ中は一時停止
  useEffect(() => {
    if (leaving) return
    if (paused) { remain.current -= performance.now() - since.current; return }
    since.current = performance.now()
    const id = setTimeout(() => setLeaving(2), Math.max(0, remain.current))
    return () => clearTimeout(id)
  }, [paused, leaving])
  useEffect(() => {
    if (!leaving) return
    const id = setTimeout(onDismiss, 320)
    return () => clearTimeout(id)
  }, [leaving, onDismiss])

  const depth = total - 1 - index // 0 = 最前面
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x0: e.clientX, dx: 0, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setPaused(true)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !el.current) return
    d.dx = e.clientX - d.x0
    el.current.style.transition = 'none'
    el.current.style.transform = `translateX(${d.dx}px) rotate(${d.dx / 40}deg)`
    el.current.style.opacity = String(1 - Math.min(1, Math.abs(d.dx) / 220))
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!el.current || !d) return
    el.current.style.transition = ''
    if (Math.abs(d.dx) > 90) { vibrate(8); setLeaving(d.dx > 0 ? 1 : -1) }
    else { el.current.style.transform = ''; el.current.style.opacity = ''; setPaused(false) }
  }

  return (
    <div
      ref={el}
      role="status"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => !drag.current && setPaused(false)}
      className={`toast-card pointer-events-auto relative flex w-[min(92vw,380px)] touch-pan-y select-none items-center gap-3 overflow-hidden rounded-2xl border border-[var(--line-2)] bg-[#14101e]/92 py-2.5 pl-4 pr-2 text-[12px] font-medium text-white shadow-2xl backdrop-blur-xl ${leaving === 1 ? 'toast-out-r' : leaving === -1 ? 'toast-out-l' : leaving === 2 ? 'toast-out' : 'toast-in'}`}
      style={{ ['--depth' as any]: depth, zIndex: 10 - depth }}
    >
      <i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE[t.tone], boxShadow: `0 0 10px ${TONE[t.tone]}` }} />
      <span className="min-w-0 flex-1 leading-snug">{t.text}</span>
      {t.action && (
        <button
          className="shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-colors hover:bg-white/10"
          style={{ color: TONE[t.tone] }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => { t.action!.run(); setLeaving(2) }}
        >
          {t.action.label}
        </button>
      )}
      <button className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--tx-3)] hover:bg-white/10 hover:text-white" onPointerDown={(e) => e.stopPropagation()} onClick={() => setLeaving(2)} aria-label="閉じる">
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l6 6M8 2 2 8" /></svg>
      </button>
      {/* 残り時間バー */}
      <span className="toast-timer absolute bottom-0 left-0 h-[2px]" style={{ background: TONE[t.tone], animationDuration: `${ms}ms`, animationPlayState: paused || leaving ? 'paused' : 'running' }} />
    </div>
  )
}

export function Toaster({ items, dismiss, raised = false }: { items: ToastItem[]; dismiss: (id: number) => void; raised?: boolean }) {
  return (
    <div style={{ bottom: raised ? 84 : 20, transition: 'bottom .4s var(--spring)' }} className="pointer-events-none fixed left-1/2 z-[95] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {items.map((t, i) => <ToastCard key={t.id} t={t} index={i} total={items.length} onDismiss={() => dismiss(t.id)} />)}
    </div>
  )
}

/* ==================================================================
 * Skeleton
 * ================================================================== */
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden className={`skeleton block rounded-md ${className}`} style={style} />
}

/* ==================================================================
 * BottomSheet — ドラッグで高さを変え、half / full にスナップ。速く下へ払うと閉じる
 * ================================================================== */
export function BottomSheet({ open, onClose, title, eyebrow, children, footer }: { open: boolean; onClose: () => void; title: string; eyebrow?: string; children: ReactNode; footer?: ReactNode }) {
  const [mounted, setMounted] = useState(open)
  const [snap, setSnap] = useState<'half' | 'full'>('half')
  const sheet = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y0: number; h0: number; last: number; t: number; v: number } | null>(null)

  useEffect(() => {
    if (open) { setMounted(true); setSnap('half') }
    else if (mounted) { const id = setTimeout(() => setMounted(false), 380); return () => clearTimeout(id) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [open, onClose])

  const heights = () => ({ half: Math.min(window.innerHeight * 0.56, 560), full: window.innerHeight * 0.92 })
  const onDown = (e: React.PointerEvent) => {
    const el = sheet.current
    if (!el) return
    drag.current = { y0: e.clientY, h0: el.getBoundingClientRect().height, last: e.clientY, t: performance.now(), v: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    el.style.transition = 'none'
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current, el = sheet.current
    if (!d || !el) return
    const now = performance.now()
    d.v = (e.clientY - d.last) / Math.max(1, now - d.t) // px/ms (下向き正)
    d.last = e.clientY
    d.t = now
    const H = heights()
    let h = d.h0 - (e.clientY - d.y0)
    if (h > H.full) h = H.full + (h - H.full) * 0.2 // 上限でゴムのような抵抗
    el.style.height = `${Math.max(60, h)}px`
  }
  const onUp = () => {
    const d = drag.current, el = sheet.current
    drag.current = null
    if (!d || !el) return
    el.style.transition = ''
    const H = heights()
    const h = el.getBoundingClientRect().height
    el.style.height = ''
    const dy = h - d.h0 // 正 = 上へ広げた
    // 閉じる: 速く払う / half より大きく下げた / full から大きく下げた
    if (d.v > 0.6 || h < H.half * 0.7 || (d.h0 < H.half + 40 && dy < -110)) { onClose(); return }
    if (d.v < -0.5 || (dy > 90 && d.h0 < H.full - 40)) { setSnap('full'); vibrate(6); return }
    if (dy < -90 && d.h0 > H.half + 40) { setSnap('half'); return }
    setSnap(Math.abs(h - H.full) < Math.abs(h - H.half) ? 'full' : 'half')
  }

  if (!mounted) return null
  return (
    <div className={`fixed inset-0 z-[92] ${open ? '' : 'pointer-events-none'}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`sheet-scrim absolute inset-0 bg-[#07050c]/70 ${open ? 'on' : ''}`} onClick={onClose} />
      <div
        ref={sheet}
        className={`sheet absolute inset-x-0 bottom-0 mx-auto flex max-w-[720px] flex-col overflow-hidden rounded-t-[26px] border border-b-0 border-[var(--line-2)] bg-[#120e1b]/95 shadow-[0_-30px_80px_rgba(0,0,0,.6)] backdrop-blur-xl ${open ? 'on' : ''}`}
        style={{ height: snap === 'full' ? '92vh' : 'min(56vh, 560px)' }}
      >
        <div className="shrink-0 cursor-grab touch-none px-5 pb-3 pt-2.5 active:cursor-grabbing" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={() => setSnap((s) => (s === 'full' ? 'half' : 'full'))}>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
          <div className="flex items-end justify-between">
            <div>
              {eyebrow && <p className="text-[11px] text-[var(--tx-3)]">{eyebrow}</p>}
              <h3 className="mt-1 font-display text-[20px] font-semibold tracking-tight text-white">{title}</h3>
            </div>
            <button className="btn-ghost rounded-lg px-3 py-1.5 text-[11.5px]" onPointerDown={(e) => e.stopPropagation()} onClick={onClose}>閉じる</button>
          </div>
        </div>
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-[var(--line)] px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/* ==================================================================
 * SwipeRow — 右へ: leftAction / 左へ: rightAction。しきい値を越えると色が満ちて確定
 * ================================================================== */
interface SwipeAct { label: string; icon?: ReactNode; color: string; run: () => void }
export function SwipeRow({ children, left, right, onTap }: { children: ReactNode; left?: SwipeAct; right?: SwipeAct; onTap?: () => void }) {
  const row = useRef<HTMLDivElement>(null)
  const fg = useRef<HTMLDivElement>(null)
  const st = useRef<{ x0: number; y0: number; dx: number; axis: '' | 'x' | 'y'; armed: boolean } | null>(null)
  const [dir, setDir] = useState<0 | 1 | -1>(0)
  const [armed, setArmed] = useState(false)
  const [gone, setGone] = useState(false)
  const TH = 88

  const onDown = (e: React.PointerEvent) => {
    st.current = { x0: e.clientX, y0: e.clientY, dx: 0, axis: '', armed: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const s = st.current
    if (!s || !fg.current) return
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0
    if (!s.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (s.axis === 'x') (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    if (s.axis !== 'x') return
    let x = dx
    if ((x > 0 && !left) || (x < 0 && !right)) x *= 0.15 // アクションが無い方向は抵抗
    if (Math.abs(x) > TH) x = Math.sign(x) * (TH + (Math.abs(x) - TH) * 0.45)
    s.dx = x
    fg.current.style.transition = 'none'
    fg.current.style.transform = `translateX(${x}px)`
    const d = x > 0 ? 1 : x < 0 ? -1 : 0
    setDir(d as 0 | 1 | -1)
    const a = Math.abs(x) >= TH && !!(x > 0 ? left : right)
    if (a !== s.armed) { s.armed = a; setArmed(a); if (a) vibrate(10) }
  }
  const onUp = () => {
    const s = st.current
    st.current = null
    if (!fg.current) return
    if (!s || !s.axis) { onTap?.(); return }
    if (s.axis !== 'x') return
    fg.current.style.transition = ''
    const act = s.dx > 0 ? left : right
    if (s.armed && act) {
      const destructive = act === right
      if (destructive) {
        fg.current.style.transform = `translateX(${Math.sign(s.dx) * 120}%)`
        setGone(true)
        setTimeout(act.run, 260)
      } else {
        fg.current.style.transform = ''
        act.run()
      }
    } else fg.current.style.transform = ''
    setArmed(false)
    setTimeout(() => setDir(0), 300)
  }
  const act = dir > 0 ? left : dir < 0 ? right : undefined
  return (
    <div ref={row} className={`swipe-row ${gone ? 'gone' : ''}`}>
      <div className="relative overflow-hidden rounded-xl">
        {act && (
          <div className={`absolute inset-0 flex items-center px-5 text-[11.5px] font-semibold transition-colors duration-200 ${dir > 0 ? 'justify-start' : 'justify-end'}`} style={{ background: armed ? act.color : 'rgba(255,255,255,.05)', color: armed ? '#0a0812' : act.color }}>
            <span className={`flex items-center gap-2 transition-transform duration-300 ${armed ? 'scale-110' : 'scale-90 opacity-70'}`} style={{ transitionTimingFunction: 'var(--spring)' }}>{act.icon}{act.label}</span>
          </div>
        )}
        <div ref={fg} className="relative touch-pan-y select-none rounded-xl bg-[#16111f] transition-transform duration-300" style={{ transitionTimingFunction: 'var(--spring)' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {children}
        </div>
      </div>
    </div>
  )
}

/* ==================================================================
 * PullToRefresh — 指定要素の上端で下へ引くと、引いた量に応じて
 *   中点変位の階層が 0→6 まで描かれる。しきい値を越えて離すと onRefresh
 * ================================================================== */
const PTR_MPD = midpointDisplace({ start: 0, end: 0, depth: 6, displacement: 1, roughness: 0.6, min: -1.4, max: 1.4, rng: createRng(7) })
export function PullToRefresh({ onRefresh, children, disabled, label = '引っ張って別案を作曲' }: { onRefresh: () => Promise<void> | void; children: ReactNode; disabled?: boolean; label?: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const pullRef = useRef(0)
  const cfg = useRef({ disabled, busy, onRefresh })
  cfg.current = { disabled, busy, onRefresh }
  const TH = 92

  // touchmove は passive:false で登録し、引っ張り中だけネイティブのスクロール/更新を止める
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    let st: { y0: number; x0: number; on: boolean } | null = null
    const set = (v: number) => {
      if (pullRef.current < TH && v >= TH) vibrate(12)
      pullRef.current = v
      setPull(v)
    }
    const start = (e: TouchEvent) => {
      const c = cfg.current
      if (c.disabled || c.busy || e.touches.length > 1 || window.scrollY > 2) return
      // ピアノロール・鍵盤・スライダーの上では作動させない (演奏・編集を優先)
      if ((e.target as HTMLElement).closest('[data-no-ptr], input, select, textarea')) return
      st = { y0: e.touches[0].clientY, x0: e.touches[0].clientX, on: false }
    }
    const move = (e: TouchEvent) => {
      if (!st) return
      const dy = e.touches[0].clientY - st.y0, dx = e.touches[0].clientX - st.x0
      if (!st.on) {
        if (dy > 8 && dy > Math.abs(dx) * 1.4 && window.scrollY <= 2) { st.on = true; setDragging(true) }
        else if (Math.abs(dx) > 10 || dy < -6) { st = null; return }
        else return
      }
      e.preventDefault()
      // 引くほど重くなる (ラバーバンド)
      set(Math.min(170, 170 * (1 - Math.exp(-Math.max(0, dy) / 260))))
    }
    const end = async () => {
      const was = st?.on
      st = null
      if (!was) return
      setDragging(false)
      if (pullRef.current >= TH) {
        setBusy(true)
        set(64)
        try { await cfg.current.onRefresh() } finally {
          setTimeout(() => { setBusy(false); set(0) }, 380)
        }
      } else set(0)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [])

  const k = Math.min(1, pull / TH)
  const lv = busy ? 6 : Math.floor(k * 6)
  const pts: string[] = []
  PTR_MPD.values.forEach((v, i) => { if (PTR_MPD.levels[i] <= lv) pts.push(`${((i / 64) * 120).toFixed(1)},${(18 - v * 11).toFixed(1)}`) })
  const tr = dragging ? 'none' : undefined
  return (
    <div ref={wrap} className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center overflow-hidden" style={{ height: pull, opacity: k, transition: tr ?? 'height .45s var(--spring), opacity .3s' }} aria-hidden={!pull}>
        <div className="mb-2 mt-auto flex flex-col items-center gap-1">
          <svg width="120" height="36" viewBox="0 0 120 36" className={busy ? 'ptr-busy' : ''}>
            <defs><linearGradient id="ptrg" x1="0" x2="1"><stop offset="0" stopColor="#ff5bd6" /><stop offset="1" stopColor="#4fe3ff" /></linearGradient></defs>
            <path d={'M' + pts.join(' L')} fill="none" stroke="url(#ptrg)" strokeWidth="1.6" strokeLinejoin="round" />
            {PTR_MPD.values.map((v, i) => (PTR_MPD.levels[i] <= Math.min(lv, 3) ? <circle key={i} cx={(i / 64) * 120} cy={18 - v * 11} r={PTR_MPD.levels[i] === 0 ? 2.4 : 1.6} fill="#0a0812" stroke="#fff" strokeWidth="1" /> : null))}
          </svg>
          <span className="num text-[10px] text-[var(--tx-2)]">{busy ? '作曲中…' : k >= 1 ? '離して作曲' : `${label} · Lv${lv}`}</span>
        </div>
      </div>
      <div style={pull ? { transform: `translateY(${pull}px)`, transition: tr ?? 'transform .45s var(--spring)' } : { transition: 'transform .45s var(--spring)' }}>{children}</div>
    </div>
  )
}
