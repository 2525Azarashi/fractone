// ============================================================
// FracTone — 最上位コンポーネント (状態は useReducer で一元管理)
// ============================================================
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { initState, reducer, noteCounts, demoSequence, type Tab } from './state'
import type { Analysis, ComposeParams, ComposeResult, Note } from '../lib/types'
import { audio, toMidiFile } from '../lib/audio-engine'
import { harmonize, type ChordStyle } from '../lib/chord-generator'
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
import { Toggle, useDialogFocus } from './components/ui'
import { Splash } from './components/Splash'
import { ComposeOverlay, FormReveal } from './components/ComposeOverlay'
import { useSpotlight } from './components/fx'
import { ComposeDock } from './components/ComposeDock'
import { NowPlaying } from './components/NowPlaying'
import { IBars, IChevL, IChevR, IRoll, ISliders, IWave } from './components/icons'
import { Toaster, useToaster, PullToRefresh, type ToastItem } from './components/patterns'
import { CommandPalette, type Cmd } from './components/CommandPalette'
import { TakesSheet, type Take } from './components/TakesSheet'
import { INSTRUMENTS } from '../lib/audio-engine'
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


export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initState)
  const stateRef = useRef(state)
  useSpotlight()
  stateRef.current = state
  const toaster = useToaster()
  const [palette, setPalette] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [takes, setTakes] = useState<Take[]>(() => { try { return JSON.parse(localStorage.getItem('fractone:takes') || '[]') } catch { return [] } })
  const [currentTake, setCurrentTake] = useState<string | null>(null)
  const overlayRef = useRef(false)
  const [splash, setSplash] = useState(() => { try { return !localStorage.getItem('fractone:started') } catch { return false } })
  const [auditioned, setAuditioned] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saving')
  const [savedAt, setSavedAt] = useState<string>('')
  const composeLock = useRef(false)
  const persistRef = useRef<() => boolean>(() => true)
  const [help, setHelp] = useState(false)
  overlayRef.current = palette || sheet || help || splash
  const [burst, setBurst] = useState<{ depth: number; mode: string; seed: number } | null>(null)
  const [reveal, setReveal] = useState<ComposeResult | null>(null)
  const prevAnalysis = useRef<Analysis | null>(null)
  const lastLiveAt = useRef(0)
  const pressed = useRef(new Map<number, { t: number; vel: number }>())
  const lastMode = useRef<'continue' | 'new'>('continue')
  const volBeforeMute = useRef(0.75)
  const workspaceRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (workspaceRef.current) workspaceRef.current.inert = splash || palette || sheet || help }, [splash, palette, sheet, help])

  const toast = useCallback((text: string, tone: ToastItem['tone'] = 'mag', opt?: { action?: ToastItem['action']; ms?: number }) => {
    toaster.push(text, tone, opt)
  }, [toaster.push]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Working notes and comparison takes share one visible persistence status.
  const persist = useCallback(() => {
    try {
      localStorage.setItem('fractone:v1', JSON.stringify({ sequence: state.sequence, params: state.params, audio: state.audio, harmony: state.harmony, chordsOn: state.chordsOn }))
      localStorage.setItem('fractone:takes', JSON.stringify(takes.slice(0, 24)))
      setSaveStatus('saved')
      setSavedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }))
      return true
    } catch {
      setSaveStatus('error')
      return false
    }
  }, [state.sequence, state.params, state.audio, state.harmony, state.chordsOn, takes])
  persistRef.current = persist
  useEffect(() => {
    setSaveStatus('saving')
    const id = setTimeout(persist, 400)
    return () => clearTimeout(id)
  }, [persist])
  useEffect(() => {
    const flush = () => { persistRef.current() }
    const leave = (event: BeforeUnloadEvent) => {
      if (!persistRef.current()) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', leave)
    return () => { window.removeEventListener('pagehide', flush); window.removeEventListener('beforeunload', leave) }
  }, [])
  useEffect(() => { setAuditioned(false) }, [state.sequence])

  const snapshot = (s: typeof state, mode: 'new' | 'continue', name: string): Take => {
    const a = analyzeNow(s.sequence, s.params)
    return { id: uid('t'), at: Date.now(), name, mode, seed: s.params.seed, key: s.params.key, scale: s.params.scale, bpm: s.params.bpm, notes: s.sequence.map((n) => ({ ...n })), params: { ...s.params }, audio: { ...s.audio }, harmony: { ...s.harmony }, chordsOn: s.chordsOn, fav: false, stats: { harmony: a.harmony, motif: a.motifRepetition, smooth: a.smoothness } }
  }
  const addTake = useCallback((take: Take) => {
    setTakes((ts) => {
      if (ts.some((t) => JSON.stringify([t.notes, t.params, t.audio, t.harmony, t.chordsOn]) === JSON.stringify([take.notes, take.params, take.audio, take.harmony, take.chordsOn]))) return ts
      return [take, ...ts.filter((t) => t.fav), ...ts.filter((t) => !t.fav)].slice(0, 24)
    })
  }, [])
  const archiveCurrent = useCallback(() => {
    const s = stateRef.current
    if (s.sequence.length) addTake(snapshot(s, lastMode.current, '切替前の編集 · ' + new Date().toLocaleTimeString('ja-JP')))
  }, [addTake])

  // ---- コード生成: メロディ (ユーザー + AI) に和声づけ。数ms なので変更のたびに再計算 ----
  const harmony = useMemo(() => {
    if (!state.chordsOn || !state.sequence.length) return null
    const { key, scale, bpm, timeSig, seed } = state.params
    return harmonize(state.sequence, { key, scale, bpm, timeSig, seed, harmony: state.harmony })
  }, [state.chordsOn, state.sequence, state.params.key, state.params.scale, state.params.bpm, state.params.timeSig, state.params.seed, state.harmony])
  const harmonyRef = useRef(harmony)
  harmonyRef.current = harmony
  /** 再生 / 書き出し用: メロディ + 伴奏 */
  const withChords = (seq: Note[]) => (harmonyRef.current ? [...seq, ...harmonyRef.current.notes] : seq)

  // ---- リアルタイム楽典分析 (シーケンスやキーが変わるたび) ----
  const analysis = useMemo(
    () => analyze(state.sequence, state.params.key, state.params.scale, state.params.bpm, state.params.timeSig),
    [state.sequence, state.params.key, state.params.scale, state.params.bpm, state.params.timeSig],
  )

  // ---------------- 演奏 & 録音 ----------------
  const press = useCallback((midi: number, vel = 0.85) => {
    if (composeLock.current) return
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
    if (composeLock.current || s.status === 'composing') return
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
    setAuditioned(true)
    audio.play(withChords(s.sequence), from, { bpm: s.params.bpm, beatsPerBar: TIME_SIGS[s.params.timeSig].beatsPerBar, loop: s.loop })
    dispatch({ type: 'status', status: 'playing' })
  }, [toast])

  const toggleRecord = useCallback(() => {
    const s = stateRef.current
    if (composeLock.current || s.status === 'composing') return
    if (s.status === 'recording') {
      stopAll()
      toast('録音を停止しました', 'mint')
      return
    }
    audio.stop(false)
    // カウントインなしで、カーソル位置から既存音符を流しつつ録音
    audio.startClock(s.cursor, { bpm: s.params.bpm, beatsPerBar: TIME_SIGS[s.params.timeSig].beatsPerBar, seq: withChords(s.sequence) })
    dispatch({ type: 'status', status: 'recording', message: '録音中' })
    toast('録音開始 — 鍵盤を弾いてください', 'mag')
  }, [stopAll, toast])

  // ---------------- 作曲 (中点変位法) ----------------
  // live=true: スライダー操作中の即時再作曲 (クライアント実行・演出なし)
  const runCompose = useCallback(async (mode: 'continue' | 'new', seedOverride?: number, live = false, replacing = false) => {
    const s = stateRef.current
    if (composeLock.current || s.status === 'recording') return
    const counts = noteCounts(s.sequence)
    if (mode === 'continue' && !live && !replacing && counts.proposed) return toast('まずAI提案を採用してください。そのあと続きを作れます。', 'cy')
    const userSeq = s.sequence.filter((n) => n.source !== 'ai')
    if (mode === 'continue' && userSeq.length < ((replacing || live) ? 1 : 2)) return toast('続きを作るには、入力・採用済みの音符が2音以上必要です', 'cy')
    composeLock.current = true
    const params = { ...s.params, seed: seedOverride ?? s.params.seed }
    lastMode.current = mode
    if (!live) archiveCurrent()
    audio.stop(false)
    dispatch({ type: 'clearAiKeys' })
    dispatch({ type: 'status', status: 'composing', message: 'メロディを生成中' })
    if (seedOverride !== undefined) dispatch({ type: 'params', patch: { seed: seedOverride } })
    const now = Date.now()
    const recordLive = !live || now - lastLiveAt.current > 1500
    if (recordLive) prevAnalysis.current = analyzeNow(s.sequence, s.params)
    if (live) lastLiveAt.current = now
    const t0 = performance.now()
    if (!live) setBurst({ depth: params.depth, mode, seed: params.seed })
    try {
      let result: ComposeResult
      const request = { mode, sequence: mode === 'continue' ? userSeq : [], params }
      if (live) result = compose(request, 'client')
      else {
        try {
          const res = await fetch('/api/compose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(12000) })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          result = (await res.json()).result
          if (!Array.isArray(result?.notes) || !Array.isArray(result?.form) || !result.notes.every((n) => n && Number.isFinite(n.midiNoteNumber) && Number.isFinite(n.startTime) && Number.isFinite(n.duration) && n.duration > 0)) throw new Error('Invalid composition response')
        } catch {
          result = compose(request, 'client')
          toast('通信できないため、この端末で作曲しました。音符は通常どおり編集できます。', 'cy')
        }
      }
      if (!live) await new Promise((r) => setTimeout(r, Math.max(0, OVERLAY_MS - (performance.now() - t0))))
      const next: Note[] = mode === 'continue' ? [...userSeq, ...result.notes] : result.notes
      const take = !live ? snapshot({ ...s, sequence: next, params }, mode, `${mode === 'continue' ? '続きの提案' : '新規の提案'} · ${result.form.map((f) => f.label).join(' ')}`) : null
      dispatch({ type: 'setSequence', seq: next, record: recordLive })
      dispatch({ type: 'result', result })
      dispatch({ type: 'status', status: 'done', message: `${result.notes.length}音を提案しました` })
      if (!live && take) {
        setReveal(result)

        addTake(take)
        setCurrentTake(take.id)
        try { localStorage.setItem('fractone:coached', '1') } catch {}
        setTimeout(() => setReveal(null), 1200)
        toast(`${result.notes.length}音を提案しました。再生して聴いてみましょう。`, 'cy', { action: { label: '案を比較', run: () => setSheet(true) } })
        const from = mode === 'continue' ? Math.max(0, (result.startBeat - TIME_SIGS[params.timeSig].beatsPerBar) * (60 / params.bpm)) : 0
        dispatch({ type: 'cursor', t: from })
        setIdlePosition(from)
      }
    } catch {
      dispatch({ type: 'status', status: 'error', message: '作曲できませんでした。現在の音符は保持されています。設定を確認して再試行してください。' })
      toast('作曲に失敗しました。現在の音符は残っています。', 'warn')
    } finally {
      setBurst(null)
      composeLock.current = false
    }
  }, [toast, archiveCurrent, addTake])

  // Reroll replaces pending notes only; works after reload, Undo, or take loading.
  const reroll = useCallback(() => {
    const s = stateRef.current
    if (!noteCounts(s.sequence).proposed) return
    const mode = noteCounts(s.sequence).fixed > 0 ? 'continue' : 'new'
    // Continuing a proposal uses the same confirmed base, not the proposed notes.
    return runCompose(mode, Math.floor(Math.random() * 99999), false, true)
  }, [runCompose])

  // ---- Live モード: 生成済みの状態でパラメータが変わったら即時再作曲 ----
  const liveKey = [state.params.bars, state.params.range, state.params.displacement, state.params.depth, state.params.roughness, state.params.motifStrength, state.params.humanize, state.params.density, state.params.key, state.params.scale, state.params.timeSig, state.params.seed].join('|')
  const lastLiveKey = useRef(liveKey)
  useEffect(() => {
    if (lastLiveKey.current === liveKey) return
    lastLiveKey.current = liveKey
    const s = stateRef.current
    if (!s.live || !noteCounts(s.sequence).proposed || composeLock.current || s.status === 'recording' || s.status === 'playing') return
    const id = setTimeout(() => runCompose(noteCounts(s.sequence).fixed > 0 ? 'continue' : 'new', undefined, true), 120)
    return () => clearTimeout(id)
  }, [liveKey, runCompose])

  // ---------------- 編集 ----------------
  const deleteSelected = useCallback(() => {
    const s = stateRef.current
    if (composeLock.current || ['playing', 'recording'].includes(s.status) || !s.selected.length) return
    const n = s.selected.length
    dispatch({ type: 'removeNotes', ids: s.selected })
    toast(`${n} 音符を削除`, 'warn', { action: { label: '元に戻す', run: () => dispatch({ type: 'undo' }) } })
  }, [toast])

  const quantize = useCallback(() => {
    const s = stateRef.current
    if (composeLock.current || !s.sequence.length) return
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
    if (composeLock.current || !noteCounts(s.sequence).proposed) return
    stopAll()
    dispatch({ type: 'setSequence', seq: s.sequence.map((n) => (n.source === 'ai' ? { ...n, source: 'user' as const, accepted: true } : n)) })
    dispatch({ type: 'result', result: null })
    toast('AI の音符を採用しました — さらに続きを作れます', 'mint')
  }, [toast, stopAll])

  const save = useCallback(() => {
    const s = stateRef.current
    if (composeLock.current) return
    if (!s.sequence.length) return toast('保存する音符がありません', 'cy')
    const bytes = toMidiFile(withChords(s.sequence), s.params.bpm)
    const blob = new Blob([bytes as BlobPart], { type: 'audio/midi' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `fractone_${NOTE_NAMES[s.params.key]}${s.params.scale}_${s.params.seed}.mid`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    toast(harmonyRef.current ? 'MIDI をダウンロードしました (伴奏は ch.2)' : 'MIDI をダウンロードしました', 'mint')
  }, [toast])

  const clearAll = useCallback(() => {
    const s = stateRef.current
    if (composeLock.current || !s.sequence.length) return
    archiveCurrent()
    const n = s.sequence.length
    stopAll(true)
    dispatch({ type: 'setSequence', seq: [] })
    dispatch({ type: 'result', result: null })
    toast(`${n} 音符を消去しました`, 'warn', { action: { label: '元に戻す', run: () => dispatch({ type: 'undo' }) } })
  }, [stopAll, toast, archiveCurrent])

  // ---------------- PCキーボード ----------------
  useEffect(() => {
    const isField = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      return t && (t.closest('input, select, textarea, button, summary, [role=dialog], [contenteditable=true]'))
    }
    const down = (e: KeyboardEvent) => {
      if (isField(e)) return
      if (overlayRef.current) return // パレット / シート表示中は演奏ショートカットを止める
      const s = stateRef.current
      if (composeLock.current) return
      const k = e.key.toLowerCase()
      if (k === '/' || ((e.ctrlKey || e.metaKey) && k === 'k')) { e.preventDefault(); setPalette(true); return }
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        if (s.status === 'playing' || s.status === 'recording') return
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (k === 'a' && e.shiftKey) { e.preventDefault(); dispatch({ type: 'select', ids: s.sequence.map((n) => n.id) }); return }
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
      if (s.status === 'playing' || s.status === 'recording') return
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

  const loadTake = useCallback((t: Take) => {
    if (composeLock.current) return
    archiveCurrent()
    stopAll(true)
    prevBpm.current = t.bpm
    lastMode.current = t.mode
    dispatch({ type: 'params', patch: t.params ?? { key: t.key, scale: t.scale, seed: t.seed, bpm: t.bpm } })
    if (t.audio) dispatch({ type: 'audio', patch: t.audio })
    if (t.harmony) dispatch({ type: 'harmony', patch: t.harmony })
    if (t.chordsOn !== undefined && t.chordsOn !== stateRef.current.chordsOn) dispatch({ type: 'toggle', key: 'chordsOn' })
    dispatch({ type: 'setSequence', seq: t.notes.map((n) => ({ ...n })) })
    dispatch({ type: 'result', result: null })
    setCurrentTake(t.id)
    setSheet(false)
    toast(`「${t.name}」を読み込みました`, 'mint', { action: { label: '再生', run: () => setTimeout(() => togglePlay(), 30) } })
  }, [stopAll, toast, togglePlay, archiveCurrent])

  // ---- Auto Complete (コマンドパレット) の候補 ----
  const commands = useMemo<Cmd[]>(() => {
    const p = (patch: Partial<ComposeParams>) => dispatch({ type: 'params', patch })
    const list: Cmd[] = [
      { id: 'continue', group: '作曲', title: '続きを作曲', keys: 'continue compose tsuzuki', hint: 'モチーフを検出して中点変位で展開', run: () => runCompose('continue') },
      { id: 'new', group: '作曲', title: '新規生成', keys: 'new generate shinki', hint: 'モチーフを新しく作って作曲', run: () => runCompose('new') },
      { id: 'reroll', group: '作曲', title: '別案 (シードを変えて再作曲)', keys: 'reroll seed betsuan dice', run: reroll },
      { id: 'accept', group: '作曲', title: 'AI の音符を採用', keys: 'accept adopt saiyou', run: acceptAi },
      { id: 'takes', group: '作曲', title: 'テイク・ライブラリを開く', keys: 'takes library take', hint: `${takes.length} 件`, run: () => setSheet(true) },
      { id: 'play', group: '再生', title: '再生 / 一時停止', keys: 'play pause saisei space', run: togglePlay },
      { id: 'stop', group: '再生', title: '停止して先頭へ', keys: 'stop teishi', run: () => stopAll(true) },
      { id: 'rec', group: '再生', title: '録音', keys: 'record rokuon', run: toggleRecord },
      { id: 'loop', group: '再生', title: 'ループ切替', keys: 'loop', run: () => dispatch({ type: 'toggle', key: 'loop' }) },
      { id: 'metro', group: '再生', title: 'メトロノーム切替', keys: 'metronome click', run: () => dispatch({ type: 'audio', patch: { metronome: !stateRef.current.audio.metronome } }) },
      { id: 'live', group: '再生', title: 'Live モード切替', keys: 'live', run: () => dispatch({ type: 'toggle', key: 'live' }) },
      { id: 'chords', group: 'コード', title: 'コード生成 (伴奏) の切替', keys: 'chord harmony kodo bansou', hint: 'メロディに和音を付ける', run: () => dispatch({ type: 'toggle', key: 'chordsOn' }) },
      ...(([['block', 'ブロック (和音を刻む)'], ['arpeggio', 'アルペジオ'], ['alberti', 'アルベルティ・バス'], ['bass', 'ベース + 裏拍の和音']] as [ChordStyle, string][]).map(([st, label]) => ({
        id: `cstyle-${st}`, group: 'コード', title: `伴奏: ${label}`, keys: `chord style ${st}`, run: () => { dispatch({ type: 'harmony', patch: { style: st } }); if (!stateRef.current.chordsOn) dispatch({ type: 'toggle', key: 'chordsOn' }) },
      }))),
      { id: 'c7', group: 'コード', title: '7th の割合', keys: 'seventh 7th color', hint: '例: 7th 60 (%)', arg: { min: 0, max: 100, unit: '%' }, run: (v) => dispatch({ type: 'harmony', patch: { color: v! / 100 } }) },
      { id: 'cvol', group: 'コード', title: '伴奏の音量', keys: 'chord volume bansou', hint: '例: 伴奏 40 (%)', arg: { min: 0, max: 100, unit: '%' }, run: (v) => dispatch({ type: 'harmony', patch: { volume: v! / 100 } }) },
      { id: 'bpm', group: 'パラメータ', title: 'テンポ (BPM)', keys: 'bpm tempo', hint: '例: bpm 128', arg: { min: 50, max: 200, unit: ' bpm' }, run: (v) => p({ bpm: v! }) },
      { id: 'bars', group: 'パラメータ', title: '基長 (小節数)', keys: 'bars length kichou', hint: '例: bars 12', arg: { min: 2, max: 16, unit: ' bars' }, run: (v) => p({ bars: v! }) },
      { id: 'range', group: 'パラメータ', title: '音域幅', keys: 'range oniki', hint: '例: range 18', arg: { min: 5, max: 24, unit: ' st' }, run: (v) => p({ range: v! }) },
      { id: 'disp', group: 'パラメータ', title: '変位強度', keys: 'displacement heni', hint: '例: 変位 70 (%)', arg: { min: 0, max: 100, unit: '%' }, run: (v) => p({ displacement: v! / 100 }) },
      { id: 'depth', group: 'パラメータ', title: '分解深度', keys: 'depth bunkai', hint: '例: depth 5', arg: { min: 1, max: 7, unit: '' }, run: (v) => p({ depth: v! }) },
      { id: 'motif', group: 'パラメータ', title: 'モチーフ反復度', keys: 'motif repeat hanpuku', hint: '例: motif 90 (%)', arg: { min: 0, max: 100, unit: '%' }, run: (v) => p({ motifStrength: v! / 100 }) },
      { id: 'seed', group: 'パラメータ', title: 'シード', keys: 'seed', hint: '例: seed 1234', arg: { min: 0, max: 99999, unit: '' }, run: (v) => p({ seed: v! }) },
      { id: 'midi', group: 'ファイル', title: 'MIDI に書き出す', keys: 'export midi save hozon', run: save },
      { id: 'quant', group: '編集', title: 'クオンタイズ', keys: 'quantize', run: quantize },
      { id: 'undo', group: '編集', title: '元に戻す', keys: 'undo', run: () => dispatch({ type: 'undo' }) },
      { id: 'clear', group: '編集', title: '全消去', keys: 'clear delete all', run: clearAll },
      { id: 'help', group: '編集', title: 'ショートカット一覧', keys: 'help shortcut', run: () => setHelp(true) },
    ]
    ;(['roll', 'pitch', 'rhythm', 'audio'] as Tab[]).forEach((t, i) => list.push({ id: `tab-${t}`, group: '表示', title: `${TABS[i].label} を表示`, keys: t, run: () => dispatch({ type: 'tab', tab: t }) }))
    // キー × スケール
    Object.entries(SCALES).forEach(([sc, def]) => {
      NOTE_NAMES.forEach((nn, k) => list.push({ id: `key-${k}-${sc}`, group: 'キー', title: `${nn} ${def.label}`, keys: `${nn}${def.label} key`, run: () => p({ key: k, scale: sc as ComposeParams['scale'] }) }))
    })
    ;(['4/4', '3/4', '6/8'] as const).forEach((ts) => list.push({ id: `ts-${ts}`, group: 'キー', title: `拍子 ${ts}`, keys: `time ${ts}`, run: () => p({ timeSig: ts }) }))
    INSTRUMENTS.forEach((ins) => list.push({ id: `ins-${ins.id}`, group: '音色', title: ins.label, keys: `${ins.id} tone instrument`, hint: ins.desc, run: () => dispatch({ type: 'audio', patch: { instrument: ins.id } }) }))
    takes.slice(0, 8).forEach((t) => list.push({ id: `take-${t.id}`, group: 'テイク', title: t.name, keys: `take ${t.seed}`, hint: `seed ${t.seed}`, run: () => loadTake(t) }))
    return list
  }, [runCompose, reroll, acceptAi, togglePlay, stopAll, toggleRecord, save, quantize, clearAll, takes, loadTake])

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <a href="#visual-panel" className="skip-link">作曲・編集エリアへ</a>
      <PullToRefresh disabled={splash || busy || palette || sheet || state.status === 'recording' || state.status === 'playing' || !noteCounts(state.sequence).proposed} onRefresh={reroll}>
      <div ref={workspaceRef} className="relative z-10 mx-auto flex max-w-[1720px] flex-col gap-4 p-3 md:p-5">
        <Header
          state={state}
          onHelp={() => setHelp(true)}
          onPalette={() => setPalette(true)}
          onTakes={() => setSheet(true)}
          takeCount={takes.length}
          onToggleMute={() => {
            if (state.audio.volume > 0) { volBeforeMute.current = state.audio.volume; dispatch({ type: 'audio', patch: { volume: 0 } }) }
            else dispatch({ type: 'audio', patch: { volume: volBeforeMute.current || 0.75 } })
          }}
        />

        <div className="save-status flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[var(--tx-2)]">
          <p role="status" aria-live="polite">{saveStatus === 'saving' ? '未保存の変更があります · このブラウザに保存中…' : saveStatus === 'error' ? '未保存：ブラウザへの保存に失敗しました。MIDIを書き出して保管してください。' : `保存済み ${savedAt} · この端末・ブラウザ内（クラウド保存ではありません）`}</p>
          {saveStatus === 'error' && <button className="btn-ghost rounded-lg px-3" onClick={persist}>保存を再試行</button>}
        </div>
        {state.status === 'error' && <p role="alert" className="rounded-xl border border-amber-300/40 p-3 text-sm text-amber-100">{state.message}</p>}
        <main className="workspace-grid">
          {/* ---- 左: 詳細パラメータ ---- */}
          <aside id="param-panel" className="min-w-0" aria-label="曲の設定">
            <ParamPanel state={state} dispatch={dispatch} harmony={harmony} />
          </aside>

          {/* ---- 中央: 作曲ドック + 可視化 + 鍵盤 ---- */}
          <section id="visual-panel" tabIndex={-1} aria-label="作曲・編集" className="editor-panel neu flex min-w-0 flex-col gap-3 rounded-2xl p-3 md:p-4" style={{ ['--d' as any]: '40ms' }}>
            <ComposeDock state={state} busy={busy} onContinue={() => runCompose('continue')} onGenerate={() => runCompose('new')} onReroll={reroll} onPlay={togglePlay} onAccept={acceptAi} onTakes={() => setSheet(true)} onSave={save} auditioned={auditioned} takeCount={takes.length} />
                        {/* タブ */}
            <div className="flex items-center gap-3">
              <nav aria-label="編集ビュー" className="editor-tabs relative flex flex-wrap rounded-xl border border-[var(--line)] bg-black/25 p-1" >
                <span className="tab-indicator absolute top-1 h-[calc(100%-8px)] rounded-lg border border-[var(--line-2)] bg-white/[0.07]" style={{ left: ind.left, width: ind.width }} />
                {TABS.map((t, i) => {
                  const Icon = t.icon
                  const on = state.tab === t.id
                  return (
                    <button
                      key={t.id}
                      ref={(el) => { tabRefs.current[i] = el }}
                      aria-pressed={on}
                      aria-label={t.label}
                      onClick={() => dispatch({ type: 'tab', tab: t.id })}
                      className={`relative z-10 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors duration-300 ${on ? 'text-white' : 'text-[var(--tx-3)] hover:text-[var(--tx)]'}`}
                    >
                      <Icon size={14} className={on ? 'text-fuchsia-300' : ''} />
                      <span>{t.label}</span>
                    </button>
                  )
                })}
              </nav>

            </div>


            {!state.sequence.length && <button className="self-start rounded-lg px-2 text-xs text-[var(--tx-2)] underline" onClick={() => { dispatch({ type: 'setSequence', seq: demoSequence(state.params.bpm) }); dispatch({ type: 'result', result: null }) }}>自分で入力する代わりにデモの音符を読み込む</button>}
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

            <div className="roll-viewport relative" data-no-ptr aria-label="音符エディター">
              <div key={state.tab} className="fade-up absolute inset-0">
                {state.tab === 'roll' && <PianoRoll state={state} dispatch={dispatch} harmony={harmony} />}
                {state.tab === 'pitch' && <div className="neu-inset h-full rounded-2xl p-3"><PitchViz sequence={state.sequence} result={state.result} bpm={state.params.bpm} keyRoot={state.params.key} scale={state.params.scale} generation={state.generation} /></div>}
                {state.tab === 'rhythm' && <RhythmViz sequence={state.sequence} bpm={state.params.bpm} timeSig={state.params.timeSig} analysis={analysis} generation={state.generation} />}
                {state.tab === 'audio' && <AudioPanel settings={state.audio} dispatch={dispatch} />}
              </div>
              {state.tab !== 'audio' && <NowPlaying sequence={state.sequence} bpm={state.params.bpm} beatsPerBar={TIME_SIGS[state.params.timeSig].beatsPerBar} form={state.result?.form ?? null} activeKeys={state.activeKeys} chords={harmony?.chords ?? null} />}
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
                <Toggle on={state.quantizeRec} onChange={() => dispatch({ type: 'toggle', key: 'quantizeRec' })} label="録音をグリッドに揃える" />
              </div>
              <div className="h-[112px] sm:h-[124px]" data-no-ptr>
                <PianoUI low={low} high={high} activeKeys={state.activeKeys} aiKeys={state.aiKeys} baseOctave={state.baseOctave} keyRoot={state.params.key} scale={state.params.scale} onPress={press} onRelease={release} />
              </div>
            </div>
          </section>

          {/* ---- 右: 分析 ---- */}
          <aside id="analysis-panel" className="workspace-analysis min-w-0" aria-label="メロディの分析">
            <details className="disclosure">
            <summary>メロディを知る・楽典分析 <span>計算の根拠と音の特徴を見る</span></summary>
            <AnalysisPanel state={state} analysis={analysis} prev={prevAnalysis.current} result={state.result} loading={busy} harmony={harmony} />
            </details>
          </aside>
        </main>

      </div>
      </PullToRefresh>

      <Toaster items={toaster.items} dismiss={toaster.dismiss} raised={sheet} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} />
      <TakesSheet
        open={sheet}
        onClose={() => setSheet(false)}
        takes={takes}
        pending={busy}
        currentId={currentTake}
        onLoad={loadTake}
        onFav={(t) => { setTakes((ts) => ts.map((x) => (x.id === t.id ? { ...x, fav: !x.fav } : x))); toast(t.fav ? 'お気に入りを解除' : 'お気に入りに追加', 'warn') }}
        onDelete={(t) => {
          setTakes((ts) => ts.filter((x) => x.id !== t.id))
          toast(`「${t.name}」を削除`, 'warn', { action: { label: '元に戻す', run: () => setTakes((ts) => [t, ...ts]) } })
        }}
        onReroll={reroll}
      />
      {help && <HelpSheet onClose={() => setHelp(false)} />}
      {splash && <Splash onStart={() => { audio.ensure(); try { localStorage.setItem('fractone:started', '1') } catch {} setSplash(false) }} />}
    </div>
  )
}

/** ショートカット一覧 */
function HelpSheet({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null)
  useDialogFocus(true, dialog)
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  const rows: [string, string][] = [
    ['A – ;', '鍵盤を演奏 (白鍵)'], ['W E T Y U O P', '黒鍵'], ['Z / X', 'オクターブ ↓ / ↑'],
    ['Space', '再生 / 一時停止'], ['R', '録音'], ['Enter', '停止して先頭へ'],
    ['Delete', '選択した音符を削除'], ['↑ ↓ ← →', '選択を移動 (Shift で 1oct)'], ['Ctrl + Z', '元に戻す'],
    ['ダブルクリック', '音符を追加'], ['ドラッグ', '移動 / 右端で長さ変更'], ['Ctrl + ホイール', 'ズーム'],
    ['/  or  Ctrl + K', '検索・コマンド (オートコンプリート)'], ['下へ引っ張る', '(タッチ) 別案を作曲'],
  ]
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="操作ガイド" tabIndex={-1} className="neu pop-in max-h-[90vh] overflow-auto w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[18px] font-semibold text-white">操作ガイド</h3>
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

