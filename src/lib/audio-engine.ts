// ============================================================
// lib/audio-engine.ts — Web Audio によるシンセ & シーケンス再生
//  (ブラウザ専用。楽譜データ Note[] を実際の音声に変換する)
// ============================================================
import type { Instrument, Note } from './types'
import { midiToFreq } from './theory'

export interface AudioSettings {
  instrument: Instrument
  volume: number // 0-1
  reverb: number // 0-1
  attack: number // sec
  release: number // sec
  metronome: boolean
  brightness: number // 0-1 (フィルター)
}

interface Voice {
  stop: (when: number) => void
}

export const INSTRUMENTS: { id: Instrument; label: string; emoji: string; desc: string }[] = [
  { id: 'piano', label: 'ソフトピアノ', emoji: '🎹', desc: '三角波 + 減衰' },
  { id: 'bell', label: 'キラキラベル', emoji: '🔔', desc: 'FM 合成' },
  { id: 'marimba', label: 'マリンバ', emoji: '🪵', desc: '短い減衰' },
  { id: 'lead', label: 'シンセリード', emoji: '⚡', desc: 'ノコギリ波' },
  { id: 'pad', label: 'ふんわりパッド', emoji: '☁️', desc: 'デチューン' },
  { id: 'chip', label: '8bit チップ', emoji: '👾', desc: '矩形波' },
]

class AudioEngine {
  ctx: AudioContext | null = null
  master!: GainNode
  dry!: GainNode
  wet!: GainNode
  filter!: BiquadFilterNode
  analyser!: AnalyserNode
  convolver!: ConvolverNode
  settings: AudioSettings = {
    instrument: 'piano',
    volume: 0.75,
    reverb: 0.28,
    attack: 0.008,
    release: 0.25,
    metronome: false,
    brightness: 0.7,
  }
  private live = new Map<number, Voice>()
  // 再生状態
  private timer: number | null = null
  private playStartCtx = 0
  private playStartPos = 0
  private scheduledUntil = 0
  private seq: Note[] = []
  private endTime = 0
  private loop = false
  private lastClick = -1
  private scheduled: Voice[] = []
  playing = false
  onEnded: (() => void) | null = null
  onNoteVisual: ((midi: number, on: boolean) => void) | null = null

  ensure(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return this.ctx
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext
    const ctx: AudioContext = new AC()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.dry = ctx.createGain()
    this.wet = ctx.createGain()
    this.convolver = ctx.createConvolver()
    this.convolver.buffer = this.makeImpulse(2.4, 2.8)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 512
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    this.filter.connect(this.dry)
    this.filter.connect(this.convolver)
    this.convolver.connect(this.wet)
    this.dry.connect(this.master)
    this.wet.connect(this.master)
    this.master.connect(comp)
    comp.connect(this.analyser)
    this.analyser.connect(ctx.destination)
    this.apply()
    return ctx
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
    return buf
  }

