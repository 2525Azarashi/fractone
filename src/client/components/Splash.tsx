// ============================================================
// Splash — オープニング
//  ・タイトル: カーソル距離で可変ウェイトが変化する Kinetic Typography
//  ・背景: 実際の中点変位アルゴリズムを 階層0→7 へ再帰的に描き足していく図解
//  ・アウトライン文字のマーキー、クリップパスによるワイプ退場
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { SplashCanvas, type SplashFeed } from './SplashCanvas'
import { ProximityWord, Magnetic } from './fx'
import { RiseText } from './ui'
import { IArrowR } from './icons'

const LEVEL_COL = ['#ffffff', '#ff5bd6', '#d34cff', '#a855ff', '#8b5cff', '#6b7bff', '#4fb8ff', '#4fe3ff']

export function Splash({ onStart }: { onStart: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const [lv, setLv] = useState(0)
  const DEPTH = 7
  // canvas から届くライブ情報は DOM へ直接書く (再レンダー無し)
  const noteRef = useRef<HTMLSpanElement>(null)
  const octRef = useRef<HTMLSpanElement>(null)
  const seedRef = useRef<HTMLSpanElement>(null)
  const histRef = useRef<HTMLSpanElement>(null)
  const hist = useRef<string[]>([])
  // グレイン用ノイズタイル: 128px を一度だけ生成 (SVG フィルタは全画面だと重い)
  const noise = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const img = g.createImageData(128, 128)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    g.putImageData(img, 0, 0)
    return `url(${c.toDataURL()})`
  }, [])
  const feed = useMemo<SplashFeed>(() => ({
    onLevel: (l) => setLv(l),
    onNote: (name, oct, seed) => {
      if (noteRef.current) {
        noteRef.current.textContent = name
        const prev = (noteRef.current as any).__a as Animation | undefined
        prev?.cancel()
        ;(noteRef.current as any).__a = noteRef.current.animate([{ transform: 'translateY(70%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)' })
      }
      if (octRef.current) octRef.current.textContent = String(oct)
      if (seedRef.current) seedRef.current.textContent = String(seed).padStart(4, '0')
      hist.current = [...hist.current.slice(-7), name]
      if (histRef.current) histRef.current.textContent = hist.current.join(' · ')
    },
  }), [])

  const leftRef = useRef(false)
  const startRef = useRef(onStart)
  startRef.current = onStart
  const start = () => {
    if (leftRef.current) return
    leftRef.current = true
    setLeaving(true)
    setTimeout(() => startRef.current(), 1100)
  }
  // スプラッシュ表示中はキー入力を独占 (アプリ側のショートカットに流さない)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      e.stopImmediatePropagation()
      if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); start() }
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [])

  return (
    <div className={`fixed inset-0 z-[100] overflow-hidden bg-[#0a0812] ${leaving ? 'wipe-out splash-leaving pointer-events-none' : ''}`}>
      {/* 生きている中点変位 (canvas) */}
      <SplashCanvas feed={feed} leaving={leaving} />
      {/* グレイン + ビネット */}
      <div className="splash-grain pointer-events-none absolute" style={{ ['--noise' as any]: noise }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 40%, transparent 50%, rgba(5,3,10,.85) 100%)' }} />

      <div className="relative flex h-full flex-col justify-between p-6 md:p-12">
        <div className="flex items-start justify-between">
          <span />
          {/* 階層カウンタ (インフォグラフィック) */}
          <div className="text-right">
            <p className="text-[11px] text-[var(--tx-3)]">分割の深さ</p>
            <p className="num mt-1 text-[28px] font-medium leading-none text-white">
              <span key={lv} className="roll-num">{String(lv).padStart(2, '0')}</span>
              <span className="text-[13px] text-[var(--tx-3)]"> / {String(DEPTH).padStart(2, '0')}</span>
            </p>
            <div className="mt-2 flex justify-end gap-1">
              {Array.from({ length: DEPTH + 1 }).map((_, i) => (
                <span key={i} className="h-[3px] w-3 rounded-full transition-colors duration-300" style={{ background: i <= lv ? LEVEL_COL[i] : 'rgba(255,255,255,.1)' }} />
              ))}
            </div>
            <p className="num mt-2 text-[10px] text-[var(--tx-3)]">{(1 << lv) + 1} 点</p>
            {/* 再生ヘッドが拾った音 (曲線 → 音階量子化) */}
            <div className={`mt-5 border-t border-[var(--line)] pt-3 transition-opacity duration-700 ${lv >= DEPTH ? 'opacity-100' : 'opacity-0'}`}>
              <p className="text-[11px] text-[var(--tx-3)]">曲線の高さ → 音</p>
              <p className="mt-1 flex items-end justify-end gap-1 leading-none">
                <span className="kt-mask"><span ref={noteRef} className="block font-display text-[34px] font-semibold text-white">—</span></span>
                <span ref={octRef} className="num mb-1 text-[11px] text-[var(--tx-3)]" />
              </p>
              <p className="num mt-1.5 max-w-[190px] truncate text-[10px] text-[var(--tx-3)]"><span ref={histRef} /></p>
              <span ref={seedRef} className="hidden" />
            </div>
          </div>
        </div>

        <div>
          <h1 className="font-display text-[clamp(64px,13.5vw,200px)] leading-[0.86] tracking-[-0.05em] text-white">
            <ProximityWord text="Frac" min={250} max={850} delay={150} wave={0.75} />
            <ProximityWord text="Tone" gradient min={250} max={850} delay={370} wave={0.75} phase={4} />
          </h1>
          <div className="mt-7 flex flex-wrap items-end gap-x-12 gap-y-4">
            <p className="splash-fade max-w-md text-[15px] leading-relaxed text-[var(--tx-2)]">
              <RiseText delay={620}>あなたが弾いたメロディの続きを、</RiseText>
              <br />
              <RiseText delay={700}>中点変位法とモチーフ展開で作曲する。</RiseText>
            </p>

          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <ol className="splash-fade fade-up grid grid-cols-3 gap-6 md:gap-12" style={{ ['--d' as any]: '1000ms' }}>
            {['鍵盤で弾く', '続きを作曲', '分析して学ぶ'].map((t) => (
              <li key={t} className="border-t border-[var(--line-2)] pt-3">
                <p className="text-[13px] text-[var(--tx)]">{t}</p>
              </li>
            ))}
          </ol>
          <div className="splash-fade fade-up flex items-center gap-4" style={{ ['--d' as any]: '1150ms' }}>
            <span className="hidden text-[11px] text-[var(--tx-3)] sm:inline">クリックで曲線が変わります</span>
            <Magnetic strength={0.3}>
              <button onClick={start} className="btn-primary splash-cta group relative flex items-center gap-4 rounded-full py-4 pl-8 pr-4 text-[15px] font-medium">
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
