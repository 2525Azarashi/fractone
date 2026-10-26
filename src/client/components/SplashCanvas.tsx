// ============================================================
// SplashCanvas — タイトル画面の「生きている中点変位」
//  1. イントロ: 階層 0→7 へ再帰的に点が増えていく (アルゴリズムの図解)
//  2. ループ: 曲線が別シードの曲線へ絶えずモーフィング (呼吸する地形)
//  3. カーソル: 近くの曲線を引き寄せる / クリックで再シード + 波紋
//  4. 再生ヘッドが曲線を横切るたび、その高さを音階に量子化 → 音名がポップ
//     → 「曲線がメロディになる」ことを無言で説明する
//  すべて 1 枚の canvas + rAF。React の再レンダーは起こさない
// ============================================================
import { useEffect, useRef } from 'react'
import { midpointDisplace } from '../../lib/midpoint-displace'
import { createRng, NOTE_NAMES } from '../../lib/theory'

const DEPTH = 7
const N = 1 << DEPTH
const LEVEL_COL = ['#ffffff', '#ff5bd6', '#d34cff', '#a855ff', '#8b5cff', '#6b7bff', '#4fb8ff', '#4fe3ff']
const MAJOR = [0, 2, 4, 5, 7, 9, 11]

export interface SplashFeed {
  onLevel?: (lv: number) => void
  onNote?: (name: string, oct: number, seed: number) => void
}

interface Layer {
  a: number[]
  b: number[]
  t: number
  dur: number
  rough: number
  amp: number
  y: number // 画面高さに対する基準位置
  alpha: number
  par: number // パララックス係数
  seed: number
}

const gen = (seed: number, amp: number, rough: number) =>
  midpointDisplace({ start: (createRng(seed).next() - 0.5) * amp * 0.6, end: (createRng(seed + 1).next() - 0.5) * amp * 0.6, depth: DEPTH, displacement: amp, roughness: rough, min: -amp * 1.4, max: amp * 1.4, rng: createRng(seed) })

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

