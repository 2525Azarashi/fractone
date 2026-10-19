// ============================================================
// ComposeOverlay — 作曲パイプラインのインフォグラフィック
//  ①モチーフ判断 → ②楽式プラン → ③マクロ中点変位 → ④ミクロ中点変位 → ⑤リズム+Humanize
//  各ステージの進捗を可視化し、完了後は楽式ラベルを大きく Kinetic に提示
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { midpointDisplace } from '../../lib/midpoint-displace'
import { createRng } from '../../lib/theory'
import type { ComposeResult } from '../../lib/types'
import { ScrambleText } from './fx'

const STAGES = [
  { en: 'Motif analysis', ja: 'モチーフ判断' },
  { en: 'Form plan', ja: '楽式プラン' },
  { en: 'Macro displacement', ja: 'フレーズ中心音' },
  { en: 'Micro displacement', ja: '旋律の輪郭' },
  { en: 'Rhythm · Humanize', ja: 'リズムと揺らぎ' },
]

export function ComposeOverlay({ depth, mode, seed, total = 1000 }: { depth: number; mode: string; seed: number; total?: number }) {
  const [t, setT] = useState(0)
  useEffect(() => {
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      // rAF のタイムスタンプは performance.now() より過去になり得るため 0 未満を丸める
      setT(Math.max(0, Math.min(1, (now - t0) / Math.max(1, total))))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [total])
  const stage = Math.max(0, Math.min(STAGES.length - 1, Math.floor((Number.isFinite(t) ? t : 0) * STAGES.length)))
  const sp = (t * STAGES.length) % 1
  const res = useMemo(() => midpointDisplace({ start: -1, end: 1, depth: Math.max(3, depth), displacement: 3.4, roughness: 0.56, min: -5, max: 5, rng: createRng(seed) }), [depth, seed])
  const lv = stage < 2 ? 0 : stage === 2 ? Math.round(sp * 2) : Math.min(depth, 2 + Math.round(sp * (depth - 2)) + (stage > 3 ? depth : 0))
  const W = 560, H = 140
  const N = res.values.length - 1
  const pts: [number, number][] = []
  for (let i = 0; i <= N; i++) if (res.levels[i] <= lv) pts.push([(i / N) * W, H / 2 - res.values[i] * 11])

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-between overflow-hidden rounded-2xl bg-[#0a0812]/88 p-6 backdrop-blur-md md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] text-[var(--tx-3)]">{mode === 'continue' ? 'あなたのメロディの続きを作曲中' : '新しいモチーフから作曲中'}</p>
          <h2 className="mt-2 text-[clamp(24px,3.4vw,38px)] font-semibold leading-none tracking-[-0.02em] text-white">
            <ScrambleText key={stage} text={STAGES[stage].ja} duration={420} />
          </h2>
        </div>
        <div className="text-right">
          <p className="num text-[44px] font-medium leading-none text-white">{Math.round(t * 100)}<span className="text-[16px] text-[var(--tx-3)]">%</span></p>
          <p className="num mt-1 text-[10px] text-[var(--tx-3)]">深さ {depth}</p>
        </div>
      </div>

      {/* 中点変位の図 */}
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-[680px] overflow-visible">
        <defs><linearGradient id="cog" x1="0" x2="1"><stop offset="0" stopColor="#ff5bd6" /><stop offset=".6" stopColor="#8b5cff" /><stop offset="1" stopColor="#4fe3ff" /></linearGradient></defs>
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,.07)" strokeDasharray="2 4" />
        {stage >= 1 && [0.25, 0.5, 0.75].map((k) => <line key={k} x1={k * W} x2={k * W} y1={8} y2={H - 8} stroke="rgba(79,227,255,.18)" strokeDasharray="1 3" className="fade-up" />)}
        <path d={'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L')} fill="none" stroke="url(#cog)" strokeWidth={1.6} strokeLinejoin="round" style={{ transition: 'd .18s linear' }} />
        {pts.length < 40 && pts.map((p, i) => <circle key={`${lv}-${i}`} className="dot-pop" cx={p[0]} cy={p[1]} r={2.6} fill="#0a0812" stroke="#fff" strokeWidth={1.1} />)}
        {stage >= 4 && Array.from({ length: 32 }).map((_, i) => (
          <rect key={i} className="bar-grow" x={(i / 32) * W + 2} y={H - 6} width={W / 32 - 4} height={4} rx={1} fill={i % 4 === 0 ? '#ff5bd6' : 'rgba(255,255,255,.3)'} style={{ ['--d' as any]: `${i * 12}ms` }} />
        ))}
      </svg>

      {/* パイプライン */}
      <ol className="grid grid-cols-5 gap-3">
        {STAGES.map((s, i) => {
          const fill = i < stage ? 1 : i === stage ? sp : 0
          return (
            <li key={s.en} className="pipe-step" data-on={i <= stage}>
              <div className="h-[2px] overflow-hidden rounded-full bg-white/10">
                <div className="pipe-bar h-full bg-white" style={{ transform: `scaleX(${fill})` }} />
              </div>
              <p className="mt-2 hidden text-[11px] text-[var(--tx)] md:block">{s.ja}</p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** 完了時: 生成された楽式 (A A' B A'') を大きく Kinetic に提示 */
export function FormReveal({ result }: { result: ComposeResult }) {
  return (
    <div className="form-reveal pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
      <div className="flex items-baseline gap-[3vw] font-display text-[clamp(44px,8vw,112px)] font-medium leading-none tracking-[-0.04em]">
        {result.form.map((f, i) => (
          <span key={i} className="form-letter" style={{ ['--d' as any]: `${i * 110}ms`, color: f.transform === 'free' || f.transform === 'cadence' ? '#ffcf7a' : '#fff', textShadow: '0 10px 40px rgba(0,0,0,.6)' }}>
            {f.label}
          </span>
        ))}
      </div>
      <p className="num mt-4 text-[11px] text-[var(--tx-2)]" style={{ textShadow: '0 2px 10px #000' }}>
        {result.notes.length} 音符 · モチーフ {result.motif?.signature ?? '—'}
      </p>
    </div>
  )
}
