// ============================================================
// lib/midpoint-displace.ts — 中点変位法 (Midpoint Displacement)
// メロディライン(連続ピッチ曲線)の生成のみを担当する純粋モジュール
// ============================================================
import type { Rng } from './theory'

export interface MPDOptions {
  start: number // 開始点のピッチ (連続値, MIDI)
  end: number // 終了点のピッチ
  depth: number // 分解深度: 再帰分割の回数 → 2^depth 区間
  displacement: number // 初期変位の振幅 (半音)
  roughness: number // 階層ごとの振幅減衰率 (0.5 ≒ ブラウン運動的 / 大きいほどギザギザ)
  min: number // 音域下限
  max: number // 音域上限
  rng: Rng
  /** 各階層の中点に加える重力 (中心へ引き戻す力) 0-1 */
  gravity?: number
  center?: number
}

export interface MPDResult {
  values: number[] // 長さ 2^depth + 1
  levels: number[] // 各点がどの階層で決定されたか (0 = 端点)
}

/**
 * 1次元中点変位法
 *  1. 両端の値を決める
 *  2. 区間の中点 = 両端の平均 + ランダム変位 (±amp)
 *  3. amp *= roughness として、分割した各区間で再帰
 *  → 長期的な傾向(開始→終了) と 短期的な揺らぎ を同時に持つ曲線
 */
export function midpointDisplace(opt: MPDOptions): MPDResult {
  const depth = Math.max(0, Math.min(8, Math.round(opt.depth)))
  const n = 1 << depth
  const values = new Array<number>(n + 1).fill(0)
  const levels = new Array<number>(n + 1).fill(-1)
  values[0] = opt.start
  values[n] = opt.end
  levels[0] = 0
  levels[n] = 0
  const center = opt.center ?? (opt.start + opt.end) / 2
  const gravity = opt.gravity ?? 0.15

  let amp = opt.displacement
  let step = n
  let level = 1
  while (step > 1) {
    const half = step / 2
    for (let i = 0; i < n; i += step) {
      const a = values[i]
      const b = values[i + step]
      let mid = (a + b) / 2 + (opt.rng.next() * 2 - 1) * amp // 一様分布 [-amp, amp]
      // 中心へのソフトな引力 (極端に音域外へ逃げるのを防ぐ)
      mid += (center - mid) * gravity * (1 / level)
      // 音域で反射 (クランプより自然な曲線になる)
      if (mid > opt.max) mid = opt.max - (mid - opt.max) * 0.5
      if (mid < opt.min) mid = opt.min + (opt.min - mid) * 0.5
      mid = Math.max(opt.min, Math.min(opt.max, mid))
      values[i + half] = mid
      levels[i + half] = level
    }
    amp *= opt.roughness
    step = half
    level++
  }
  return { values, levels }
}

/** 曲線 values を 0..1 の位置 t でサンプリング (線形補間) */
export function sampleCurve(values: number[], t: number): number {
  const n = values.length - 1
  const x = Math.max(0, Math.min(1, t)) * n
  const i = Math.floor(x)
  if (i >= n) return values[n]
  const f = x - i
  return values[i] * (1 - f) + values[i + 1] * f
}

/** 任意の点数 count+1 のマクロ骨格を生成 (フレーズ中心音の決定に使用) */
export function macroSkeleton(
  count: number,
  opt: Omit<MPDOptions, 'depth'>,
): { index: number; value: number; level: number }[] {
  const depth = Math.max(1, Math.ceil(Math.log2(Math.max(1, count))))
  const res = midpointDisplace({ ...opt, depth })
  const out: { index: number; value: number; level: number }[] = []
  for (let i = 0; i <= count; i++) {
    const t = count === 0 ? 0 : i / count
    const x = t * (res.values.length - 1)
    const nearest = Math.round(x)
    out.push({ index: i, value: sampleCurve(res.values, t), level: res.levels[nearest] })
  }
  return out
}