export function SplashCanvas({ feed, leaving }: { feed: SplashFeed; leaving: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const leaveRef = useRef(leaving)
  leaveRef.current = leaving
  const feedRef = useRef(feed)
  feedRef.current = feed

  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let W = 0, H = 0, dpr = 1
    const resize = () => {
      dpr = Math.min(1.25, window.devicePixelRatio || 1)
      W = cv.clientWidth
      H = cv.clientHeight
      cv.width = Math.round(W * dpr)
      cv.height = Math.round(H * dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    // 主曲線 (イントロで再帰的に描かれる) — 固定シードでイントロの絵を安定させる
    const intro = gen(20261018, 4.2, 0.58)
    const layers: Layer[] = [
      { a: intro.values, b: gen(11, 4.2, 0.58).values, t: 0, dur: 5200, rough: 0.58, amp: 4.2, y: 0.7, alpha: 1, par: 18, seed: 11 },
      { a: gen(201, 3.2, 0.62).values, b: gen(202, 3.2, 0.62).values, t: 0.3, dur: 6800, rough: 0.62, amp: 3.2, y: 0.78, alpha: 0.32, par: 34, seed: 202 },
      { a: gen(301, 2.6, 0.5).values, b: gen(302, 2.6, 0.5).values, t: 0.6, dur: 8200, rough: 0.5, amp: 2.6, y: 0.85, alpha: 0.18, par: 52, seed: 302 },
      { a: gen(401, 5.4, 0.66).values, b: gen(402, 5.4, 0.66).values, t: 0.1, dur: 9400, rough: 0.66, amp: 5.4, y: 0.6, alpha: 0.1, par: 8, seed: 402 },
    ]
    const cur = layers.map(() => new Array<number>(N + 1).fill(0)) // 画面座標 (px)
    const curV = layers.map(() => new Array<number>(N + 1).fill(0)) // 曲線の値 (モーフ途中の形)
    let seedCounter = 1000

    // 入力
    let mx = -1, my = -1, pmx = 0.5, pmy = 0.5, pull = 0
    const onMove = (e: PointerEvent) => { mx = e.clientX; my = e.clientY }
    const onLeave = () => { mx = -1 }
    const ripples: { x: number; y: number; t0: number; col: string; big: boolean }[] = []
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return
      // クリック: 主曲線を新しいシードへ素早くモーフ
      const L = layers[0]
      L.a = curV[0].slice()
      L.seed = ++seedCounter
      L.b = gen(L.seed * 97, L.amp, L.rough).values
      L.t = 0
      L.dur = 1400
      ripples.push({ x: e.clientX, y: e.clientY, t0: last, col: '#ff5bd6', big: true })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown)
    document.addEventListener('pointerleave', onLeave)

    // 再生ヘッドが拾った音
    const pops: { x: number; y: number; t0: number; name: string; col: string }[] = []
    const trail: { x: number; y: number; t0: number; col: string }[] = []
    let lastPitch = -999
    const start = performance.now()
    let last = start
    let headX = -0.05
    let lastLv = -1
    let raf = 0

    const frame = (now: number) => {
      const dt = Math.min(50, now - last)
      last = now
      const el = now - start
      const leave = leaveRef.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      // イントロの階層
      const lv = reduced ? DEPTH : Math.min(DEPTH, Math.floor(el / 300))
      if (lv !== lastLv) { lastLv = lv; feedRef.current.onLevel?.(lv) }
      const introDone = lv >= DEPTH && el > DEPTH * 300 + 400

      // パララックス
      const tx = mx < 0 ? 0.5 : mx / W, ty = my < 0 ? 0.5 : my / H
      pmx += (tx - pmx) * 0.05
      pmy += (ty - pmy) * 0.05
      pull += ((mx < 0 ? 0 : 1) - pull) * 0.08

      const unit = H / 26 // 1 単位の振幅(px)
      const X = (i: number) => (i / N) * W

      layers.forEach((L, li) => {
        // モーフィング (イントロ中の主曲線は固定)
        if (!(li === 0 && !introDone) && !reduced) {
          L.t += (dt / L.dur) * (leave ? 4 : 1)
          if (L.t >= 1) {
            L.a = L.b
            L.seed = ++seedCounter
            L.b = gen(L.seed * 131 + li, L.amp, L.rough).values
            L.t = 0
            L.dur = li === 0 ? 5200 : L.dur
          }
        }
        const k = ease(Math.min(1, L.t))
        const c = cur[li]
        const ox = (pmx - 0.5) * -L.par
        const oy = (pmy - 0.5) * -L.par * 0.6
        for (let i = 0; i <= N; i++) {
          let v = L.a[i] * (1 - k) + L.b[i] * k
          curV[li][i] = v
          // 呼吸 (ゆっくりとした全体のうねり)
          v += Math.sin(now / 1800 + i / 14 + li) * 0.25
          let y = H * L.y + oy - v * unit * (leave ? 1.8 : 1)
          // カーソル引力 (近い x ほど強く)
          if (pull > 0.01 && my >= 0) {
            const dx = (X(i) + ox - mx) / 140
            const g = Math.exp(-dx * dx) * pull * (li === 0 ? 0.42 : 0.18)
            y += (my - y) * g
          }
          c[i] = y
        }
        // 描画
        ctx.save()
        ctx.translate(ox, 0)
        if (li === 0) {
          // イントロ: 階層 lv までに決まった点だけを結ぶ
          const pts: [number, number][] = []
          for (let i = 0; i <= N; i++) if (introDone || intro.levels[i] <= lv) pts.push([X(i), c[i]])
          // 過去階層のゴースト
          if (!introDone) {
            for (let g = 0; g < lv; g++) {
              ctx.beginPath()
              let first = true
              for (let i = 0; i <= N; i++) if (intro.levels[i] <= g) { first ? ctx.moveTo(X(i), c[i]) : ctx.lineTo(X(i), c[i]); first = false }
              ctx.strokeStyle = 'rgba(255,255,255,.07)'
              ctx.lineWidth = 1
              ctx.stroke()
            }
          }
          // 塗り
          const fill = ctx.createLinearGradient(0, H * 0.4, 0, H)
          fill.addColorStop(0, 'rgba(139,92,255,.18)')
          fill.addColorStop(1, 'rgba(139,92,255,0)')
          ctx.beginPath()
          pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
          ctx.lineTo(W + 40, H)
          ctx.lineTo(-40, H)
          ctx.closePath()
          ctx.fillStyle = fill
          ctx.fill()
          // 線 (グロー付き)
          const grad = ctx.createLinearGradient(0, 0, W, 0)
          grad.addColorStop(0, '#ff5bd6')
          grad.addColorStop(0.55, '#8b5cff')
          grad.addColorStop(1, '#4fe3ff')
          ctx.beginPath()
          pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
          ctx.strokeStyle = grad
          ctx.lineJoin = 'round'
          // グロー: shadowBlur は重いので、太い半透明ストロークを重ねて代用
          ctx.globalAlpha = 0.16
          ctx.lineWidth = 9
          ctx.stroke()
          ctx.globalAlpha = 1
          ctx.lineWidth = 1.8
          ctx.stroke()
          // 制御点 (階層ごとに色分け)
          const showLv = introDone ? 3 : Math.min(lv, 4)
          for (let i = 0; i <= N; i++) {
            const l = intro.levels[i]
            if (l > showLv) continue
            const born = l * 300
            const s = introDone ? 1 : Math.min(1, Math.max(0, (el - born) / 260))
            const r = (l === 0 ? 5 : Math.max(1.8, 4.2 - l * 0.7)) * (1 + (1 - s) * 1.5) * (s > 0 ? 1 : 0)
            if (r <= 0) continue
            ctx.beginPath()
            ctx.arc(X(i), c[i], r, 0, Math.PI * 2)
            ctx.fillStyle = '#0a0812'
            ctx.fill()
            ctx.lineWidth = 1.4
            ctx.strokeStyle = LEVEL_COL[l]
            ctx.globalAlpha = s
            ctx.stroke()
            ctx.globalAlpha = 1
          }
        } else {
          ctx.beginPath()
          for (let i = 0; i <= N; i++) (i ? ctx.lineTo(X(i), c[i]) : ctx.moveTo(X(i), c[i]))
          ctx.strokeStyle = `rgba(${li === 3 ? '79,227,255' : '200,170,255'},${L.alpha * (introDone ? 1 : Math.min(1, el / 1600))})`
          ctx.lineWidth = 1
          ctx.stroke()
        }
        ctx.restore()
      })

      // ---- 再生ヘッド: 曲線の高さ → 音階に量子化 → 音名 ----
      if (introDone && !reduced) {
        headX += (dt / 7000) * (leave ? 5 : 1)
        if (headX > 1.05) { headX = -0.05; lastPitch = -999 }
        const ox0 = (pmx - 0.5) * -layers[0].par
        const hx = headX * W
        const fi = Math.max(0, Math.min(N, (hx - ox0) / W * N))
        const i0 = Math.floor(fi), f = fi - i0
        const hy = cur[0][i0] * (1 - f) + (cur[0][Math.min(N, i0 + 1)] ?? cur[0][i0]) * f
        // 縦線
        const lg = ctx.createLinearGradient(0, hy - 160, 0, hy + 160)
        lg.addColorStop(0, 'rgba(255,255,255,0)')
        lg.addColorStop(0.5, 'rgba(255,255,255,.55)')
        lg.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = lg
        ctx.fillRect(hx - 0.5, hy - 160, 1, 320)
        ctx.beginPath()
        ctx.arc(hx, hy, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(hx, hy, 11, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(79,227,255,.18)'
        ctx.fill()
        // 高さ → 音階度数 (C メジャーに量子化)。約 0.5 単位 = 1 度
        const degF = -(hy - H * 0.7) / (unit * 0.5)
        const dg = Math.round(degF) + 7 * 5 // C5 付近を基準
        const q = MAJOR[((dg % 7) + 7) % 7]
        const oct = Math.floor(dg / 7)
        const midi = oct * 12 + q
        if (midi !== lastPitch && hx > 0 && hx < W) {
          lastPitch = midi
          const col = headX < 0.5 ? '#ff5bd6' : '#4fe3ff'
          pops.push({ x: hx, y: hy, t0: now, name: NOTE_NAMES[q], col })
          ripples.push({ x: hx, y: hy, t0: now, col, big: false })
          trail.push({ x: hx, y: hy, t0: now, col })
          feedRef.current.onNote?.(NOTE_NAMES[q], oct - 1, layers[0].seed)
        }
      }

      // 音符の軌跡 (ピアノロールのバーのように残り、左へ流れて消える)
      for (let j = trail.length - 1; j >= 0; j--) {
        const p = trail[j]
        const a = Math.max(0, (now - p.t0) / 2600)
        if (a >= 1) { trail.splice(j, 1); continue }
        ctx.globalAlpha = (1 - a) * 0.8
        ctx.fillStyle = p.col
        const w = 16
        ctx.beginPath()
        ctx.roundRect(p.x - a * 30, p.y - 3, w, 6, 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      // 波紋
      for (let j = ripples.length - 1; j >= 0; j--) {
        const r = ripples[j]
        const a = Math.max(0, (now - r.t0) / (r.big ? 1100 : 800))
        if (a >= 1) { ripples.splice(j, 1); continue }
        const e = 1 - Math.pow(1 - a, 3)
        ctx.beginPath()
        ctx.arc(r.x, r.y, Math.max(0, (r.big ? 140 : 26) * e + 4), 0, Math.PI * 2)
        ctx.strokeStyle = r.col
        ctx.globalAlpha = (1 - a) * (r.big ? 0.6 : 0.8)
        ctx.lineWidth = r.big ? 1.5 : 1
        ctx.stroke()
        if (r.big) {
          ctx.beginPath()
          ctx.arc(r.x, r.y, Math.max(0, 80 * e + 2), 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      // 音名ポップ (上へ浮かびながら消える)
      ctx.textAlign = 'center'
      for (let j = pops.length - 1; j >= 0; j--) {
        const p = pops[j]
        const a = Math.max(0, (now - p.t0) / 1300)
        if (a >= 1) { pops.splice(j, 1); continue }
        const e = 1 - Math.pow(1 - a, 3)
        ctx.globalAlpha = a < 0.12 ? a / 0.12 : 1 - (a - 0.12) / 0.88
        ctx.font = `${Math.round(300 + (1 - e) * 500)} ${Math.round(15 + (1 - e) * 9)}px Outfit, sans-serif`
        ctx.fillStyle = p.col
        ctx.fillText(p.name, p.x, p.y - 18 - e * 42)
      }
      ctx.globalAlpha = 1

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const vis = () => {
      if (document.hidden) cancelAnimationFrame(raf)
      else { last = performance.now(); raf = requestAnimationFrame(frame) }
    }
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [])

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
}
