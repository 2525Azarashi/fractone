// リズム可視化: 小節×16分ステップのオンセット格子 / ベロシティレーン / 音価分布
import { memo, useMemo } from 'react'
import type { Analysis, Note, TimeSignature } from '../../lib/types'
import { TIME_SIGS } from '../../lib/theory'

function RhythmVizImpl({ sequence, bpm, timeSig, analysis, generation }: { sequence: Note[]; bpm: number; timeSig: TimeSignature; analysis: Analysis | null; generation: number }) {
  const spb = 60 / bpm
  const { beatsPerBar } = TIME_SIGS[timeSig]
  const steps = beatsPerBar * 4
  const bars = useMemo(() => {
    const map = new Map<number, { step: number; len: number; vel: number; ai: boolean }[]>()
    sequence.forEach((n) => {
      const beat = n.startTime / spb
      const bar = Math.floor(beat / beatsPerBar + 1e-6)
      const step = Math.round((beat - bar * beatsPerBar) * 4)
      const arr = map.get(bar) ?? []
      arr.push({ step: Math.min(steps - 1, step), len: Math.max(1, Math.round((n.duration / spb) * 4)), vel: n.velocity ?? 0.8, ai: n.source === 'ai' })
      map.set(bar, arr)
    })
    const maxBar = Math.max(0, ...map.keys())
    return Array.from({ length: Math.min(32, maxBar + 1) }, (_, i) => map.get(i) ?? [])
  }, [sequence, spb, beatsPerBar, steps])

  const maxDur = Math.max(1, ...(analysis?.durationHist.map((d) => d.count) ?? [1]))
  const sorted = [...sequence].sort((a, b) => a.startTime - b.startTime)

  return (
    <div className="grid h-full grid-rows-[1fr_auto] gap-3" key={generation}>
      <div className="thin-scroll neu-inset overflow-auto rounded-2xl p-3">
        <div className="mb-2 flex items-center gap-3 text-[10px] font-medium text-[var(--tx-3)]">
          <span className="eyebrow">Step grid · 1/16</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#ff5bd6]" />You</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#4fe3ff]" />AI</span>
          <span className="ml-auto font-mono">{timeSig} · {bpm} BPM</span>
        </div>
        <div className="space-y-1.5">
          {bars.map((evs, bi) => (
            <div key={bi} className="fade-up flex items-center gap-2" style={{ ['--d' as any]: `${bi * 40}ms` }}>
              <span className="w-6 text-right font-mono text-[9.5px] text-[var(--tx-3)]">{bi + 1}</span>
              <div className="relative grid flex-1 gap-[3px]" style={{ gridTemplateColumns: `repeat(${steps}, minmax(0,1fr))` }}>
                {Array.from({ length: steps }).map((_, s) => {
                  const ev = evs.find((e) => e.step === s)
                  const sustain = !ev && evs.some((e) => s > e.step && s < e.step + e.len)
                  const strong = s % 4 === 0
                  return (
                    <div
                      key={s}
                      className={`h-4 rounded-[3px] transition-all duration-300 ${ev ? 'pop-in' : ''}`}
                      style={{
                        background: ev
                          ? ev.ai ? '#4fe3ff' : '#ff5bd6'
                          : sustain ? 'rgba(255,255,255,0.09)' : strong ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.022)',
                        opacity: ev ? 0.45 + ev.vel * 0.55 : 1,
                        boxShadow: ev ? `0 0 10px ${ev.ai ? 'rgba(57,230,255,.45)' : 'rgba(255,79,216,.45)'}` : 'inset 1px 1px 2px rgba(0,0,0,.4)',
                        animationDelay: `${bi * 40 + s * 8}ms`,
                        marginLeft: s % 4 === 0 && s ? 3 : 0,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          ))}
          {bars.length === 0 && <p className="py-10 text-center text-xs text-[var(--tx-3)]">音符がまだありません</p>}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[1.5fr_1fr]">
        <div className="neu-inset rounded-2xl p-3">
          <p className="mb-2 flex justify-between"><span className="eyebrow">Velocity</span><span className="text-[10px] text-[var(--tx-3)]">強弱の流れ / Humanize</span></p>
          <div className="flex h-16 items-end gap-[2px]">
            {sorted.slice(0, 120).map((n, i) => (
              <div key={n.id} className="bar-grow flex-1 rounded-t-sm" style={{ height: `${(n.velocity ?? 0.8) * 100}%`, background: n.source === 'ai' ? '#4fe3ff' : '#ff5bd6', ['--d' as any]: `${i * 8}ms` }} />
            ))}
          </div>
        </div>
        <div className="neu-inset rounded-2xl p-3">
          <p className="mb-2 flex justify-between"><span className="eyebrow">Duration</span><span className="text-[10px] text-[var(--tx-3)]">音価の分布</span></p>
          <div className="flex h-16 items-stretch gap-2">
            {(analysis?.durationHist ?? []).map((d, i) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="relative w-full flex-1">
                  <div className="bar-grow absolute bottom-0 w-full rounded-t-md bg-white/70" style={{ height: `${(d.count / maxDur) * 100}%`, ['--d' as any]: `${i * 70}ms` }} />
                </div>
                <span className="text-[8.5px] font-medium text-[var(--tx-3)]">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
export const RhythmViz = memo(RhythmVizImpl)
