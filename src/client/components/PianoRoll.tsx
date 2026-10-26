// ============================================================
// PianoRoll 可視化コンポーネント
//  Y軸 = 音程 / X軸 = 時間, 音符は長方形バー。再生ヘッド付き。
//  操作: ドラッグ移動 / 右端ドラッグで長さ変更 / ダブルクリックで追加
//        空白ドラッグで範囲選択 / Shift+クリックで複数選択 / Delete で削除
// ============================================================
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import type { Note } from '../../lib/types'
import type { Action, State } from '../state'
import { TIME_SIGS, inScale, isBlack, midiToName, uid } from '../../lib/theory'
import { audio } from '../../lib/audio-engine'
import { usePlayhead, setIdlePosition } from '../hooks/useTransport'
import type { HarmonyResult } from '../../lib/chord-generator'
import { FUNC_COLOR } from './NowPlaying'

const LOW = 36
const HIGH = 96
const ROW = 15
const LABEL_W = 54
const RULER_BASE = 34
const CHORD_LANE = 19

interface Drag {
  mode: 'move' | 'resize' | 'marquee'
  x0: number
  y0: number
  orig: Map<string, Note>
  anchor?: Note
  lastDb: number
  lastDp: number
  moved: boolean
}

function PianoRollImpl({ state, dispatch, harmony = null }: { state: State; dispatch: Dispatch<Action>; harmony?: HarmonyResult | null }) {
  const { sequence, params, selected, result, snap, generation } = state
  const spb = 60 / params.bpm
  const { beatsPerBar } = TIME_SIGS[params.timeSig]
  const [ppb, setPpb] = useState(46) // pixels per beat
  const scroller = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const headRulerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const noteEls = useRef(new Map<string, SVGGElement>())

  const contentBeats = sequence.reduce((m, n) => Math.max(m, (n.startTime + n.duration) / spb), 0)
  const totalBars = Math.max(16, Math.ceil(contentBeats / beatsPerBar) + 4)
  const totalBeats = totalBars * beatsPerBar
  const W = totalBeats * ppb
  const rows = HIGH - LOW + 1
  const H = rows * ROW
  const yOf = (m: number) => (HIGH - m) * ROW
  const selSet = useMemo(() => new Set(selected), [selected])
  const chords = harmony?.chords ?? []
  const RULER_H = RULER_BASE + (chords.length ? CHORD_LANE : 0)

  // 初回: ノートの平均音高が中央に来るようにスクロール
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const avg = sequence.length ? sequence.reduce((s, n) => s + n.midiNoteNumber, 0) / sequence.length : 66
    el.scrollTop = yOf(avg) - el.clientHeight / 2 + RULER_H
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 生成直後: AI ノートの先頭へ横スクロール
  useEffect(() => {
    if (!result || !scroller.current) return
    const x = result.startBeat * ppb - 120
    scroller.current.scrollTo({ left: Math.max(0, x), behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation])

  // 再生ヘッド (React 再レンダーなしで DOM 直接更新)
  const follow = useRef(true)
  usePlayhead((t, playing) => {
    const x = (t / spb) * ppb
    if (headRef.current) headRef.current.style.transform = `translateX(${x}px)`
    if (headRulerRef.current) headRulerRef.current.style.transform = `translateX(${x}px)`
    if (playing) {
      noteEls.current.forEach((el) => {
        const s = Number(el.dataset.s)
        const e = Number(el.dataset.e)
        const on = t >= s && t < e
        if (on !== (el.dataset.on === '1')) {
          el.dataset.on = on ? '1' : '0'
          el.classList.toggle('note-playing', on)
        }
      })
      const sc = scroller.current
      if (sc && follow.current) {
        const vx = x + LABEL_W - sc.scrollLeft
        if (vx > sc.clientWidth - 80 || vx < LABEL_W) sc.scrollLeft = x - 80
      }
    }
  })

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const snapB = (b: number) => Math.round(b / snap) * snap

  const onNoteDown = (e: React.PointerEvent, n: Note, mode: 'move' | 'resize') => {
    e.stopPropagation()
    if (e.button === 2) return
    let sel = selected
    if (e.shiftKey) {
      sel = selSet.has(n.id) ? selected.filter((x) => x !== n.id) : [...selected, n.id]
    } else if (!selSet.has(n.id)) {
      sel = [n.id]
    }
    dispatch({ type: 'select', ids: sel })
    const ids = new Set(sel.includes(n.id) ? sel : [n.id])
    const orig = new Map<string, Note>()
    sequence.forEach((x) => ids.has(x.id) && orig.set(x.id, x))
    const p = toLocal(e)
    drag.current = { mode, x0: p.x, y0: p.y, orig, anchor: n, lastDb: 0, lastDp: 0, moved: false }
    svgRef.current?.setPointerCapture(e.pointerId)
    audio.preview(n.midiNoteNumber, 0.25, n.velocity ?? 0.8)
  }

  const onBgDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const p = toLocal(e)
    if (!e.shiftKey) dispatch({ type: 'select', ids: [] })
    drag.current = { mode: 'marquee', x0: p.x, y0: p.y, orig: new Map(), lastDb: 0, lastDp: 0, moved: false }
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) {
      const p = toLocal(e)
      const midi = Math.round(HIGH - p.y / ROW + 0.5)
      const beat = Math.floor(p.x / ppb / snap) * snap
      // セルが変わった時だけ更新 (再レンダーを最小化)
      setHoverCell((h) => (h && h.midi === midi && h.beat === beat ? h : { x: beat * ppb, y: yOf(midi), midi, beat }))
      return
    }
    const p = toLocal(e)
    const dx = p.x - d.x0
    const dy = p.y - d.y0
    if (!d.moved && Math.hypot(dx, dy) < 3) return
    if (!d.moved) {
      d.moved = true
      if (d.mode !== 'marquee') dispatch({ type: 'commit' })
    }
    if (d.mode === 'marquee') {
      const r = { x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(dx), h: Math.abs(dy) }
      setMarquee(r)
      const b0 = r.x / ppb, b1 = (r.x + r.w) / ppb
      const m1 = HIGH - r.y / ROW, m0 = HIGH - (r.y + r.h) / ROW
      const ids = sequence
        .filter((n) => {
          const s = n.startTime / spb, en = (n.startTime + n.duration) / spb
          return en >= b0 && s <= b1 && n.midiNoteNumber + 1 >= m0 && n.midiNoteNumber <= m1
        })
        .map((n) => n.id)
      dispatch({ type: 'select', ids })
      return
    }
    const db = dx / ppb
    if (d.mode === 'move') {
      const a = d.anchor!
      const aStart = a.startTime / spb
      const newStart = Math.max(0, snapB(aStart + db))
      const sb = newStart - aStart
      const dp = Math.round(-dy / ROW)
      if (sb === d.lastDb && dp === d.lastDp) return
      if (dp !== d.lastDp) audio.preview(Math.max(LOW, Math.min(HIGH, a.midiNoteNumber + dp)), 0.18, 0.7)
      d.lastDb = sb
      d.lastDp = dp
      const upd: Note[] = []
      d.orig.forEach((n) => {
        upd.push({
          ...n,
          startTime: Math.max(0, (n.startTime / spb + sb) * spb),
          midiNoteNumber: Math.max(LOW, Math.min(HIGH, n.midiNoteNumber + dp)),
        })
      })
      dispatch({ type: 'updateNotes', notes: upd })
    } else {
      const upd: Note[] = []
      d.orig.forEach((n) => {
        const endB = snapB((n.startTime + n.duration) / spb + db)
        const dur = Math.max(snap, endB - n.startTime / spb)
        upd.push({ ...n, duration: dur * spb })
      })
      dispatch({ type: 'updateNotes', notes: upd })
    }
  }

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    setMarquee(null)
    try {
      svgRef.current?.releasePointerCapture(e.pointerId)
    } catch {}
    if (d && d.mode === 'marquee' && !d.moved) {
      // 単クリック → カーソル移動
      const t = (d.x0 / ppb) * spb
      dispatch({ type: 'cursor', t })
      setIdlePosition(t)
    }
  }

  const onDouble = (e: React.MouseEvent) => {
    const p = toLocal(e)
    const beat = Math.max(0, Math.floor(p.x / ppb / snap) * snap)
    const midi = Math.round(HIGH - p.y / ROW + 0.5)
    const n: Note = { id: uid('u'), midiNoteNumber: Math.max(LOW, Math.min(HIGH, midi)), startTime: beat * spb, duration: Math.max(snap, 0.5) * spb, velocity: 0.8, source: 'user' }
    dispatch({ type: 'addNotes', notes: [n] })
    dispatch({ type: 'select', ids: [n.id] })
    audio.preview(n.midiNoteNumber, 0.3)
  }

  const seekRuler = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const t = Math.max(0, ((e.clientX - r.left) / ppb) * spb)
    dispatch({ type: 'cursor', t })
    setIdlePosition(t)
  }

  // Ctrl+ホイールでズーム
  const onWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setPpb((z) => Math.max(18, Math.min(140, z * (e.deltaY > 0 ? 0.9 : 1.1))))
  }, [])
  useEffect(() => {
    const el = scroller.current
    el?.addEventListener('wheel', onWheel, { passive: false })
    return () => el?.removeEventListener('wheel', onWheel)
  }, [onWheel])

  // ---- 背景グリッド (memo) ----
  const grid = useMemo(() => {
    const rowsEls = []
    for (let m = HIGH; m >= LOW; m--) {
      const y = yOf(m)
      const inS = inScale(m, params.key, params.scale)
      rowsEls.push(
        <rect key={m} x={0} y={y} width={W} height={ROW} fill={isBlack(m) ? 'rgba(0,0,0,0.28)' : inS ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.008)'} />,
      )
      if (((m - params.key) % 12 + 12) % 12 === 0) rowsEls.push(<rect key={`t${m}`} x={0} y={y} width={W} height={ROW} fill="rgba(255,91,214,0.045)" />)
      rowsEls.push(<line key={`l${m}`} x1={0} x2={W} y1={y + ROW} y2={y + ROW} stroke={m % 12 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.035)'} />)
    }
    const cols = []
    for (let b = 0; b <= totalBeats; b += snap >= 0.5 ? 0.5 : 0.25) {
      const isBar = Math.abs(b % beatsPerBar) < 1e-6
      const isBeat = Math.abs(b - Math.round(b)) < 1e-6
      if (ppb < 30 && !isBeat) continue
      cols.push(<line key={b} x1={b * ppb} x2={b * ppb} y1={0} y2={H} stroke={isBar ? 'rgba(255,255,255,0.16)' : isBeat ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)'} />)
    }
    return (
      <g>
        {rowsEls}
        {cols}
      </g>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, ppb, params.key, params.scale, totalBeats, beatsPerBar, snap])

  // ---- 伴奏レイヤー (memo): 和音の構成音の行をうっすら色付け + 伴奏の音符を淡いバーで ----
  const chordLayer = useMemo(() => {
    if (!harmony || !harmony.chords.length) return null
    const tint = []
    for (const c of harmony.chords) {
      const x = c.startBeat * ppb, w = c.lengthBeats * ppb
      for (let m = HIGH; m >= LOW; m--) {
        if (!c.pcs.includes(((m % 12) + 12) % 12)) continue
        const root = ((m % 12) + 12) % 12 === c.root
        tint.push(<rect key={`t${c.startBeat}-${m}`} x={x} y={yOf(m)} width={w} height={ROW} fill={FUNC_COLOR[c.func]} opacity={root ? 0.07 : 0.035} />)
      }
    }
    return (
      <g pointerEvents="none">
        {tint}
        {harmony.notes.map((n) => {
          const x = (n.startTime / spb) * ppb
          const w = Math.max(3, (n.duration / spb) * ppb - 1)
          return <rect key={n.id} x={x} y={yOf(n.midiNoteNumber) + 3} width={w} height={ROW - 6} rx={2} fill="rgba(236,232,245,.13)" stroke="rgba(236,232,245,.22)" strokeWidth={0.5} />
        })}
      </g>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [harmony, ppb, spb])

  const form = result?.form ?? []
  const aiStart = result ? result.startBeat * ppb : null
  // 直前の生成が「演出あり」か「Live 再作曲」かを判定 (演出の切替用)
  const liveRef = useRef(false)
  const lastStatus = useRef(state.status)
  const [sweepKey, setSweepKey] = useState(0)
  useEffect(() => {
    // composing を経由した生成 = 本生成 → スイープ演出
    liveRef.current = lastStatus.current !== 'composing'
    if (!liveRef.current) setSweepKey((k) => k + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation])
  useEffect(() => {
    lastStatus.current = state.status
  }, [state.status])
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number; midi: number; beat: number } | null>(null)

  return (
    <div className="relative h-full">
      {/* zoom */}
      <div className="absolute bottom-3 right-3 z-40 flex items-center gap-0.5 rounded-lg border border-[var(--line)] bg-[#0d0a15]/85 p-0.5 backdrop-blur">
        <button className="h-6 w-6 rounded-md text-[13px] text-[var(--tx-2)] hover:bg-white/10 hover:text-white" onClick={() => setPpb((z) => Math.max(18, z / 1.2))} aria-label="縮小">−</button>
        <span className="num w-10 text-center text-[10px] text-[var(--tx-3)]">{Math.round(ppb)}px</span>
        <button className="h-6 w-6 rounded-md text-[13px] text-[var(--tx-2)] hover:bg-white/10 hover:text-white" onClick={() => setPpb((z) => Math.min(140, z * 1.2))} aria-label="拡大">＋</button>
      </div>
      <div ref={scroller} className="thin-scroll neu-inset h-full overflow-auto rounded-2xl" onPointerDown={() => (follow.current = true)}>
        <div className="relative" style={{ display: 'grid', gridTemplateColumns: `${LABEL_W}px ${W}px`, gridTemplateRows: `${RULER_H}px ${H}px` }}>
          {/* corner */}
          <div className="eyebrow sticky left-0 top-0 z-30 flex items-center justify-center border-b border-r border-[var(--line)] bg-[#0e0b16] !text-[8px]">
          </div>
          {/* ruler */}
          <div className="sticky top-0 z-20 cursor-pointer border-b border-[var(--line)] bg-[#0e0b16]/95 backdrop-blur" onPointerDown={seekRuler}>
            {Array.from({ length: totalBars }).map((_, i) => (
              <div key={i} className="num absolute top-0 h-full border-l border-white/10 pl-1.5 pt-1 text-[9.5px] text-[var(--tx-3)]" style={{ left: i * beatsPerBar * ppb }}>
                {i + 1}
              </div>
            ))}
            {/* 楽式ラベル */}
            {form.map((f, i) => (
              <div
                key={`${generation}-${i}`}
                className="pop-in num absolute flex h-[13px] items-center overflow-hidden rounded-[3px] border-l-2 border-white/60 pl-1.5 text-[9px] font-medium text-white/85"
                style={{
                  bottom: chords.length ? CHORD_LANE + 2 : 4,
                  left: f.startBeat * ppb + 2,
                  width: f.lengthBeats * ppb - 4,
                  background: f.transform === 'free' || f.transform === 'cadence' ? 'rgba(255,207,122,.14)' : 'rgba(79,227,255,.14)',
                  animationDelay: `${i * 90}ms`,
                }}
                title={`${f.label} — ${f.transform}`}
              >
                {f.label}
              </div>
            ))}
            {/* コード進行レーン: クリックで和音を試聴 */}
            {chords.map((c, i) => (
              <button
                key={`${c.startBeat}-${c.name}`}
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  // 根音を G3〜F#4 に置き、構成音を上に積む + 1オクターブ下にベース
                  const base = 55 + ((c.root - 7 + 12) % 12)
                  ;[base - 12, ...c.pcs.map((pc) => base + ((pc - c.root + 12) % 12))].forEach((m, k) => setTimeout(() => audio.preview(m, 0.9, 0.55), k * 22))
                }}
                className="chord-chip num absolute bottom-[3px] flex h-[15px] items-center gap-1 overflow-hidden rounded-[4px] pl-1.5 text-left text-[9.5px] font-semibold text-white"
                style={{
                  left: c.startBeat * ppb + 2,
                  width: Math.max(10, c.lengthBeats * ppb - 4),
                  ['--fc' as any]: FUNC_COLOR[c.func],
                  animationDelay: `${Math.min(900, i * 45)}ms`,
                }}
                title={`${c.name} (${c.roman}) — メロディとの一致 ${Math.round(c.fit * 100)}%`}
              >
                <span className="truncate">{c.name}</span>
                {c.lengthBeats * ppb > 70 && <span className="truncate font-normal text-white/45">{c.roman}</span>}
              </button>
            ))}
            <div ref={headRulerRef} className="pointer-events-none absolute left-0 top-0 h-full" style={{ willChange: 'transform' }}>
              <div className="absolute -left-[6px] top-0 h-0 w-0 border-x-[6px] border-t-[9px] border-x-transparent border-t-white" />
            </div>
          </div>
          {/* key labels */}
          <div className="sticky left-0 z-20 border-r border-[var(--line)] bg-[#0e0b16]">
            {Array.from({ length: rows }).map((_, i) => {
              const m = HIGH - i
              const active = state.activeKeys.includes(m) || state.aiKeys.includes(m)
              return (
                <div
                  key={m}
                  onPointerDown={() => audio.preview(m, 0.3)}
                  className={`flex cursor-pointer items-center justify-end pr-1.5 font-mono text-[8.5px] transition-colors duration-100 ${isBlack(m) ? 'bg-[#0a0810] text-white/25' : 'bg-[#15111e] text-white/45'} ${m % 12 === 0 ? 'font-semibold !text-white/80' : ''}`}
                  style={{ height: ROW, borderBottom: '1px solid rgba(0,0,0,.4)', background: active ? 'linear-gradient(90deg,transparent,rgba(255,91,214,.55))' : undefined, color: active ? '#fff' : undefined }}
                >
                  {m % 12 === 0 || !isBlack(m) ? midiToName(m) : ''}
                </div>
              )
            })}
          </div>
          {/* grid + notes */}
          <div className="relative">
            <svg
              ref={svgRef}
              width={W}
              height={H}
              className="block touch-none select-none"
              onPointerDown={onBgDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={() => setHoverCell(null)}
              onDoubleClick={onDouble}
            >
              <defs>
                <linearGradient id="gUser" x1="0" x2="1">
                  <stop offset="0%" stopColor="#ff5bd6" />
                  <stop offset="100%" stopColor="#c04bff" />
                </linearGradient>
                <linearGradient id="gAi" x1="0" x2="1">
                  <stop offset="0%" stopColor="#4fe3ff" />
                  <stop offset="100%" stopColor="#6b7bff" />
                </linearGradient>
                <pattern id="aiHatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(79,227,255,0.035)" strokeWidth="4" />
                </pattern>
              </defs>
              {grid}
              {chordLayer}
              {aiStart !== null && <rect x={aiStart} y={0} width={Math.max(0, W - aiStart)} height={H} fill="url(#aiHatch)" pointerEvents="none" />}
              {aiStart !== null && <line x1={aiStart} x2={aiStart} y1={0} y2={H} stroke="#4fe3ff" strokeDasharray="2 4" strokeOpacity={0.5} pointerEvents="none" />}
              {sequence.map((n, idx) => {
                const x = (n.startTime / spb) * ppb
                const w = Math.max(6, (n.duration / spb) * ppb - 1)
                const y = yOf(n.midiNoteNumber) + 1
                const sel = selSet.has(n.id)
                const ai = n.source === 'ai'
                const motif = n.tag?.includes('•')
                const vel = n.velocity ?? 0.8
                return (
                  <g
                    key={n.id}
                    ref={(el) => {
                      if (el) noteEls.current.set(n.id, el)
                      else noteEls.current.delete(n.id)
                    }}
                    data-s={n.startTime}
                    data-e={n.startTime + n.duration}
                    className={ai && n.id.startsWith('ai') ? (state.status === 'done' || state.status === 'idle' ? (liveRef.current ? 'note-fade' : 'note-pop') : 'note-pop') : ''}
                    style={{ ['--d' as any]: `${Math.min(1400, (idx % 200) * 14)}ms`, cursor: 'grab' }}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={ROW - 2}
                      rx={3}
                      fill={ai ? 'url(#gAi)' : 'url(#gUser)'}
                      fillOpacity={0.55 + vel * 0.45}
                      stroke={sel ? '#fff' : 'rgba(255,255,255,0.18)'}
                      strokeWidth={sel ? 1.5 : 0.6}
                      style={{ filter: sel ? 'drop-shadow(0 0 5px rgba(255,255,255,.55))' : ai ? 'drop-shadow(0 2px 6px rgba(79,227,255,.25))' : 'drop-shadow(0 2px 6px rgba(255,91,214,.25))' }}
                      onPointerDown={(e) => onNoteDown(e, n, 'move')}
                    />
                    {/* ベロシティ表示 */}
                    {/* ベロシティ: 左端の縦バー (高さ = 強さ) */}
                    <rect x={x + 1.5} y={y + 1.5 + (ROW - 5) * (1 - vel)} width={1.6} height={Math.max(1.5, (ROW - 5) * vel)} rx={0.8} fill="rgba(255,255,255,.75)" pointerEvents="none" />
                    {motif && <circle cx={x + w - 5} cy={y + (ROW - 2) / 2} r={1.8} fill="#fff" opacity={0.9} pointerEvents="none" />}
                    {w > 30 && (
                      <text x={x + 6} y={y + 9.8} fontSize={8} fontWeight={500} fill="rgba(255,255,255,.9)" pointerEvents="none" fontFamily="JetBrains Mono">
                        {midiToName(n.midiNoteNumber)}
                      </text>
                    )}
                    {/* リサイズハンドル */}
                    <rect x={x + w - 6} y={y} width={7} height={ROW - 2} fill="transparent" style={{ cursor: 'ew-resize' }} onPointerDown={(e) => onNoteDown(e, n, 'resize')} />
                  </g>
                )
              })}
              {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(255,91,214,0.08)" stroke="#ff5bd6" strokeDasharray="3 3" rx={3} />}
              {/* ホバー行・列のクロスヘア */}
              {hoverCell && !drag.current && (
                <g pointerEvents="none">
                  <rect x={0} y={yOf(hoverCell.midi)} width={W} height={ROW} fill="rgba(255,255,255,0.025)" />
                  <rect x={hoverCell.x} y={hoverCell.y + 1} width={Math.max(4, snap * ppb * 2 - 1)} height={ROW - 2} rx={3} fill="none" stroke="rgba(255,255,255,.28)" strokeDasharray="2 2" />
                </g>
              )}
            </svg>
            {/* 生成直後: AI 領域を光が走査 */}
            {aiStart !== null && sweepKey > 0 && <div key={sweepKey} className="sweep" style={{ left: aiStart, ['--sw' as any]: `${Math.max(400, W - aiStart)}px` }} />}
            {hoverCell && !drag.current && (
              <div className="num pointer-events-none absolute z-10 rounded-md border border-[var(--line-2)] bg-[#0d0a15]/90 px-1.5 py-0.5 text-[9.5px] text-white backdrop-blur" style={{ left: hoverCell.x + snap * ppb * 2 + 6, top: hoverCell.y - 4 }}>
                {midiToName(hoverCell.midi)} · {(Math.floor(hoverCell.beat / beatsPerBar) + 1)}.{(Math.floor(hoverCell.beat) % beatsPerBar) + 1}
              </div>
            )}
            {/* playhead */}
            <div ref={headRef} className="pointer-events-none absolute left-0 top-0 h-full" style={{ willChange: 'transform' }}>
              <div className="absolute -left-px top-0 h-full w-px bg-white" style={{ boxShadow: '0 0 10px rgba(79,227,255,.9), 0 0 2px #fff' }} />
            </div>
          </div>
        </div>
      </div>
      {sequence.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="mt-2 text-[14px] font-medium text-[var(--tx)]">鍵盤を弾くか、グリッドをダブルクリックして音符を置く</p>
          <p className="mt-1 text-[11.5px] text-[var(--tx-3)]">録音ボタン（R）でリアルタイム入力もできます</p>
        </div>
      )}
    </div>
  )
}

export const PianoRoll = memo(PianoRollImpl)
