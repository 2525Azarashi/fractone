// ============================================================
// FracTone — 最上位コンポーネント (状態は useReducer で一元管理)
// ============================================================
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { initState, reducer, type Tab } from './state'
import type { ComposeResult, Note } from '../lib/types'
import { audio, toMidiFile } from '../lib/audio-engine'
import { compose } from '../lib/composer'
import { analyze } from '../lib/analysis'
import { NOTE_NAMES, SCALES, TIME_SIGS, uid } from '../lib/theory'
import { Header } from './components/Header'
import { ParamPanel } from './components/ParamPanel'
import { AnalysisPanel } from './components/AnalysisPanel'
import { PianoRoll } from './components/PianoRoll'
import { PianoUI, KEYMAP } from './components/PianoUI'
import { PitchViz } from './components/PitchViz'
import { RhythmViz } from './components/RhythmViz'
import { AudioPanel } from './components/AudioPanel'
import { Controls } from './components/Controls'
import { Chip, KineticText } from './components/ui'
import { setIdlePosition } from './hooks/useTransport'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'roll', label: 'ピアノロール', icon: '🎹' },
  { id: 'pitch', label: 'ピッチ可視化', icon: '〰' },
  { id: 'rhythm', label: 'リズム可視化', icon: '🥁' },
  { id: 'audio', label: 'オーディオ設定', icon: '🎚' },
]

