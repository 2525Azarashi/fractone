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
import { KineticText, RiseText, Toggle } from './components/ui'
import { ComposeDock } from './components/ComposeDock'
import { IArrowR, IBars, IChevL, IChevR, IRoll, ISliders, IWave } from './components/icons'
import { setIdlePosition } from './hooks/useTransport'

const TABS: { id: Tab; label: string; icon: (p: { size?: number; className?: string }) => JSX.Element }[] = [
  { id: 'roll', label: 'ピアノロール', icon: IRoll },
  { id: 'pitch', label: 'ピッチ可視化', icon: IWave },
  { id: 'rhythm', label: 'リズム可視化', icon: IBars },
  { id: 'audio', label: 'オーディオ設定', icon: ISliders },
]

interface Toast { id: number; text: string; tone: 'mag' | 'cy' | 'mint' }

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initState)
  const stateRef = useRef(state)
  stateRef.current = state
  const [toasts, setToasts] = useState<Toast[]>([])
  const [splash, setSplash] = useState(true)
  const [help, setHelp] = useState(false)
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
    if (!s.sequence.length) return toast('まず音符を置いてください', 'cy')
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
    toast('録音開始 — 鍵盤を弾いてください', 'mag')
  }, [stopAll, toast])

  // ---------------- 作曲 (中点変位法) ----------------
  const runCompose = useCallback(async (mode: 'continue' | 'new', seedOverride?: number) => {
    const s = stateRef.current
    audio.stop(false)
    lastMode.current = mode
    const params = { ...s.params, seed: seedOverride ?? s.params.seed }
    if (seedOverride !== undefined) dispatch({ type: 'params', patch: { seed: seedOverride } })
    const userSeq = s.sequence.filter((n) => n.source !== 'ai')
    if (mode === 'continue' && userSeq.length < 2) return toast('続きを作るには2音以上入力してください', 'cy')
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
    toast(`${result.notes.length} 音符を作曲しました`, 'cy')
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
    toast(`${target.length} 音をクオンタイズ`, 'mint')
  }, [toast])

  const acceptAi = useCallback(() => {
    const s = stateRef.current
    dispatch({ type: 'setSequence', seq: s.sequence.map((n) => (n.source === 'ai' ? { ...n, source: 'user' as const, id: uid('u') } : n)) })
    dispatch({ type: 'result', result: null })
    toast('AI の音符を採用しました — さらに続きを作れます', 'mint')
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
    toast('MIDI をダウンロードしました', 'mint')
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
      <div className="relative z-10 mx-auto flex max-w-[1720px] flex-col gap-4 p-3 md:p-5">
        <Header
          state={state}
          onHelp={() => setHelp(true)}
          onToggleMute={() => {
            if (state.audio.volume > 0) { volBeforeMute.current = state.audio.volume; dispatch({ type: 'audio', patch: { volume: 0 } }) }
            else dispatch({ type: 'audio', patch: { volume: volBeforeMute.current || 0.75 } })
          }}
        />

        <main className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_312px]">
          {/* ---- 左: 詳細パラメータ ---- */}
          <aside id="param-panel" className="order-2 min-w-0 lg:order-1">
            <ParamPanel state={state} dispatch={dispatch} onSave={save} />
          </aside>

          {/* ---- 中央: 作曲ドック + 可視化 + 鍵盤 ---- */}
          <section id="visual-panel" className="neu fade-up order-1 flex min-h-[660px] min-w-0 flex-col gap-3 rounded-2xl p-3 md:p-4 lg:order-2 lg:h-[calc(100vh-108px)] lg:min-h-[740px]" style={{ ['--d' as any]: '40ms' }}>
            {/* タブ */}
            <div className="flex items-center gap-3">
              <nav className="relative flex rounded-xl border border-[var(--line)] bg-black/25 p-1" role="tablist">
                <span className="tab-indicator absolute top-1 h-[calc(100%-8px)] rounded-lg border border-[var(--line-2)] bg-white/[0.07]" style={{ left: ind.left, width: ind.width }} />
                {TABS.map((t, i) => {
                  const Icon = t.icon
                  const on = state.tab === t.id
                  return (
                    <button
                      key={t.id}
                      ref={(el) => { tabRefs.current[i] = el }}
                      role="tab"
                      aria-selected={on}
                      aria-label={t.label}
                      onClick={() => dispatch({ type: 'tab', tab: t.id })}
                      className={`relative z-10 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors duration-300 ${on ? 'text-white' : 'text-[var(--tx-3)] hover:text-[var(--tx)]'}`}
                    >
                      <Icon size={14} className={on ? 'text-fuchsia-300' : ''} />
                      <span className="hidden sm:inline">{t.label}</span>
                    </button>
                  )
                })}
              </nav>
              <div className="ml-auto hidden items-center gap-4 text-[11px] text-[var(--tx-3)] md:flex">
                <span><span key={analysis.noteCount} className="kt-swap num inline-block text-white">{analysis.noteCount}</span> notes</span>
                <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-[#ff5bd6]" />You</span>
                <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-[#4fe3ff]" />AI</span>
              </div>
            </div>

            {/* 作曲ドック — 生成ボタンを音符のすぐ上に */}
            <ComposeDock
              state={state}
              dispatch={dispatch}
              busy={busy}
              onContinue={() => runCompose('continue')}
              onGenerate={() => runCompose('new')}
              onReroll={() => runCompose(lastMode.current, Math.floor(Math.random() * 99999))}
            />

            <Controls
              state={state}
              dispatch={dispatch}
              onRecord={toggleRecord}
              onPlay={togglePlay}
              onStop={() => stopAll(true)}
              onDelete={deleteSelected}
              onQuantize={quantize}
              onAcceptAi={acceptAi}
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

            {/* 鍵盤 */}
            <div className="rounded-2xl border border-[var(--line)] bg-black/30 p-2">
              <div className="mb-2 flex items-center justify-between px-1 text-[10.5px] text-[var(--tx-3)]">
                <div className="flex items-center gap-1">
                  <button className="neu-btn grid h-6 w-6 place-items-center rounded-md" onClick={() => dispatch({ type: 'octave', delta: -1 })} aria-label="オクターブ下げる (Z)" title="Z"><IChevL size={12} /></button>
                  <span className="num w-12 text-center text-[var(--tx-2)]">Oct <span key={state.baseOctave} className="kt-swap inline-block text-white">{state.baseOctave}</span></span>
                  <button className="neu-btn grid h-6 w-6 place-items-center rounded-md" onClick={() => dispatch({ type: 'octave', delta: 1 })} aria-label="オクターブ上げる (X)" title="X"><IChevR size={12} /></button>
                </div>
                <span className="hidden items-center gap-3 sm:flex">
                  <span className="flex items-center gap-1.5"><i className="h-1 w-1 rounded-full bg-white/50" />スケール音</span>
                  <span className="flex items-center gap-1.5"><i className="h-1 w-1 rounded-full bg-[#ff5bd6]" />主音</span>
                </span>
                <Toggle on={state.quantizeRec} onChange={() => dispatch({ type: 'toggle', key: 'quantizeRec' })} label="Rec Quantize" />
              </div>
              <div className="h-[112px] sm:h-[124px]">
                <PianoUI low={low} high={high} activeKeys={state.activeKeys} aiKeys={state.aiKeys} baseOctave={state.baseOctave} keyRoot={state.params.key} scale={state.params.scale} onPress={press} onRelease={release} />
              </div>
            </div>
          </section>

          {/* ---- 右: 分析 ---- */}
          <aside id="analysis-panel" className="order-3 min-w-0">
            <AnalysisPanel state={state} analysis={analysis} result={state.result} />
          </aside>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-1 pt-3 text-[11px] text-[var(--tx-3)]">
          <span>FracTone — Midpoint displacement × motif development</span>
          <span className="num">Built with <span className="text-[var(--tx)]">Hono</span> · React · Web Audio · Cloudflare</span>
        </footer>
      </div>

      {/* toasts */}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="pop-in flex items-center gap-2.5 rounded-xl border border-[var(--line-2)] bg-[#14101e]/90 px-4 py-2.5 text-[12px] font-medium text-white shadow-2xl backdrop-blur-xl">
            <i className={`h-1.5 w-1.5 rounded-full ${t.tone === 'cy' ? 'bg-[#4fe3ff]' : t.tone === 'mint' ? 'bg-emerald-300' : 'bg-[#ff5bd6]'}`} />
            {t.text}
          </div>
        ))}
      </div>

      {help && <HelpSheet onClose={() => setHelp(false)} />}
      {splash && <Splash onStart={() => { audio.ensure(); [60, 64, 67, 72].forEach((m, i) => setTimeout(() => audio.preview(m, 0.4, 0.55), i * 110)); setSplash(false) }} />}
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
  const rnd = (i: number) => (Math.sin(i * 12.9898 + 7.1) * 43758.5453) % 1
  const pts = Array.from({ length: n + 1 }, (_, i) => [(i / n) * W, H / 2 + (i === 0 || i === n ? 0 : rnd(i * (64 / n)) * 42)])
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl bg-[#0a0812]/82 backdrop-blur-md">
      <p className="eyebrow">{mode === 'continue' ? 'Continuing your melody' : 'Composing from a new motif'}</p>
      <h2 className="mt-3 flex items-baseline gap-3 font-display text-white">
        <span className="text-[13px] text-[var(--tx-3)]">LEVEL</span>
        <span className="text-6xl font-semibold tracking-tight"><KineticText key={lv} text={String(lv).padStart(2, '0')} stagger={60} /></span>
        <span className="text-[13px] text-[var(--tx-3)]">/ {String(depth).padStart(2, '0')}</span>
      </h2>
      <p className="mt-2 text-[12px] text-[var(--tx-2)]"><KineticText key={`t${lv}`} text={lv === 0 ? '両端の音を決定' : `${n} 区間 — 中点を変位`} stagger={20} /></p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-6 w-[min(520px,80%)] overflow-visible">
        <defs><linearGradient id="bl" x1="0" x2="1"><stop offset="0" stopColor="#ff5bd6" /><stop offset=".6" stopColor="#8b5cff" /><stop offset="1" stopColor="#4fe3ff" /></linearGradient></defs>
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,.08)" strokeDasharray="2 4" />
        <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')} fill="none" stroke="url(#bl)" strokeWidth={1.6} strokeLinejoin="round" style={{ transition: 'd .25s var(--ease)' }} />
        {pts.map((p, i) => <circle key={`${lv}-${i}`} className="dot-pop" cx={p[0]} cy={p[1]} r={lv > 4 ? 1.6 : 3} fill="#0a0812" stroke="#fff" strokeWidth={1.2} />)}
      </svg>
      <div className="mt-6 flex gap-1">
        {Array.from({ length: depth + 1 }).map((_, i) => (
          <span key={i} className={`h-[3px] w-7 rounded-full transition-all duration-300 ${i <= lv ? 'bg-white' : 'bg-white/10'}`} />
        ))}
      </div>
    </div>
  )
}

