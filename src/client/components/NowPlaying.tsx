// ============================================================
// NowPlaying — 再生中の Kinetic Typography レイヤー
//  ・背景: いま鳴っている音名を画面いっぱいのアウトライン文字で打ち出す
//    (ベロシティ → 可変ウェイト / 上行・下行 → 入ってくる方向)
//  ・HUD: 音名・前の音からの音程 (日本語の度数名)・楽式フレーズ・拍カウンタ
//  React の再レンダーは使わず usePlayhead (rAF) で DOM を直接書き換える
// ============================================================
import { useEffect, useMemo, useRef } from 'react'
import type { Note, PhrasePlan } from '../../lib/types'
import { NOTE_NAMES } from '../../lib/theory'
import { usePlayhead } from '../hooks/useTransport'
import type { Chord } from '../../lib/chord-generator'

const INTERVAL_JA = ['同音', '短2度', '長2度', '短3度', '長3度', '完全4度', '増4度', '完全5度', '短6度', '長6度', '短7度', '長7度', 'オクターブ']
const TRANSFORM_JA: Record<string, string> = {
  statement: '提示', repeat: '反復', sequence: '反復進行', inversion: '反行', retrograde: '逆行',
  variation: '変奏', fragment: '断片化', free: '自由展開', cadence: '終止',
}

export const FUNC_COLOR = { T: '#7af0c4', S: '#ffcf7a', D: '#ff5bd6' } as const
export const FUNC_JA = { T: 'トニック', S: 'サブドミナント', D: 'ドミナント' } as const