interface Toast { id: number; text: string; tone: 'mag' | 'cy' | 'mint' }

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initState)
  const stateRef = useRef(state)
  stateRef.current = state
  const [toasts, setToasts] = useState<Toast[]>([])
  const [splash, setSplash] = useState(true)
  const [burst, setBurst] = useState<{ depth: number; mode: string } | null>(null)
  const pressed = useRef(new Map<number, { t: number; vel: number }>())
  const lastMode = useRef<'continue' | 'new'>('continue')
  const volBeforeMute = useRef(0.75)

  const toast = useCallback((text: string, tone: Toast['tone'] = 'mag') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800)
  }, [])

  // ---- オーディオ設定の反映 / 可視化コールバック ----
  useEffect(() => audio.update(state.audio), [state.audio])
  useEffect(() => {
    audio.onNoteVisual = (midi, on) => dispatch({ type: 'aiKey', midi, on })
    audio.onEnded = () => {
      const s = stateRef.current
      dispatch({ type: 'status', status: 'idle' })
      dispatch({ type: 'clearAiKeys' })
      setIdlePosition(s.cursor)
    }
  }, [])

  // ---- 永続化 (localStorage) ----
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem('fractone:v1', JSON.stringify({ sequence: state.sequence, params: state.params, audio: state.audio }))
      } catch {}
    }, 400)
    return () => clearTimeout(id)
  }, [state.sequence, state.params, state.audio])

  // ---- リアルタイム楽典分析 (シーケンスやキーが変わるたび) ----
  const analysis = useMemo(
    () => analyze(state.sequence, state.params.key, state.params.scale, state.params.bpm, state.params.timeSig),
    [state.sequence, state.params.key, state.params.scale, state.params.bpm, state.params.timeSig],
  )

  const spb = 60 / state.params.bpm
  const bpb = TIME_SIGS[state.params.timeSig].beatsPerBar

  // ---------------- 演奏 & 録音 ----------------
  const press = useCallback((midi: number, vel = 0.85) => {
    audio.noteOn(midi, vel)
    dispatch({ type: 'keyDown', midi })
    if (stateRef.current.status === 'recording') pressed.current.set(midi, { t: audio.position(), vel })
  }, [])

  const release = useCallback((midi: number) => {
    audio.noteOff(midi)
    dispatch({ type: 'keyUp', midi })
    const s = stateRef.current
    const p = pressed.current.get(midi)
    if (p && s.status === 'recording') {
      pressed.current.delete(midi)
      const spbNow = 60 / s.params.bpm
      let start = p.t
      let dur = Math.max(0.06, audio.position() - p.t)
      if (s.quantizeRec) {
        const g = s.snap
        start = Math.round(start / spbNow / g) * g * spbNow
        dur = Math.max(g, Math.round(dur / spbNow / g) * g) * spbNow
      }
      dispatch({ type: 'addNotes', notes: [{ id: uid('u'), midiNoteNumber: midi, startTime: start, duration: dur, velocity: p.vel, source: 'user' }] })
    }
  }, [])

  const stopAll = useCallback((resetCursor = false) => {
    audio.stop(false)
    pressed.current.forEach((_, m) => release(m))
    dispatch({ type: 'status', status: 'idle' })
    dispatch({ type: 'clearAiKeys' })
    if (resetCursor) {
      dispatch({ type: 'cursor', t: 0 })
      setIdlePosition(0)
    } else setIdlePosition(stateRef.current.cursor)
  }, [release])

  const togglePlay = useCallback(() => {
    const s = stateRef.current
    if (s.status === 'playing' || s.status === 'recording') {
      const pos = audio.position()
      audio.stop(false)
      dispatch({ type: 'status', status: 'idle' })
      dispatch({ type: 'clearAiKeys' })
      dispatch({ type: 'cursor', t: pos })
      setIdlePosition(pos)
      return
    }
    if (!s.sequence.length) return toast('まずは音符を置いてみよう 🎹', 'cy')
    const end = s.sequence.reduce((m, n) => Math.max(m, n.startTime + n.duration), 0)
    const from = s.cursor >= end - 0.05 ? 0 : s.cursor
    audio.play(s.sequence, from, { bpm: s.params.bpm, beatsPerBar: TIME_SIGS[s.params.timeSig].beatsPerBar, loop: s.loop })
    dispatch({ type: 'status', status: 'playing' })
  }, [toast])

  const toggleRecord = useCallback(() => {
    const s = stateRef.current
    if (s.status === 'recording') {
      stopAll()
      toast('録音を停止しました', 'mint')
      return
    }
    audio.stop(false)
    // カウントインなしで、カーソル位置から既存音符を流しつつ録音
    audio.startClock(s.cursor, { bpm: s.params.bpm, beatsPerBar: TIME_SIGS[s.params.timeSig].beatsPerBar, seq: s.sequence })
    dispatch({ type: 'status', status: 'recording', message: '録音中' })
    toast('● 録音開始 — 鍵盤を弾いてね', 'mag')
  }, [stopAll, toast])

  // ---------------- 作曲 (中点変位法) ----------------
  const runCompose = useCallback(async (mode: 'continue' | 'new', seedOverride?: number) => {
    const s = stateRef.current
    audio.stop(false)
    lastMode.current = mode
    const params = { ...s.params, seed: seedOverride ?? s.params.seed }
    if (seedOverride !== undefined) dispatch({ type: 'params', patch: { seed: seedOverride } })
    const userSeq = s.sequence.filter((n) => n.source !== 'ai')
    if (mode === 'continue' && userSeq.length < 2) return toast('続きを作るには2音以上入力してね', 'cy')
    dispatch({ type: 'status', status: 'composing' })
    setBurst({ depth: params.depth, mode })
    const t0 = performance.now()
    let result: ComposeResult
    try {
      const res = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, sequence: mode === 'continue' ? userSeq : [], params }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      result = (await res.json()).result
    } catch {
      // オフライン時はクライアントで同じアルゴリズムを実行
      result = compose({ mode, sequence: mode === 'continue' ? userSeq : [], params }, 'client')
    }
    // 演出: 最低 950ms は分割アニメーションを見せる
    const wait = Math.max(0, 950 - (performance.now() - t0))
    await new Promise((r) => setTimeout(r, wait))
    setBurst(null)
    const next: Note[] = mode === 'continue' ? [...userSeq, ...result.notes] : result.notes
    dispatch({ type: 'setSequence', seq: next })
    dispatch({ type: 'result', result })
    dispatch({ type: 'status', status: 'done' })
    toast(`✨ ${result.notes.length} 音符を作曲しました`, 'cy')
    // 生成部分の頭から試聴
    const from = mode === 'continue' ? Math.max(0, result.startBeat * (60 / params.bpm) - (60 / params.bpm) * TIME_SIGS[params.timeSig].beatsPerBar) : 0
    dispatch({ type: 'cursor', t: from })
    setIdlePosition(from)
  }, [toast])

  // ---------------- 編集 ----------------
  const deleteSelected = useCallback(() => {
    const s = stateRef.current
    if (s.selected.length) dispatch({ type: 'removeNotes', ids: s.selected })
  }, [])

  const quantize = useCallback(() => {
    const s = stateRef.current
    const spbN = 60 / s.params.bpm
    const g = s.snap
    const target = s.selected.length ? s.sequence.filter((n) => s.selected.includes(n.id)) : s.sequence
    dispatch({
      type: 'updateNotes',
      record: true,
      notes: target.map((n) => ({
        ...n,
        startTime: Math.round(n.startTime / spbN / g) * g * spbN,
        duration: Math.max(g, Math.round(n.duration / spbN / g) * g) * spbN,
      })),
    })
    toast(`⊞ ${target.length} 音をクオンタイズ`, 'mint')
  }, [toast])

  const acceptAi = useCallback(() => {
    const s = stateRef.current
    dispatch({ type: 'setSequence', seq: s.sequence.map((n) => (n.source === 'ai' ? { ...n, source: 'user' as const, id: uid('u') } : n)) })
    dispatch({ type: 'result', result: null })
    toast('✔ AI の音符をあなたのメロディに採用しました。さらに続きを作れます', 'mint')
  }, [toast])

  const save = useCallback(() => {
    const s = stateRef.current
    if (!s.sequence.length) return toast('保存する音符がありません', 'cy')
    const bytes = toMidiFile(s.sequence, s.params.bpm)
    const blob = new Blob([bytes as BlobPart], { type: 'audio/midi' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `fractone_${NOTE_NAMES[s.params.key]}${s.params.scale}_${s.params.seed}.mid`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    toast('💾 ブラウザに保存 & MIDI をダウンロードしました', 'mint')
  }, [toast])

  const clearAll = useCallback(() => {
    stopAll(true)
    dispatch({ type: 'setSequence', seq: [] })
    dispatch({ type: 'result', result: null })
  }, [stopAll])

  // ---------------- PCキーボード ----------------
  useEffect(() => {
    const isField = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')
    }
    const down = (e: KeyboardEvent) => {
      if (isField(e) && (e.target as HTMLInputElement).type !== 'range') return
      const s = stateRef.current
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (k in KEYMAP) {
        e.preventDefault()
        if (e.repeat) return
        const midi = (s.baseOctave + 1) * 12 + KEYMAP[k]
        press(midi)
        return
      }
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); return }
      if (k === 'enter') { e.preventDefault(); stopAll(true); return }
      if (k === 'r') { toggleRecord(); return }
      if (k === 'z') { dispatch({ type: 'octave', delta: -1 }); return }
      if (k === 'x') { dispatch({ type: 'octave', delta: 1 }); return }
      if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSelected(); return }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) && s.selected.length) {
        e.preventDefault()
        const spbN = 60 / s.params.bpm
        const dp = k === 'arrowup' ? (e.shiftKey ? 12 : 1) : k === 'arrowdown' ? (e.shiftKey ? -12 : -1) : 0
        const dt = k === 'arrowright' ? s.snap * spbN : k === 'arrowleft' ? -s.snap * spbN : 0
        const sel = new Set(s.selected)
        const moved = s.sequence.filter((n) => sel.has(n.id)).map((n) => ({ ...n, midiNoteNumber: Math.max(36, Math.min(96, n.midiNoteNumber + dp)), startTime: Math.max(0, n.startTime + dt) }))
        dispatch({ type: 'updateNotes', notes: moved, record: true })
        if (dp && moved[0]) audio.preview(moved[0].midiNoteNumber, 0.18)
      }
      if (k === 'a' && e.shiftKey) dispatch({ type: 'select', ids: s.sequence.map((n) => n.id) })
    }
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k in KEYMAP) {
        const s = stateRef.current
        // オクターブ変更をまたいでも確実に離す
        const base = (s.baseOctave + 1) * 12 + KEYMAP[k]
        ;[base, base - 12, base + 12].forEach((m) => s.activeKeys.includes(m) && release(m))
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [press, release, togglePlay, toggleRecord, stopAll, deleteSelected])

  // テンポ変更時: 秒ベースのシーケンスを拍位置を保ったまま伸縮
  const prevBpm = useRef(state.params.bpm)
  useEffect(() => {
    const ratio = prevBpm.current / state.params.bpm
    prevBpm.current = state.params.bpm
    if (ratio === 1) return
    dispatch({
      type: 'setSequence',
      record: false,
      seq: stateRef.current.sequence.map((n) => ({ ...n, startTime: n.startTime * ratio, duration: n.duration * ratio })),
    })
  }, [state.params.bpm])

  // ---------------- タブのスライドインジケータ ----------------
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [ind, setInd] = useState({ left: 0, width: 0 })
  useEffect(() => {
    const i = TABS.findIndex((t) => t.id === state.tab)
    const el = tabRefs.current[i]
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth })
  }, [state.tab])
  useEffect(() => {
    const on = () => {
      const i = TABS.findIndex((t) => t.id === stateRef.current.tab)
      const el = tabRefs.current[i]
      if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth })
    }
    window.addEventListener('resize', on)
    const id = setTimeout(on, 300)
    return () => { window.removeEventListener('resize', on); clearTimeout(id) }
  }, [])

  // 画面幅に応じて鍵盤の音域を変える (モバイルは約1.5オクターブ)
  const [vw, setVw] = useState(() => window.innerWidth)
  useEffect(() => {
    const on = () => setVw(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const low = vw < 640 ? (state.baseOctave + 1) * 12 : vw < 1100 ? (state.baseOctave + 1) * 12 : state.baseOctave * 12
  const high = vw < 640 ? low + 11 : (state.baseOctave + 1) * 12 + 24
  const busy = state.status === 'composing'

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="blob" style={{ width: 420, height: 420, left: -120, top: 80, background: '#b23cff' }} />
      <div className="blob" style={{ width: 360, height: 360, right: -80, top: 260, background: '#39e6ff', animationDelay: '-6s' }} />
      <div className="blob" style={{ width: 380, height: 380, left: '40%', bottom: -160, background: '#ff4fd8', animationDelay: '-11s' }} />

      <div className="relative z-10 mx-auto flex max-w-[1680px] flex-col gap-3 p-3 md:p-4">
        <Header state={state} onToggleMute={() => {
          if (state.audio.volume > 0) { volBeforeMute.current = state.audio.volume; dispatch({ type: 'audio', patch: { volume: 0 } }) }
          else dispatch({ type: 'audio', patch: { volume: volBeforeMute.current || 0.75 } })
        }} />

        <main className="grid grid-cols-1 gap-3 lg:grid-cols-[292px_minmax(0,1fr)_316px]">
          {/* ---- 左: パラメータ ---- */}
          <aside id="param-panel" className="order-2 min-w-0 lg:order-1">
            <ParamPanel state={state} dispatch={dispatch} busy={busy} onGenerate={() => runCompose('new')} onContinue={() => runCompose('continue')} onPlay={togglePlay} onSave={save} />
          </aside>

          {/* ---- 中央: 可視化 ---- */}
          <section id="visual-panel" className="neu fade-up order-1 flex min-w-0 min-h-[640px] flex-col gap-3 rounded-[26px] p-3 md:p-4 lg:order-2 lg:h-[calc(100vh-120px)] lg:min-h-[720px]" style={{ ['--d' as any]: '40ms' }}>
            <div className="flex flex-wrap items-center gap-2">
              <nav className="neu-inset relative flex rounded-2xl p-1" role="tablist">
                <span className="tab-indicator absolute top-1 h-[calc(100%-8px)] rounded-xl grad-bg shadow-[0_6px_18px_rgba(255,79,216,.4)]" style={{ left: ind.left, width: ind.width }} />
                {TABS.map((t, i) => (
                  <button
                    key={t.id}
                    ref={(el) => { tabRefs.current[i] = el }}
                    role="tab"
                    aria-selected={state.tab === t.id}
                    onClick={() => dispatch({ type: 'tab', tab: t.id })}
                    className={`relative z-10 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-extrabold transition-colors duration-300 ${state.tab === t.id ? 'text-white' : 'text-violet-200/60 hover:text-white'}`}
                  >
                    <span>{t.icon}</span>
                    <span className="hidden sm:inline">{t.label}</span><span className="sr-only sm:hidden">{t.label}</span>
                  </button>
                ))}
              </nav>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <Chip tone="cy"><span key={analysis.noteCount} className="kt-swap inline-block">{analysis.noteCount}</span> notes</Chip>
                <Chip tone="mag">{NOTE_NAMES[state.params.key]} {SCALES[state.params.scale].label}</Chip>
                <Chip tone="sun">{state.params.timeSig}</Chip>
              </div>
            </div>

            <Controls
              state={state}
              dispatch={dispatch}
              onRecord={toggleRecord}
              onPlay={togglePlay}
              onStop={() => stopAll(true)}
              onDelete={deleteSelected}
              onQuantize={quantize}
              onAcceptAi={acceptAi}
              onReroll={() => runCompose(lastMode.current, Math.floor(Math.random() * 99999))}
              onClear={clearAll}
            />

            <div className="relative min-h-[300px] flex-1">
              <div key={state.tab} className="fade-up absolute inset-0">
                {state.tab === 'roll' && <PianoRoll state={state} dispatch={dispatch} />}
                {state.tab === 'pitch' && <div className="neu-inset h-full rounded-2xl p-3"><PitchViz sequence={state.sequence} result={state.result} bpm={state.params.bpm} keyRoot={state.params.key} scale={state.params.scale} generation={state.generation} /></div>}
                {state.tab === 'rhythm' && <RhythmViz sequence={state.sequence} bpm={state.params.bpm} timeSig={state.params.timeSig} analysis={analysis} generation={state.generation} />}
                {state.tab === 'audio' && <AudioPanel settings={state.audio} dispatch={dispatch} />}
              </div>
              {burst && <ComposeBurst depth={burst.depth} mode={burst.mode} />}
            </div>

            {/* ---- 鍵盤 ---- */}
            <div className="neu-inset rounded-[20px] p-2 pt-8">
              <div className="-mt-6 mb-1 flex items-center justify-between px-1 text-[10px] font-bold text-violet-200/60">
                <div className="flex items-center gap-1.5">
                  <button className="neu-btn h-6 rounded-lg px-2" onClick={() => dispatch({ type: 'octave', delta: -1 })} aria-label="オクターブ下げる (Z)">◀ Z</button>
                  <span className="font-mono text-violet-100">Oct <span key={state.baseOctave} className="kt-swap inline-block text-fuchsia-300">{state.baseOctave}</span></span>
                  <button className="neu-btn h-6 rounded-lg px-2" onClick={() => dispatch({ type: 'octave', delta: 1 })} aria-label="オクターブ上げる (X)">X ▶</button>
                </div>
                <span className="hidden sm:inline">● = スケール内の音 / <span className="text-fuchsia-300">●</span> = 主音</span>
                <button className="flex items-center gap-1" onClick={() => dispatch({ type: 'toggle', key: 'quantizeRec' })}>
                  <span className={`h-3 w-3 rounded-[4px] ${state.quantizeRec ? 'grad-bg' : 'bg-white/10'}`} />録音時クオンタイズ
                </button>
              </div>
              <div className="h-[118px] sm:h-[132px]">
                <PianoUI low={low} high={high} activeKeys={state.activeKeys} aiKeys={state.aiKeys} baseOctave={state.baseOctave} keyRoot={state.params.key} scale={state.params.scale} onPress={press} onRelease={release} />
              </div>
            </div>
          </section>

          {/* ---- 右: 分析 ---- */}
          <aside id="analysis-panel" className="order-3 min-w-0">
            <AnalysisPanel state={state} analysis={analysis} result={state.result} />
          </aside>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 text-[10.5px] text-violet-200/45">
          <span>FracTone · 中点変位法 × モチーフ展開による作曲学習シーケンサー</span>
          <span className="flex items-center gap-1.5">
            Built with <b className="grad-text font-extrabold">Hono</b> · React · Web Audio · Cloudflare Pages
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
          </span>
        </footer>
      </div>

      {/* toasts */}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`pop-in rounded-full border px-4 py-2 text-[12px] font-bold text-white shadow-2xl backdrop-blur-xl ${t.tone === 'cy' ? 'border-cyan-300/30 bg-cyan-500/20' : t.tone === 'mint' ? 'border-emerald-300/30 bg-emerald-500/20' : 'border-fuchsia-300/30 bg-fuchsia-500/20'}`}>
            {t.text}
          </div>
        ))}
      </div>

      {splash && <Splash onStart={() => { audio.ensure(); [60, 64, 67, 72].forEach((m, i) => setTimeout(() => audio.preview(m, 0.4, 0.6), i * 110)); setSplash(false) }} />}
    </div>
  )
}