/** ショートカット一覧 */
function HelpSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  const rows: [string, string][] = [
    ['A – ;', '鍵盤を演奏 (白鍵)'], ['W E T Y U O P', '黒鍵'], ['Z / X', 'オクターブ ↓ / ↑'],
    ['Space', '再生 / 一時停止'], ['R', '録音'], ['Enter', '停止して先頭へ'],
    ['Delete', '選択した音符を削除'], ['↑ ↓ ← →', '選択を移動 (Shift で 1oct)'], ['Ctrl + Z', '元に戻す'],
    ['Double click', '音符を追加'], ['Drag', '移動 / 右端で長さ変更'], ['Ctrl + Wheel', 'ズーム'],
  ]
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="neu pop-in w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">Shortcuts</p>
        <h3 className="mt-1 text-[18px] font-semibold text-white">操作ガイド</h3>
        <div className="mt-4 divide-y divide-[var(--line)]">
          {rows.map(([k, v], i) => (
            <div key={k} className="fade-up flex items-center justify-between py-2" style={{ ['--d' as any]: `${i * 25}ms` }}>
              <span className="text-[12.5px] text-[var(--tx-2)]">{v}</span>
              <kbd className="num rounded-md border border-[var(--line-2)] bg-white/[0.04] px-2 py-0.5 text-[11px] text-white">{k}</kbd>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="btn-ghost mt-5 w-full rounded-xl py-2.5 text-[12.5px] font-medium">閉じる</button>
      </div>
    </div>
  )
}

/** スプラッシュ: エディトリアルな Kinetic Typography + AudioContext のアンロック */
function Splash({ onStart }: { onStart: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const curve = useMemo(() => {
    const n = 64
    let d = ''
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * 1200
      const y = 470 + Math.sin(i * 0.31) * 46 + Math.sin(i * 0.93) * 20 + Math.sin(i * 2.7) * 7
      d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    }
    return d
  }, [])
  return (
    <div className={`fixed inset-0 z-[100] flex flex-col justify-between bg-[#0a0812] p-6 transition-all duration-700 md:p-12 ${leaving ? 'pointer-events-none opacity-0' : ''}`} style={{ transitionTimingFunction: 'var(--ease)' }}>
      <svg viewBox="0 0 1200 600" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full opacity-45">
        <defs><linearGradient id="sp" x1="0" x2="1"><stop offset="0" stopColor="#ff5bd6" /><stop offset=".6" stopColor="#8b5cff" /><stop offset="1" stopColor="#4fe3ff" /></linearGradient></defs>
        <path d={curve} fill="none" stroke="url(#sp)" strokeWidth={1.2} className="line-draw" style={{ ['--len' as any]: 2400 }} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="relative flex items-center justify-between">
        <span className="eyebrow">FracTone — v1.0</span>
        <span className="eyebrow hidden sm:inline">Midpoint · Motif · Analysis</span>
      </div>
      <div className="relative">
        <p className="eyebrow mb-4"><RiseText>A fractal sequencer for learning composition</RiseText></p>
        <h1 className="font-display text-[clamp(56px,12vw,168px)] font-semibold leading-[0.88] tracking-[-0.045em] text-white">
          <RiseText delay={120}>Frac</RiseText>
          <RiseText delay={220} className="grad-text">Tone</RiseText>
        </h1>
        <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[var(--tx-2)]">
          <RiseText delay={420}>あなたが弾いたメロディの続きを、</RiseText><br />
          <RiseText delay={500}>中点変位法とモチーフ展開で作曲します。</RiseText>
        </p>
      </div>
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="fade-up grid grid-cols-3 gap-8 text-[var(--tx-3)]" style={{ ['--d' as any]: '700ms' }}>
          {[['01', '弾く'], ['02', '続きを作曲'], ['03', '分析して学ぶ']].map(([n, t]) => (
            <div key={n}><p className="num text-[10px]">{n}</p><p className="mt-1 text-[12.5px] text-[var(--tx)]">{t}</p></div>
          ))}
        </div>
        <button
          onClick={() => { setLeaving(true); setTimeout(onStart, 420) }}
          className="btn-primary fade-up group flex items-center gap-3 rounded-full py-3.5 pl-7 pr-5 text-[14px] font-medium"
          style={{ ['--d' as any]: '850ms' }}
        >
          はじめる
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15 transition-transform duration-300 group-hover:translate-x-1"><IArrowR size={14} /></span>
        </button>
      </div>
    </div>
  )
}
