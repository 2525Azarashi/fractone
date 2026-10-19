// ============================================================
// FracTone — 最上位コンポーネント (状態は useReducer で一元管理)
// ============================================================
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { initState, reducer, type Tab } from './state'
import type { Analysis, ComposeParams, ComposeResult, Note } from '../lib/types'
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
import { Toggle } from './components/ui'
import { Splash } from './components/Splash'
import { ComposeOverlay, FormReveal } from './components/ComposeOverlay'
import { useSpotlight } from './components/fx'
import { ComposeDock } from './components/ComposeDock'
import { NowPlaying } from './components/NowPlaying'
import { IBars, IChevL, IChevR, IRoll, ISliders, IWave } from './components/icons'
import { setIdlePosition } from './hooks/useTransport'

const TABS: { id: Tab; label: string; icon: (p: { size?: number; className?: string }) => JSX.Element }[] = [
  { id: 'roll', label: 'ピアノロール', icon: IRoll },
  { id: 'pitch', label: 'ピッチ可視化', icon: IWave },
  { id: 'rhythm', label: 'リズム可視化', icon: IBars },
  { id: 'audio', label: 'オーディオ設定', icon: ISliders },
]

const OVERLAY_MS = 1250
// 開発用: ?debug=overlay|reveal で演出を固定表示 (スクリーンショット検証用)
const DEBUG = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('debug') : null
const analyzeNow = (seq: Note[], p: ComposeParams) => analyze(seq, p.key, p.scale, p.bpm, p.timeSig)