/** 生成中: 中点変位の再帰分割をインフォグラフィックで演出 */
function ComposeBurst({ depth, mode }: { depth: number; mode: string }) {
  const [lv, setLv] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setLv((l) => Math.min(depth, l + 1)), 900 / (depth + 1))
    return () => clearInterval(id)
  }, [depth])
  const W = 520, H = 120
  const n = 1 << lv
  const rnd = (i: number) => Math.sin(i * 12.9898 + lv * 3.1) * 43758.5453 % 1
  const pts = Array.from({ length: n + 1 }, (_, i) => [(i / n) * W, H / 2 + (i === 0 || i === n ? 0 : rnd(i) * 40 / Math.sqrt(lv || 1))])
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl bg-[#0b0618]/75 backdrop-blur-md">
      <p className="font-display text-[11px] font-bold tracking-[0.4em] text-cyan-200/70">{mode === 'continue' ? 'CONTINUING YOUR MELODY' : 'COMPOSING FROM SCRATCH'}</p>
      <h2 className="mt-1 font-display text-4xl font-black md:text-5xl">
        <KineticText key={lv} text={`Lv.${lv}`} className="grad-text" stagger={60} />
      </h2>
      <p className="mt-1 text-[12px] font-bold text-violet-100/80"><KineticText key={`t${lv}`} text={lv === 0 ? '両端の音を決定…' : `${n} 区間に分割して中点を変位`} /></p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-[min(520px,80%)]">
        <defs><linearGradient id="bl" x1="0" x2="1"><stop offset="0" stopColor="#ff4fd8" /><stop offset="1" stopColor="#39e6ff" /></linearGradient></defs>
        <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')} fill="none" stroke="url(#bl)" strokeWidth={3} strokeLinejoin="round" style={{ transition: 'd .2s' }} />
        {pts.map((p, i) => <circle key={`${lv}-${i}`} className="dot-pop" cx={p[0]} cy={p[1]} r={lv > 4 ? 2 : 4} fill="#fff" />)}
      </svg>
      <div className="mt-4 flex gap-1.5">
        {Array.from({ length: depth + 1 }).map((_, i) => (
          <span key={i} className={`h-1.5 w-6 rounded-full transition-all duration-300 ${i <= lv ? 'grad-bg' : 'bg-white/10'}`} />
        ))}
      </div>
    </div>
  )
}