  update(s: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...s }
    this.apply()
  }

  private apply() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(this.settings.volume * 0.9, t, 0.02)
    this.wet.gain.setTargetAtTime(this.settings.reverb * 0.9, t, 0.02)
    this.dry.gain.setTargetAtTime(1 - this.settings.reverb * 0.35, t, 0.02)
    this.filter.frequency.setTargetAtTime(800 + Math.pow(this.settings.brightness, 2) * 15000, t, 0.02)
  }

  /** 1音を合成。when=開始時刻, dur=省略時は noteOff まで持続 */
  private voice(midi: number, when: number, velocity = 0.8, dur?: number): Voice {
    const ctx = this.ensure()
    const f = midiToFreq(midi)
    const s = this.settings
    const out = ctx.createGain()
    out.connect(this.filter)
    const v = 0.22 * velocity
    const oscs: OscillatorNode[] = []
    const atk = Math.max(0.002, s.attack)
    let sustainLevel = v * 0.6
    let decay = 0.4
    const mk = (type: OscillatorType, freq: number, gain: number, detune = 0) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq
      o.detune.value = detune
      const g = ctx.createGain()
      g.gain.value = gain
      o.connect(g)
      g.connect(out)
      oscs.push(o)
      return o
    }
    switch (s.instrument) {
      case 'piano':
        mk('triangle', f, 0.9)
        mk('sine', f * 2, 0.25)
        mk('sine', f * 3, 0.06)
        sustainLevel = v * 0.25
        decay = 1.1
        break
      case 'bell': {
        const car = mk('sine', f, 0.9)
        const mod = ctx.createOscillator()
        mod.frequency.value = f * 3.5
        const mg = ctx.createGain()
        mg.gain.setValueAtTime(f * 2.2, when)
        mg.gain.exponentialRampToValueAtTime(f * 0.1, when + 1.2)
        mod.connect(mg)
        mg.connect(car.frequency)
        oscs.push(mod)
        mk('sine', f * 2, 0.15)
        sustainLevel = v * 0.08
        decay = 1.6
        break
      }
      case 'marimba':
        mk('sine', f, 1)
        mk('sine', f * 4, 0.18)
        sustainLevel = v * 0.001
        decay = 0.35
        break
      case 'lead':
        mk('sawtooth', f, 0.45, -6)
        mk('sawtooth', f, 0.45, 6)
        mk('square', f / 2, 0.15)
        sustainLevel = v * 0.55
        decay = 0.2
        break
      case 'pad':
        mk('sawtooth', f, 0.3, -12)
        mk('sawtooth', f, 0.3, 12)
        mk('triangle', f * 2, 0.25, 3)
        sustainLevel = v * 0.7
        decay = 0.6
        break
      case 'chip':
        mk('square', f, 0.38)
        mk('square', f * 2, 0.06)
        sustainLevel = v * 0.55
        decay = 0.1
        break
    }
    const padAtk = s.instrument === 'pad' ? Math.max(atk, 0.25) : atk
    const g = out.gain
    g.setValueAtTime(0, when)
    g.linearRampToValueAtTime(v, when + padAtk)
    g.setTargetAtTime(Math.max(0.0001, sustainLevel), when + padAtk, decay / 3)
    oscs.forEach((o) => o.start(when))
    let stopped = false
    const stop = (t: number) => {
      if (stopped) return
      stopped = true
      const rel = Math.max(0.03, s.release)
      const at = Math.max(t, when + 0.01)
      g.cancelScheduledValues(at)
      g.setTargetAtTime(0, at, rel / 4)
      oscs.forEach((o) => {
        try {
          o.stop(at + rel * 1.5 + 0.05)
        } catch {}
      })
      setTimeout(() => out.disconnect(), (at - ctx.currentTime + rel * 1.5 + 0.3) * 1000)
    }
    if (dur !== undefined) stop(when + dur)
    return { stop }
  }

  click(when: number, accent: boolean) {
    const ctx = this.ensure()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = accent ? 1760 : 1175
    o.type = 'sine'
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(accent ? 0.25 : 0.14, when + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06)
    o.connect(g)
    g.connect(this.master)
    o.start(when)
    o.stop(when + 0.08)
  }

  // ---------- ライブ演奏 ----------
  noteOn(midi: number, velocity = 0.85) {
    const ctx = this.ensure()
    this.noteOff(midi)
    this.live.set(midi, this.voice(midi, ctx.currentTime, velocity))
  }
  noteOff(midi: number) {
    const v = this.live.get(midi)
    if (v && this.ctx) v.stop(this.ctx.currentTime)
    this.live.delete(midi)
  }
  preview(midi: number, dur = 0.35, velocity = 0.8) {
    const ctx = this.ensure()
    this.voice(midi, ctx.currentTime, velocity, dur)
  }

  // ---------- シーケンス再生 (lookahead スケジューラ) ----------
  private bpm = 120
  private beatsPerBar = 4

  play(seq: Note[], from: number, opts: { bpm: number; beatsPerBar: number; loop: boolean; tail?: number }) {
    const ctx = this.ensure()
    this.stop(false)
    this.seq = [...seq].sort((a, b) => a.startTime - b.startTime)
    this.bpm = opts.bpm
    this.beatsPerBar = opts.beatsPerBar
    this.loop = opts.loop
    const contentEnd = this.seq.reduce((m, n) => Math.max(m, n.startTime + n.duration), 0)
    this.endTime = Math.max(contentEnd, opts.tail ?? 0)
    this.playStartCtx = ctx.currentTime + 0.06
    this.playStartPos = from
    this.scheduledUntil = from
    this.lastClick = Math.floor(from / (60 / this.bpm)) - 1
    this.playing = true
    this.tick()
    this.timer = window.setInterval(() => this.tick(), 25)
  }

  /** 録音用: シーケンスなしで時計だけ進める */
  startClock(from: number, opts: { bpm: number; beatsPerBar: number; seq?: Note[] }) {
    this.play(opts.seq ?? [], from, { bpm: opts.bpm, beatsPerBar: opts.beatsPerBar, loop: false, tail: 1e9 })
  }

  private tick() {
    if (!this.ctx || !this.playing) return
    const now = this.position()
    const horizon = now + 0.12
    if (this.endTime > 0 && now >= this.endTime + 0.05) {
      if (this.loop && this.endTime < 1e8) {
        const ctx = this.ctx
        this.scheduled = []
        this.playStartCtx = ctx.currentTime + 0.02
        this.playStartPos = 0
        this.scheduledUntil = 0
        this.lastClick = -1
        return
      }
      this.stop(true)
      return
    }
    const from = this.scheduledUntil
    const to = Math.min(horizon, this.endTime < 1e8 ? this.endTime + 0.06 : horizon)
    if (to <= from) return
    for (const n of this.seq) {
      if (n.startTime >= from && n.startTime < to) {
        const when = this.playStartCtx + (n.startTime - this.playStartPos)
        this.scheduled.push(this.voice(n.midiNoteNumber, when, n.velocity ?? 0.8, n.duration))
        const delayOn = (when - this.ctx.currentTime) * 1000
        const midi = n.midiNoteNumber
        window.setTimeout(() => this.onNoteVisual?.(midi, true), Math.max(0, delayOn))
        window.setTimeout(() => this.onNoteVisual?.(midi, false), Math.max(0, delayOn + n.duration * 1000))
      }
    }
    if (this.settings.metronome) {
      const spb = 60 / this.bpm
      const b0 = Math.ceil(from / spb - 1e-9)
      for (let b = b0; b * spb < to; b++) {
        if (b <= this.lastClick) continue
        this.lastClick = b
        this.click(this.playStartCtx + (b * spb - this.playStartPos), b % this.beatsPerBar === 0)
      }
    }
    this.scheduledUntil = to
  }

  position(): number {
    if (!this.ctx || !this.playing) return this.playStartPos
    return Math.max(this.playStartPos, this.playStartPos + (this.ctx.currentTime - this.playStartCtx))
  }

  stop(fireEnded = false) {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = null
    const wasPlaying = this.playing
    this.playing = false
    if (this.ctx) {
      const t = this.ctx.currentTime
      this.scheduled.forEach((v) => v.stop(t))
    }
    this.scheduled = []
    if (fireEnded && wasPlaying) this.onEnded?.()
  }

  level(): number {
    if (!this.analyser) return 0
    const arr = new Uint8Array(this.analyser.fftSize)
    this.analyser.getByteTimeDomainData(arr)
    let s = 0
    for (let i = 0; i < arr.length; i++) {
      const v = (arr[i] - 128) / 128
      s += v * v
    }
    return Math.min(1, Math.sqrt(s / arr.length) * 3.2)
  }

  spectrum(bins = 24): number[] {
    if (!this.analyser) return new Array(bins).fill(0)
    const arr = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(arr)
    const out: number[] = []
    const per = Math.floor(arr.length / 2 / bins)
    for (let i = 0; i < bins; i++) {
      let s = 0
      for (let k = 0; k < per; k++) s += arr[i * per + k]
      out.push(s / per / 255)
    }
    return out
  }
}