/** マスク内で下からせり上がる (kt-swap 相当を WAAPI で) */
function swapIn(el: HTMLElement) {
  const prev = (el as any).__a as Animation | undefined
  prev?.cancel()
  ;(el as any).__a = el.animate([{ transform: 'translateY(60%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' })
}

export function intervalName(d: number) {
  const a = Math.abs(d)
  if (a > 12) return `${Math.floor(a / 12)}oct + ${INTERVAL_JA[a % 12]}`
  return INTERVAL_JA[a]
}

interface Props {
  sequence: Note[]
  bpm: number
  beatsPerBar: number
  form: PhrasePlan[] | null
  activeKeys: number[]
  chords?: Chord[] | null
}

export function NowPlaying({ sequence, bpm, beatsPerBar, form, activeKeys, chords }: Props) {
  const sorted = useMemo(() => [...sequence].sort((a, b) => a.startTime - b.startTime), [sequence])
  const hChord = useRef<HTMLSpanElement>(null)
  const hRoman = useRef<HTMLSpanElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const big = useRef<HTMLDivElement>(null)
  const bigName = useRef<HTMLSpanElement>(null)
  const bigOct = useRef<HTMLSpanElement>(null)
  const hud = useRef<HTMLDivElement>(null)
  const hName = useRef<HTMLSpanElement>(null)
  const hOct = useRef<HTMLSpanElement>(null)
  const hDot = useRef<HTMLSpanElement>(null)
  const hInt = useRef<HTMLSpanElement>(null)
  const hArrow = useRef<HTMLSpanElement>(null)
  const hPhrase = useRef<HTMLSpanElement>(null)
  const hBar = useRef<HTMLSpanElement>(null)
  const dots = useRef<HTMLSpanElement>(null)
  const bigAnim = useRef<Animation | null>(null)
  const st = useRef({ id: '', prevMidi: -1, visible: false, beat: -1, phrase: -1, chord: -2, cursor: 0, keyAt: 0 })

  /** 1音ぶんのキネティック表示を発火 */
  const fire = (midi: number, vel: number, ai: boolean, key: string) => {
    const s = st.current
    const first = s.prevMidi < 0 || key === 'first'
    const d = first ? 0 : midi - s.prevMidi
    s.prevMidi = midi
    const name = NOTE_NAMES[((midi % 12) + 12) % 12]
    const oct = String(Math.floor(midi / 12) - 1)
    const col = ai ? '#4fe3ff' : '#ff5bd6'
    // 背景の巨大文字
    const b = big.current
    if (b && bigName.current && bigOct.current) {
      bigName.current.textContent = name
      bigOct.current.textContent = oct
      b.style.setProperty('--w', String(Math.round(200 + vel * 700)))
      b.style.setProperty('--c', col)
      // Web Animations API で再始動 (強制リフロー無し)
      const dy = d > 0 ? 28 : d < 0 ? -28 : 0
      const dx = d === 0 ? -6 : 0
      bigAnim.current?.cancel()
      bigAnim.current = b.animate(
        [
          { opacity: 0, transform: `translate(calc(-50% + ${dx}%), calc(-50% + ${dy}%)) scale(1.16)` },
          { opacity: 0.5, offset: 0.14 },
          { transform: 'translate(-50%, -50%) scale(1)', offset: 0.32 },
          { opacity: 0.14, transform: 'translate(-50%, -50%) scale(.97)' },
        ],
        { duration: 1100, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' },
      )
    }
    // HUD
    if (hName.current) {
      hName.current.textContent = name
      hName.current.style.fontVariationSettings = `"wght" ${Math.round(300 + vel * 600)}`
      swapIn(hName.current)
    }
    if (hOct.current) hOct.current.textContent = oct
    if (hDot.current) hDot.current.style.background = col
    if (hInt.current) hInt.current.textContent = first ? '—' : `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)} · ${intervalName(d)}`
    if (hArrow.current) {
      hArrow.current.textContent = d > 0 ? '↗' : d < 0 ? '↘' : '→'
      hArrow.current.style.color = Math.abs(d) >= 5 ? '#ffcf7a' : 'rgba(236,232,245,.55)'
    }
  }

  const show = (on: boolean) => {
    const s = st.current
    if (s.visible === on) return
    s.visible = on
    root.current?.classList.toggle('np-on', on)
    if (!on) { s.id = ''; s.beat = -1; s.phrase = -1; s.chord = -2 }
  }

  usePlayhead((t, playing) => {
    tick(t, playing)
  })
  const tick = (t: number, playing: boolean) => {
    const s = st.current
    if (!playing) {
      if (s.visible && !activeRef.current.length && performance.now() - s.keyAt > 1400) show(false)
      return
    }
    show(true)
    const spb = 60 / bpm
    // いま鳴っている音: 発音中の中で最後に始まった音 (同時なら高い方)
    if (t < s.cursor) s.id = ''
    s.cursor = t
    let cur: Note | null = null
    for (const n of sorted) {
      if (n.startTime > t) break
      if (t < n.startTime + n.duration && (!cur || n.startTime > cur.startTime || (n.startTime === cur.startTime && n.midiNoteNumber > cur.midiNoteNumber))) cur = n
    }
    if (cur && cur.id !== s.id) {
      const first = s.id === ''
      s.id = cur.id
      fire(cur.midiNoteNumber, cur.velocity ?? 0.8, cur.source === 'ai', first ? 'first' : cur.id)
    }
    // 拍カウンタ
    const beat = Math.floor(t / spb + 1e-6)
    if (beat !== s.beat) {
      s.beat = beat
      const bar = Math.floor(beat / beatsPerBar) + 1
      const bi = beat % beatsPerBar
      if (hBar.current) hBar.current.textContent = `${String(bar).padStart(2, '0')}.${bi + 1}`
      const el = dots.current
      if (el) {
        Array.from(el.children).forEach((c, i) => {
          const on = i === bi
          ;(c as HTMLElement).style.background = on ? (i === 0 ? '#fff' : '#ff5bd6') : 'rgba(255,255,255,.14)'
          ;(c as HTMLElement).style.transform = on ? 'scaleY(1.6)' : 'scaleY(1)'
        })
      }
    }
    // 現在のコード
    {
      const b = t / spb
      const ci = chords && chords.length ? chords.findIndex((c) => b >= c.startBeat && b < c.startBeat + c.lengthBeats) : -1
      if (ci !== s.chord) {
        s.chord = ci
        const c = ci >= 0 ? chords![ci] : null
        if (hChord.current) {
          hChord.current.textContent = c ? c.name : '—'
          hChord.current.style.color = c ? FUNC_COLOR[c.func] : 'rgba(236,232,245,.4)'
          swapIn(hChord.current)
        }
        if (hRoman.current) hRoman.current.textContent = c ? `${c.roman} · ${FUNC_JA[c.func]}` : ''
      }
    }
    // 楽式フレーズ
    if (form && form.length) {
      const b = t / spb
      const pi = form.findIndex((f) => b >= f.startBeat && b < f.startBeat + f.lengthBeats)
      if (pi !== s.phrase) {
        s.phrase = pi
        const el = hPhrase.current
        if (el) {
          el.textContent = pi >= 0 ? `${form[pi].label}  ${TRANSFORM_JA[form[pi].transform] ?? ''}` : 'あなたのメロディ'
          swapIn(el)
        }
      }
    }
  }

  // 停止中に鍵盤を弾いたときも同じ表示で反応させる
  const activeRef = useRef(activeKeys)
  const lastKeys = useRef<number[]>([])
  useEffect(() => {
    activeRef.current = activeKeys
    const added = activeKeys.filter((k) => !lastKeys.current.includes(k))
    lastKeys.current = activeKeys
    if (added.length) {
      st.current.keyAt = performance.now()
      show(true)
      fire(added[added.length - 1], 0.85, false, 'k' + Date.now())
      if (hPhrase.current) hPhrase.current.textContent = '鍵盤入力'
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKeys])

  return (
    <div ref={root} className="np-root pointer-events-none absolute inset-0 z-[5] overflow-hidden rounded-2xl" aria-hidden>
      {/* 背景の巨大アウトライン音名 */}
      <div ref={big} className="np-big">
        <span ref={bigName} />
        <sup ref={bigOct} />
      </div>
      {/* HUD */}
      <div ref={hud} className="np-hud absolute right-2 top-[40px] w-[128px] rounded-xl sm:right-3 sm:top-[44px] sm:w-[178px] border border-[var(--line-2)] bg-[#0d0a15]/80 px-2.5 py-2 backdrop-blur-md sm:px-3 sm:py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--tx-3)]">再生中</span>
          <span ref={hDot} className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" style={{ boxShadow: '0 0 8px currentColor' }} />
        </div>
        <div className="mt-0.5 flex items-end gap-1.5">
          <span className="kt-mask leading-none">
            <span ref={hName} className="block font-[Outfit] text-[26px] leading-[0.95] sm:text-[38px] text-white" style={{ fontVariationSettings: '"wght" 600' }}>—</span>
          </span>
          <span ref={hOct} className="num mb-1 text-[12px] text-[var(--tx-3)]" />
          <span ref={hArrow} className="mb-1 ml-auto text-[18px] leading-none transition-colors" />
        </div>
        <span ref={hInt} className="num mt-1 block text-[10.5px] text-[var(--tx-2)]">—</span>
        {chords && chords.length > 0 && (
          <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t border-[var(--line)] pt-1.5">
            <span className="kt-mask"><span ref={hChord} className="num block text-[15px] font-semibold leading-none sm:text-[17px]">—</span></span>
            <span ref={hRoman} className="num truncate text-[9.5px] text-[var(--tx-3)]" />
          </div>
        )}
        <div className="mt-2 hidden items-center justify-between border-t sm:flex border-[var(--line)] pt-2">
          <span className="kt-mask"><span ref={hPhrase} className="block text-[11px] font-medium text-cyan-200">—</span></span>
          <span className="flex items-center gap-1.5">
            <span ref={hBar} className="num text-[10px] text-[var(--tx-3)]">01.1</span>
            <span ref={dots} className="flex items-end gap-[3px]">
              {Array.from({ length: beatsPerBar }).map((_, i) => (
                <span key={i} className="block h-[7px] w-[3px] origin-bottom rounded-full bg-white/15 transition-transform duration-150" />
              ))}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
