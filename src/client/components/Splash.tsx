// ============================================================
// Splash — オープニング
//  ・タイトル: カーソル距離で可変ウェイトが変化する Kinetic Typography
//  ・背景: 実際の中点変位アルゴリズムを 階層0→7 へ再帰的に描き足していく図解
//  ・アウトライン文字のマーキー、クリップパスによるワイプ退場
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { midpointDisplace } from '../../lib/midpoint-displace'
import { createRng } from '../../lib/theory'
import { ProximityWord, Magnetic, ScrambleText } from './fx'
import { RiseText } from './ui'
import { IArrowR } from './icons'

const LEVEL_COL = ['#ffffff', '#ff5bd6', '#d34cff', '#a855ff', '#8b5cff', '#6b7bff', '#4fb8ff', '#4fe3ff']

export function Splash({ onStart }: { onStart: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const [lv, setLv] = useState(0)
  const DEPTH = 7
  const res = useMemo(() => midpointDisplace({ start: -1.2, end: 0.8, depth: DEPTH, displacement: 4.2, roughness: 0.58, min: -5, max: 5, rng: createRng(20261018) }), [])
  useEffect(() => {
    const id = setInterval(() => setLv((l) => (l >= DEPTH ? l : l + 1)), 340)
    return () => clearInterval(id)
  }, [])

  const W = 1440, H = 900
  const N = res.values.length - 1
  const X = (i: number) => (i / N) * W
  const Y = (v: number) => H * 0.72 - v * 34
  // レベル lv までで決まった点だけを結ぶ (中点変位の再帰過程)
  const pathFor = (L: number) => {
    const pts: string[] = []
    for (let i = 0; i <= N; i++) if (res.levels[i] <= L) pts.push(`${X(i).toFixed(1)},${Y(res.values[i]).toFixed(1)}`)
    return 'M' + pts.join(' L')
  }

  const start = () => {
    if (leaving) return
    setLeaving(true)
    setTimeout(onStart, 820)
  }
  useEffect(() => {
    const on = (e: KeyboardEvent) => (e.key === 'Enter' || e.code === 'Space') && start()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  return (
    <div className={`fixed inset-0 z-[100] overflow-hidden bg-[#0a0812] ${leaving ? 'wipe-out pointer-events-none' : ''}`}>
      {/* アウトライン・マーキー */}
      <div className="pointer-events-none absolute inset-x-0 top-[14%] select-none font-display text-[18vw] font-semibold leading-none tracking-[-0.05em] opacity-80">
        <div className="marquee-x outline-text">
          {Array.from({ length: 2 }).map((_, k) => <span key={k} className="pr-[6vw]">Midpoint · Motif · Melody ·&nbsp;</span>)}
        </div>
      </div>

      {/* 中点変位の再帰図解 */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="spg" x1="0" x2="1"><stop offset="0" stopColor="#ff5bd6" /><stop offset=".55" stopColor="#8b5cff" /><stop offset="1" stopColor="#4fe3ff" /></linearGradient>
          <linearGradient id="spa" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8b5cff" stopOpacity=".16" /><stop offset="1" stopColor="#8b5cff" stopOpacity="0" /></linearGradient>
        </defs>
        {/* 過去の階層をゴーストとして残す */}
        {Array.from({ length: lv }).map((_, L) => (
          <path key={L} d={pathFor(L)} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={1} />
        ))}
        <path d={`${pathFor(lv)} L${W},${H} L0,${H} Z`} fill="url(#spa)" style={{ transition: 'd .3s var(--ease)' }} />
        <path d={pathFor(lv)} fill="none" stroke="url(#spg)" strokeWidth={1.6} strokeLinejoin="round" style={{ transition: 'd .3s var(--ease)' }} />
        {res.values.map((v, i) =>
          res.levels[i] <= Math.min(lv, 4) ? (
            <circle key={i} className="dot-pop" cx={X(i)} cy={Y(v)} r={res.levels[i] === 0 ? 5 : Math.max(1.6, 4 - res.levels[i] * 0.6)} fill="#0a0812" stroke={LEVEL_COL[res.levels[i]]} strokeWidth={1.4} />
          ) : null,
        )}
      </svg>

      <div className="relative flex h-full flex-col justify-between p-6 md:p-12">
        <div className="flex items-start justify-between">
          <span className="eyebrow"><ScrambleText text="FRACTONE / V1.0" /></span>
          {/* 階層カウンタ (インフォグラフィック) */}
          <div className="text-right">
            <p className="eyebrow">Recursion depth</p>
            <p className="num mt-1 text-[28px] font-medium leading-none text-white">
              <span key={lv} className="roll-num">{String(lv).padStart(2, '0')}</span>
              <span className="text-[13px] text-[var(--tx-3)]"> / {String(DEPTH).padStart(2, '0')}</span>
            </p>
            <div className="mt-2 flex justify-end gap-1">
              {Array.from({ length: DEPTH + 1 }).map((_, i) => (
                <span key={i} className="h-[3px] w-3 rounded-full transition-colors duration-300" style={{ background: i <= lv ? LEVEL_COL[i] : 'rgba(255,255,255,.1)' }} />
              ))}
            </div>
            <p className="num mt-2 text-[10px] text-[var(--tx-3)]">{1 << lv} segments · {(1 << lv) + 1} points</p>
          </div>
        </div>

        <div>
          <p className="eyebrow mb-5"><RiseText>A fractal sequencer for learning composition</RiseText></p>
          <h1 className="font-display text-[clamp(64px,13.5vw,200px)] leading-[0.86] tracking-[-0.05em] text-white">
            <ProximityWord text="Frac" min={300} max={800} delay={150} />
            <ProximityWord text="Tone" gradient min={300} max={800} delay={370} />
          </h1>
          <div className="mt-7 flex flex-wrap items-end gap-x-12 gap-y-4">
            <p className="max-w-md text-[15px] leading-relaxed text-[var(--tx-2)]">
              <RiseText delay={620}>あなたが弾いたメロディの続きを、</RiseText>
              <br />
              <RiseText delay={700}>中点変位法とモチーフ展開で作曲する。</RiseText>
            </p>
            <p className="fade-up hidden max-w-[260px] text-[11.5px] leading-relaxed text-[var(--tx-3)] md:block" style={{ ['--d' as any]: '900ms' }}>
              mid = (a + b) / 2 + rand(−d, d)
              <br />d ← d × roughness — 再帰的に分割して、構造と揺らぎを両立する。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <ol className="fade-up grid grid-cols-3 gap-6 md:gap-12" style={{ ['--d' as any]: '1000ms' }}>
            {[['01', 'Play', '鍵盤で弾く'], ['02', 'Continue', '続きを作曲'], ['03', 'Learn', '分析して学ぶ']].map(([n, en, t]) => (
              <li key={n} className="border-t border-[var(--line-2)] pt-3">
                <p className="num text-[10px] text-[var(--tx-3)]">{n} — {en}</p>
                <p className="mt-1 text-[13px] text-[var(--tx)]">{t}</p>
              </li>
            ))}
          </ol>
          <div className="fade-up flex items-center gap-4" style={{ ['--d' as any]: '1150ms' }}>
            <span className="num hidden text-[10px] text-[var(--tx-3)] sm:inline">press ⏎</span>
            <Magnetic strength={0.3}>
              <button onClick={start} className="btn-primary group flex items-center gap-4 rounded-full py-4 pl-8 pr-4 text-[15px] font-medium">
                はじめる
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15 transition-transform duration-500 group-hover:translate-x-1 group-hover:rotate-[-45deg]">
                  <IArrowR size={16} />
                </span>
              </button>
            </Magnetic>
          </div>
        </div>
      </div>
    </div>
  )
}