/** スプラッシュ: Kinetic Typography + AudioContext のアンロック */
function Splash({ onStart }: { onStart: () => void }) {
  const [leaving, setLeaving] = useState(false)
  return (
    <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0b0618]/92 backdrop-blur-xl transition-all duration-500 ${leaving ? 'pointer-events-none scale-110 opacity-0' : ''}`}>
      <div className="blob" style={{ width: 380, height: 380, left: '30%', top: '20%', background: '#b23cff', opacity: 0.5 }} />
      <div className="blob" style={{ width: 300, height: 300, left: '50%', top: '40%', background: '#39e6ff', opacity: 0.35, animationDelay: '-5s' }} />
      <div className="relative text-center">
        <div className="mb-4 flex justify-center gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <span key={i} className="bar-grow w-2 rounded-full grad-bg" style={{ height: 14 + Math.abs(Math.sin(i * 1.3)) * 40, ['--d' as any]: `${i * 70}ms` }} />
          ))}
        </div>
        <h1 className="font-display text-6xl font-black tracking-tight md:text-8xl">
          <KineticText text="Frac" className="grad-text" stagger={70} />
          <KineticText text="Tone" className="text-white" stagger={70} />
        </h1>
        <p className="mt-3 text-[14px] font-bold text-violet-100/85 md:text-base">
          <KineticText text="あなたのメロディの「続き」を、フラクタルで。" stagger={28} />
        </p>
        <p className="fade-up mt-2 text-[11.5px] text-violet-200/55" style={{ ['--d' as any]: '900ms' }}>中点変位法 × モチーフ展開 × 楽典分析 — DTM をあそびながら学ぼう</p>
        <button
          onClick={() => { setLeaving(true); setTimeout(onStart, 380) }}
          className="btn-generate fade-up mt-8 rounded-full px-10 py-4 text-[15px] font-extrabold text-white"
          style={{ ['--d' as any]: '1100ms' }}
        >
          ♪ タップしてはじめる
        </button>
      </div>
    </div>
  )
}
