// ピッチ可視化: 音符を点と線で描くグラフ + 中点変位トレース(階層ごとの色) + マクロ骨格
import { memo, useMemo, useRef, useState } from 'react'
import type { ComposeResult, Note, ScaleName } from '../../lib/types'
import { midiToName, inScale } from '../../lib/theory'
import { usePlayhead } from '../hooks/useTransport'

const LEVEL_COLORS = ['#ffffff', '#ff5bd6', '#c04bff', '#8b5cff', '#6b7bff', '#4fb8ff', '#4fe3ff', '#7af0c4', '#ffcf7a']

function PitchVizImpl({ sequence, result, bpm, keyRoot, scale, generation }: { sequence: Note[]; result: ComposeResult | null; bpm: number; keyRoot: number; scale: ScaleName; generation: number }) {
  const [showTrace, setShowTrace] = useState(true)
  const [hover, setHover] = useState<number | null>(null)
  const ns = useMemo(() => [...sequence].sort((a, b) => a.startTime - b.startTime), [sequence])
  const spb = 60 / bpm
  const W = 900, H = 360, PL = 46, PR = 16, PT = 18, PB = 30
  const midis = ns.map((n) => n.midiNoteNumber)
  const traceVals = result?.trace.map((t) => t.value) ?? []
  const lo = Math.floor(Math.min(...midis, ...traceVals, 60) - 2)
  const hi = Math.ceil(Math.max(...midis, ...traceVals, 72) + 2)
  const endBeat = Math.max(4, ...ns.map((n) => (n.startTime + n.duration) / spb), ...(result?.trace.map((t) => t.beat) ?? []))
  const x = (beat: number) => PL + (beat / endBeat) * (W - PL - PR)
  const y = (m: number) => PT + ((hi - m) / (hi - lo)) * (H - PT - PB)
  const pts = ns.map((n) => ({ x: x(n.startTime / spb), y: y(n.midiNoteNumber), n }))
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = pts.length ? `${path} L${pts[pts.length - 1].x},${H - PB} L${pts[0].x},${H - PB} Z` : ''
  const trace = result?.trace ?? []
  const tracePath = trace.map((t, i) => `${i && trace[i - 1].beat <= t.beat ? 'L' : 'M'}${x(t.beat).toFixed(1)},${y(t.value).toFixed(1)}`).join(' ')

  const headRef = useRef<SVGLineElement>(null)
  usePlayhead((t) => {
    const px = x(t / spb)
    headRef.current?.setAttribute('x1', String(px))
    headRef.current?.setAttribute('x2', String(px))
  })

  const yTicks: number[] = []
  for (let m = Math.ceil(lo); m <= hi; m++) if (inScale(m, keyRoot, scale) && (m - keyRoot) % 12 === 0 || m % 4 === 0) yTicks.push(m)

  return (
    <div className="relative h-full">
      <div className="absolute right-2 top-0 z-10 flex gap-2">
        <button onClick={() => setShowTrace((v) => !v)} className="neu-btn rounded-full px-3 py-1 text-[10.5px] font-medium" data-active={showTrace}>
          中点変位トレース
        </button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" key={generation} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="pvLine" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff5bd6" />
            <stop offset="50%" stopColor="#8b5cff" />
            <stop offset="100%" stopColor="#4fe3ff" />
          </linearGradient>
          <linearGradient id="pvArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8b5cff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#8b5cff" stopOpacity="0" />
          </linearGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {yTicks.map((m) => (
          <g key={m}>
            <line x1={PL} x2={W - PR} y1={y(m)} y2={y(m)} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 5" />
            <text x={PL - 6} y={y(m) + 3} fontSize={9.5} textAnchor="end" fill="rgba(220,200,255,.55)" fontFamily="JetBrains Mono">{midiToName(m)}</text>
          </g>
        ))}
        {result?.form.map((f, i) => (
          <g key={i} className="fade-up" style={{ ['--d' as any]: `${i * 80}ms` }}>
            <rect x={x(f.startBeat)} y={PT} width={x(f.startBeat + f.lengthBeats) - x(f.startBeat)} height={H - PT - PB} fill={i % 2 ? 'rgba(57,230,255,0.035)' : 'rgba(255,79,216,0.03)'} />
            <text x={x(f.startBeat) + 5} y={H - PB + 18} fontSize={10} fontWeight={800} fill="rgba(236,232,245,.6)" fontFamily="JetBrains Mono">{f.label}</text>
          </g>
        ))}
        {result && <line x1={x(result.startBeat)} x2={x(result.startBeat)} y1={PT} y2={H - PB} stroke="#4fe3ff" strokeOpacity={0.6} strokeDasharray="5 4" />}
        {result && <text x={x(result.startBeat) + 5} y={PT + 10} fontSize={9.5} fill="rgba(79,227,255,.8)" fontFamily="JetBrains Mono">AI CONTINUATION →</text>}
        {area && <path d={area} fill="url(#pvArea)" className="fade-up" />}
        {showTrace && trace.length > 0 && (
          <g>
            <path d={tracePath} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth={1.2} strokeDasharray="2 3" />
            {trace.filter((t) => t.level <= 4).map((t, i) => (
              <circle key={i} className="dot-pop" style={{ ['--d' as any]: `${t.level * 160 + 300}ms` }} cx={x(t.beat)} cy={y(t.value)} r={Math.max(1.4, 4.5 - t.level * 0.8)} fill={LEVEL_COLORS[t.level]} opacity={0.75} />
            ))}
          </g>
        )}
        {path && <path d={path} fill="none" stroke="url(#pvLine)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" className="line-draw" filter="url(#glow)" style={{ ['--len' as any]: 6000 }} />}
        {pts.map((p, i) => (
          <circle
            key={p.n.id}
            className="dot-pop"
            style={{ ['--d' as any]: `${Math.min(1200, i * 12)}ms`, cursor: 'pointer' }}
            cx={p.x}
            cy={p.y}
            r={hover === i ? 6 : p.n.tag?.includes('•') ? 4.2 : 3.3}
            fill={p.n.source === 'ai' ? '#4fe3ff' : '#ff5bd6'}
            stroke="#fff"
            strokeWidth={hover === i ? 2 : 1}
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {hover !== null && pts[hover] && (
          <g pointerEvents="none">
            <rect x={Math.min(W - 120, pts[hover].x + 8)} y={Math.max(4, pts[hover].y - 38)} width={110} height={32} rx={9} fill="rgba(20,10,40,.92)" stroke="rgba(255,255,255,.15)" />
            <text x={Math.min(W - 120, pts[hover].x + 8) + 9} y={Math.max(4, pts[hover].y - 38) + 14} fontSize={10.5} fontWeight={800} fill="#fff">{midiToName(pts[hover].n.midiNoteNumber)} · #{hover + 1}</text>
            <text x={Math.min(W - 120, pts[hover].x + 8) + 9} y={Math.max(4, pts[hover].y - 38) + 26} fontSize={9} fill="#cbb8ff" fontFamily="JetBrains Mono">{pts[hover].n.startTime.toFixed(2)}s · {pts[hover].n.source === 'ai' ? 'AI' : 'YOU'} {pts[hover].n.tag ?? ''}</text>
          </g>
        )}
        <line ref={headRef} x1={PL} x2={PL} y1={PT} y2={H - PB} stroke="#4fe3ff" strokeWidth={2} style={{ filter: 'drop-shadow(0 0 6px #4fe3ff)' }} />
        <text x={W - PR} y={H - 6} fontSize={9} textAnchor="end" fill="rgba(220,200,255,.45)">拍 →</text>
      </svg>
      {showTrace && result && (
        <div className="absolute bottom-9 left-14 flex flex-wrap gap-1.5 rounded-xl bg-black/35 px-2 py-1 backdrop-blur">
          {LEVEL_COLORS.slice(0, 5).map((c, i) => (
            <span key={i} className="flex items-center gap-1 text-[9px] font-medium text-[var(--tx-3)]">
              <span className="h-2 w-2 rounded-full" style={{ background: c }} />
              {i === 0 ? '端点' : `L${i}`}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
export const PitchViz = memo(PitchVizImpl)