interface Toast { id: number; text: string; tone: 'mag' | 'cy' | 'mint' }

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initState)
  const stateRef = useRef(state)
  useSpotlight()
  stateRef.current = state
  const [toasts, setToasts] = useState<Toast[]>([])
  const [splash, setSplash] = useState(true)
  const [help, setHelp] = useState(false)
  const [coach, setCoach] = useState(() => { try { return !localStorage.getItem('fractone:coached') } catch { return false } })
  const [burst, setBurst] = useState<{ depth: number; mode: string; seed: number } | null>(null)
  const [reveal, setReveal] = useState<ComposeResult | null>(null)
  const prevAnalysis = useRef<Analysis | null>(null)
  const lastLiveAt = useRef(0)
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
  // live=true: スライダー操作中の即時再作曲 (クライアント実行・演出なし)
  const runCompose = useCallback(async (mode: 'continue' | 'new', seedOverride?: number, live = false) => {
    const s = stateRef.current
    if (!live) audio.stop(false)
    lastMode.current = mode
    const params = { ...s.params, seed: seedOverride ?? s.params.seed }
    if (seedOverride !== undefined) dispatch({ type: 'params', patch: { seed: seedOverride } })
    const userSeq = s.sequence.filter((n) => n.source !== 'ai')
    if (mode === 'continue' && userSeq.length < 2) return toast('続きを作るには2音以上入力してください', 'cy')
    // 比較用に直前の分析を保持 (Live 連続更新中は基準を固定し、操作開始前との差を見せる)
    const now = Date.now()
    if (!live || now - lastLiveAt.current > 1500) prevAnalysis.current = analyzeNow(s.sequence, s.params)
    if (live) lastLiveAt.current = now
    if (live) {
      const result = compose({ mode, sequence: mode === 'continue' ? userSeq : [], params }, 'client')
      dispatch({ type: 'setSequence', seq: mode === 'continue' ? [...userSeq, ...result.notes] : result.notes, record: false })
      dispatch({ type: 'result', result })
      return
    }
    dispatch({ type: 'status', status: 'composing' })
    setBurst({ depth: params.depth, mode, seed: params.seed })
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
    // 演出: パイプライン図解を最後まで見せる
    const wait = Math.max(0, OVERLAY_MS - (performance.now() - t0))
    await new Promise((r) => setTimeout(r, wait))
    setBurst(null)
    const next: Note[] = mode === 'continue' ? [...userSeq, ...result.notes] : result.notes
    dispatch({ type: 'setSequence', seq: next })
    dispatch({ type: 'result', result })
    dispatch({ type: 'status', status: 'done' })
    setReveal(result)
    setCoach(false)
    try { localStorage.setItem('fractone:coached', '1') } catch {}
    setTimeout(() => setReveal(null), 1900)
    toast(`${result.notes.length} 音符を作曲 · Live ON でスライダーが即反映`, 'cy')
    // 生成部分の頭から試聴
    const from = mode === 'continue' ? Math.max(0, result.startBeat * (60 / params.bpm) - (60 / params.bpm) * TIME_SIGS[params.timeSig].beatsPerBar) : 0
    dispatch({ type: 'cursor', t: from })
    setIdlePosition(from)
  }, [toast])

  // ---- Live モード: 生成済みの状態でパラメータが変わったら即時再作曲 ----
  const liveKey = [state.params.bars, state.params.range, state.params.displacement, state.params.depth, state.params.roughness, state.params.motifStrength, state.params.humanize, state.params.density, state.params.key, state.params.scale, state.params.timeSig, state.params.seed].join('|')
  const lastLiveKey = useRef(liveKey)
  useEffect(() => {
    if (lastLiveKey.current === liveKey) return
    lastLiveKey.current = liveKey
    const s = stateRef.current
    if (!s.live || !s.result || s.status === 'composing' || s.status === 'recording') return
    const id = setTimeout(() => runCompose(lastMode.current, undefined, true), 120)
    return () => clearTimeout(id)
  }, [liveKey, runCompose])

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
          <aside id="param-panel" className="thin-scroll order-2 min-w-0 lg:sticky lg:top-4 lg:order-1 lg:h-[calc(100vh-108px)] lg:min-h-[740px] lg:overflow-y-auto lg:pr-1">
            <ParamPanel state={state} dispatch={dispatch} onSave={save} />
          </aside>

          {/* ---- 中央: 作曲ドック + 可視化 + 鍵盤 ---- */}
          <section id="visual-panel" className="neu fade-up order-1 flex lg:sticky lg:top-4 min-h-[660px] min-w-0 flex-col gap-3 rounded-2xl p-3 md:p-4 lg:order-2 lg:h-[calc(100vh-108px)] lg:min-h-[740px]" style={{ ['--d' as any]: '40ms' }}>
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
            {coach && !splash && !state.result && (
              <div className="fade-up relative -mb-1 flex items-center gap-3 rounded-xl border border-fuchsia-300/20 bg-fuchsia-400/[0.06] px-3 py-2 text-[12px] text-[var(--tx)]" role="note">
                <span className="num grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#ff5bd6] text-[10px] font-semibold text-white">1</span>
                <span>デモのメロディが入っています。まずは <b className="font-semibold text-white">続きを作曲</b> を押してみましょう — 鍵盤（A S D F…）で自分のフレーズに差し替えることもできます。</span>
                <button className="ml-auto shrink-0 text-[11px] text-[var(--tx-3)] hover:text-white" onClick={() => { setCoach(false); try { localStorage.setItem('fractone:coached', '1') } catch {} }}>閉じる</button>
                <span className="absolute -bottom-1.5 left-14 h-3 w-3 rotate-45 border-b border-r border-fuchsia-300/20 bg-[#1a1220]" />
              </div>
            )}
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
              {state.tab !== 'audio' && <NowPlaying sequence={state.sequence} bpm={state.params.bpm} beatsPerBar={TIME_SIGS[state.params.timeSig].beatsPerBar} form={state.result?.form ?? null} activeKeys={state.activeKeys} />}
              {(burst || DEBUG === 'overlay') && <ComposeOverlay depth={burst?.depth ?? 5} mode={burst?.mode ?? 'continue'} seed={burst?.seed ?? 7} total={DEBUG === 'overlay' ? 4000 : OVERLAY_MS} />}
              {(reveal || (DEBUG === 'reveal' && state.result)) && state.tab === 'roll' && <FormReveal result={(reveal ?? state.result)!} />}
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
          <aside id="analysis-panel" className="thin-scroll order-3 min-w-0 lg:sticky lg:top-4 lg:h-[calc(100vh-108px)] lg:min-h-[740px] lg:overflow-y-auto lg:pr-1">
            <AnalysisPanel state={state} analysis={analysis} prev={prevAnalysis.current} result={state.result} />
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

