// 再生位置を rAF で購読するフック (React の再レンダーを避けて DOM を直接更新できる)
import { useEffect, useRef } from 'react'
import { audio } from '../../lib/audio-engine'

type Listener = (t: number, playing: boolean) => void
const listeners = new Set<Listener>()
let raf = 0
let idleT = 0

function loop() {
  const playing = audio.playing
  const t = playing ? audio.position() : idleT
  listeners.forEach((l) => l(t, playing))
  raf = requestAnimationFrame(loop)
}

export function setIdlePosition(t: number) {
  idleT = t
}

export function usePlayhead(cb: Listener) {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => {
    const l: Listener = (t, p) => ref.current(t, p)
    listeners.add(l)
    if (!raf) raf = requestAnimationFrame(loop)
    return () => {
      listeners.delete(l)
      if (!listeners.size) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }
  }, [])
}

export function fmtTime(t: number) {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const cs = Math.floor((t * 100) % 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}