export const audio = new AudioEngine()

// ---------- Standard MIDI File 書き出し ----------
export function toMidiFile(notes: Note[], bpm: number): Uint8Array {
  const ppq = 480
  const spb = 60 / bpm
  const evs: { tick: number; data: number[] }[] = []
  notes.forEach((n) => {
    const on = Math.round((n.startTime / spb) * ppq)
    const off = Math.round(((n.startTime + n.duration) / spb) * ppq)
    const vel = Math.max(1, Math.min(127, Math.round((n.velocity ?? 0.8) * 127)))
    evs.push({ tick: on, data: [0x90, n.midiNoteNumber, vel] })
    evs.push({ tick: Math.max(on + 1, off), data: [0x80, n.midiNoteNumber, 0] })
  })
  evs.sort((a, b) => a.tick - b.tick || (a.data[0] === 0x80 ? -1 : 1))
  const vlq = (v: number) => {
    const bytes = [v & 0x7f]
    while ((v >>= 7)) bytes.unshift((v & 0x7f) | 0x80)
    return bytes
  }
  const mpqn = Math.round(60000000 / bpm)
  const track: number[] = [0, 0xff, 0x51, 0x03, (mpqn >> 16) & 255, (mpqn >> 8) & 255, mpqn & 255]
  let last = 0
  evs.forEach((e) => {
    track.push(...vlq(e.tick - last), ...e.data)
    last = e.tick
  })
  track.push(0, 0xff, 0x2f, 0)
  const u32 = (v: number) => [(v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255]
  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, (ppq >> 8) & 255, ppq & 255]
  const trk = [0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track]
  return new Uint8Array([...header, ...trk])
}
