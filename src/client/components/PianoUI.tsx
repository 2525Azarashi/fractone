// ============================================================
// PianoUI — 仮想ピアノ鍵盤 (各鍵盤 = 独立した PianoKey コンポーネント)
//  マウス/タッチ (pointer) & PCキーボード (keydown/keyup) に反応
// ============================================================
import { memo, useEffect, useRef, useState } from 'react'
import { isBlack, midiToName, inScale } from '../../lib/theory'
import type { ScaleName } from '../../lib/types'

/** PCキーボード → 基準オクターブからの半音オフセット */
export const KEYMAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ';': 16, "'": 17, ']': 18,
}
const LABEL_BY_OFFSET = Object.fromEntries(Object.entries(KEYMAP).map(([k, v]) => [v, k.toUpperCase()]))

interface KeyProps {
  midi: number
  on: boolean
  ai: boolean
  label?: string
  inKey: boolean
  isTonic: boolean
  onPress: (m: number) => void
  onRelease: (m: number) => void
  style?: React.CSSProperties
}

export const PianoKey = memo(function PianoKey({ midi, on, ai, label, inKey, isTonic, onPress, onRelease, style }: KeyProps) {
  const black = isBlack(midi)
  const down = useRef(false)
  // 打鍵パーティクル: 押された瞬間に1粒放出 (ユーザー=マゼンタ / AI=シアン)
  const [parts, setParts] = useState<{ id: number; dx: number; ai: boolean }[]>([])
  const lit = on || ai
  useEffect(() => {
    if (!lit) return
    const id = Date.now() + Math.random()
    setParts((p) => [...p.slice(-3), { id, dx: (Math.random() - 0.5) * 26, ai: !on && ai }])
    // 鍵盤を離しても粒は最後まで飛ばす (クリーンアップで止めない)
    setTimeout(() => setParts((p) => p.filter((x) => x.id !== id)), 1150)
  }, [lit, on, ai])
  const press = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId) // グリッサンド可能に
    down.current = true
    onPress(midi)
  }
  const release = () => {
    if (!down.current) return
    down.current = false
    onRelease(midi)
  }
  return (
    <button
      type="button"
      aria-label={midiToName(midi)}
      data-on={on}
      data-ai={!on && ai}
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerEnter={(e) => {
        if (e.buttons === 1) {
          down.current = true
          onPress(midi)
        }
      }}
      className={`${black ? 'key-black absolute z-10 rounded-b-[5px]' : 'key-white relative rounded-b-[7px]'} flex touch-none select-none flex-col items-center justify-end outline-none`}
      style={style}
    >
      {parts.map((p) => (
        <span key={p.id} className="particle" style={{ left: '50%', ['--dx' as any]: `${p.dx}px`, background: p.ai ? '#4fe3ff' : '#ff5bd6', boxShadow: `0 0 10px ${p.ai ? '#4fe3ff' : '#ff5bd6'}` }} />
      ))}
      {on && <span className="pop-in num pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded-md bg-[#0d0a15] px-1.5 py-0.5 text-[9px] font-medium text-white ring-1 ring-white/15">{midiToName(midi)}</span>}
      {!black && inKey && <span className={`mb-1 h-1.5 w-1.5 rounded-full ${isTonic ? 'bg-[#ff5bd6]' : 'bg-black/15'}`} />}
      {black && inKey && <span className="mb-1 h-1 w-1 rounded-full bg-black/20" />}
      {label && <span className={`mb-1.5 font-mono text-[9px] font-medium ${black ? 'text-[var(--tx-3)]' : 'text-black/35'}`}>{label}</span>}
      {!black && midi % 12 === 0 && <span className="mb-1 text-[8.5px] font-semibold text-black/45">{midiToName(midi)}</span>}
    </button>
  )
})

export function PianoUI({
  low, high, activeKeys, aiKeys, baseOctave, keyRoot, scale, onPress, onRelease,
}: {
  low: number; high: number; activeKeys: number[]; aiKeys: number[]; baseOctave: number; keyRoot: number; scale: ScaleName
  onPress: (m: number) => void; onRelease: (m: number) => void
}) {
  const whites: number[] = []
  for (let m = low; m <= high; m++) if (!isBlack(m)) whites.push(m)
  const wPct = 100 / whites.length
  const baseMidi = (baseOctave + 1) * 12
  const act = new Set(activeKeys)
  const ai = new Set(aiKeys)
  const keys = []
  for (let m = low; m <= high; m++) {
    const off = m - baseMidi
    const label = LABEL_BY_OFFSET[off]
    const common = {
      midi: m, on: act.has(m), ai: ai.has(m), label, inKey: inScale(m, keyRoot, scale),
      isTonic: ((m - keyRoot) % 12 + 12) % 12 === 0, onPress, onRelease,
    }
    if (isBlack(m)) {
      const wi = whites.findIndex((w) => w > m)
      keys.push(<PianoKey key={m} {...common} style={{ left: `calc(${wi * wPct}% - ${wPct * 0.32}%)`, width: `${wPct * 0.64}%`, height: '60%', top: 0 }} />)
    } else {
      keys.push(<PianoKey key={m} {...common} style={{ width: `${wPct}%`, height: '100%' }} />)
    }
  }
  return (
    <div className="relative flex h-full w-full gap-[2px] px-1 pt-1">
      {keys}
    </div>
  )
}
