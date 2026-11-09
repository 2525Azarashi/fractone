// ============================================================
// CommandPalette — Auto Complete
//  「/」 or Ctrl+K で開く。入力に応じて候補をあいまい一致で絞り込み、
//  一致した文字をハイライト。ゴースト文字で 1 位候補を先読み表示し Tab で補完。
//  コマンド / キー&スケール / パラメータ (例: "bpm 128" "bars 12") / 音色 / テイク に対応
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { ISearch } from './icons'

export interface Cmd {
  id: string
  title: string
  group: string
  hint?: string
  keys?: string // 検索用の別名 (ローマ字・英語など)
  run: (arg?: number) => void
  /** 数値引数を取るコマンド (例: bpm 128) */
  arg?: { min: number; max: number; unit?: string }
}

/** あいまい一致: クエリの各文字を順番に含めばヒット。連続・語頭一致を高く評価 */
function fuzzy(q: string, text: string): { score: number; hits: number[] } | null {
  if (!q) return { score: 0, hits: [] }
  const t = text.toLowerCase()
  const s = q.toLowerCase()
  const direct = t.indexOf(s)
  if (direct >= 0) return { score: 100 - direct + (direct === 0 ? 50 : 0), hits: Array.from({ length: s.length }, (_, i) => direct + i) }
  let ti = 0, score = 0, prev = -2
  const hits: number[] = []
  for (const ch of s) {
    const at = t.indexOf(ch, ti)
    if (at < 0) return null
    score += at === prev + 1 ? 6 : 1
    if (at === 0 || /[\s·/_-]/.test(t[at - 1] ?? '')) score += 4
    hits.push(at)
    prev = at
    ti = at + 1
  }
  return { score, hits }
}

function Hl({ text, hits }: { text: string; hits: number[] }) {
  if (!hits.length) return <>{text}</>
  const set = new Set(hits)
  return <>{Array.from(text).map((c, i) => (set.has(i) ? <mark key={i} className="bg-transparent font-semibold text-fuchsia-300">{c}</mark> : <span key={i}>{c}</span>))}</>
}

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Cmd[] }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 30) }
  }, [open])

  // "bpm 128" のような「語 + 数値」を分解
  const parsed = useMemo(() => {
    const m = q.trim().match(/^(.*?)[\s=]*(-?\d+(?:\.\d+)?)\s*$/)
    return m && m[1] ? { word: m[1].trim(), num: Number(m[2]) } : { word: q.trim(), num: undefined as number | undefined }
  }, [q])

  const results = useMemo(() => {
    const out: { c: Cmd; hits: number[]; score: number; arg?: number }[] = []
    for (const c of commands) {
      if (parsed.num !== undefined && c.arg) {
        const f = fuzzy(parsed.word, c.title) ?? fuzzy(parsed.word, c.keys ?? '')
        if (f) out.push({ c, hits: fuzzy(parsed.word, c.title)?.hits ?? [], score: f.score + 30, arg: Math.max(c.arg.min, Math.min(c.arg.max, parsed.num)) })
        continue
      }
      const f1 = fuzzy(q.trim(), c.title)
      const f2 = c.keys ? fuzzy(q.trim(), c.keys) : null
      const f = f1 && f2 ? (f1.score >= f2.score ? f1 : { ...f2, hits: [] }) : f1 ?? (f2 ? { ...f2, hits: [] } : null)
      if (f) out.push({ c, hits: f1?.hits ?? [], score: f.score })
    }
    if (q.trim()) out.sort((a, b) => b.score - a.score)
    return out.slice(0, 40)
  }, [commands, q, parsed])

  useEffect(() => setSel(0), [q])
  useEffect(() => {
    list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  // ゴースト補完: 1 位候補のタイトルがクエリで始まるなら、残りを薄く表示
  const top = results[0]
  const ghost = top && q && !parsed.num && top.c.title.toLowerCase().startsWith(q.toLowerCase()) ? top.c.title.slice(q.length) : ''

  const exec = (i: number) => {
    const r = results[i]
    if (!r) return
    if (r.c.arg && r.arg === undefined) {
      // 数値が必要なのに未入力 → 補完して入力を促す
      setQ(`${r.c.title} `)
      input.current?.focus()
      return
    }
    r.c.run(r.arg)
    onClose()
  }
  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); exec(sel) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'Tab') {
      e.preventDefault()
      const r = results[sel]
      if (r) setQ(r.c.arg ? `${r.c.title} ` : r.c.title)
    }
  }

  if (!open) return null
  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-[96] flex items-start justify-center bg-[#07050c]/80 px-3 pt-[12vh]" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="コマンドパレット">
      <div className="palette-in w-full rounded-2xl border border-[var(--line-2)] bg-[#120e1b] shadow-[0_40px_120px_rgba(0,0,0,.7)] max-w-[560px] overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="relative flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5">
          <ISearch size={16} className="shrink-0 text-[var(--tx-3)]" />
          <div className="relative min-w-0 flex-1">
            {/* ゴースト (先読み補完) */}
            <div className="pointer-events-none absolute inset-0 flex items-center whitespace-pre text-[15px]" aria-hidden>
              <span className="invisible">{q}</span><span className="text-white/25">{ghost}</span>
            </div>
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder="コマンド・キー・音色を検索…  例: bpm 128 / D minor / 別案"
              className="relative w-full bg-transparent text-[15px] text-white outline-none placeholder:text-[var(--tx-3)]"
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={`pc-${sel}`}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {ghost && <kbd className="num hidden shrink-0 rounded border border-[var(--line-2)] px-1.5 text-[10px] text-[var(--tx-3)] sm:inline">Tab</kbd>}
          <kbd className="num shrink-0 rounded border border-[var(--line-2)] px-1.5 text-[10px] text-[var(--tx-3)]">Esc</kbd>
        </div>
        <div ref={list} id="palette-list" role="listbox" className="thin-scroll max-h-[min(56vh,440px)] overflow-y-auto p-2">
          {results.length === 0 && (
            <div className="px-3 py-10 text-center">
              <p className="text-[13px] text-[var(--tx-2)]">一致する候補がありません</p>
              <p className="mt-1 text-[11px] text-[var(--tx-3)]">「テンポ」「キー」「別案」などを試してください</p>
            </div>
          )}
          {results.map((r, i) => {
            const head = !q.trim() && r.c.group !== lastGroup
            lastGroup = r.c.group
            return (
              <div key={r.c.id + (r.arg ?? '')}>
                {head && <p className="px-3 pb-1 pt-3 text-[10.5px] text-[var(--tx-3)]">{r.c.group}</p>}
                <button
                  id={`pc-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={i === sel}
                  onMouseMove={() => setSel(i)}
                  onClick={() => exec(i)}
                  className={`${i < 12 ? 'palette-row ' : ''}flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${i === sel ? 'bg-white/[0.07]' : ''}`}
                  style={{ ['--i' as any]: Math.min(i, 12) }}
                >
                  <span className={`h-5 w-[3px] shrink-0 rounded-full transition-colors ${i === sel ? 'bg-[#ff5bd6]' : 'bg-transparent'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-[var(--tx)]"><Hl text={r.c.title} hits={r.hits} />{r.arg !== undefined && <span className="num ml-2 text-cyan-200">→ {r.arg}{r.c.arg?.unit ?? ''}</span>}</span>
                    {r.c.hint && <span className="block truncate text-[10.5px] text-[var(--tx-3)]">{r.c.hint}</span>}
                  </span>
                  {q.trim() && <span className="shrink-0 text-[10px] text-[var(--tx-3)]">{r.c.group}</span>}
                  {i === sel && <kbd className="num shrink-0 rounded border border-[var(--line-2)] px-1.5 text-[10px] text-[var(--tx-3)]">↵</kbd>}
                </button>
              </div>
            )
          })}
        </div>
        <div className="num flex items-center gap-4 border-t border-[var(--line)] px-4 py-2 text-[10px] text-[var(--tx-3)]">
          <span>↑↓ 選択</span><span>Tab 補完</span><span>↵ 実行</span><span className="ml-auto">{results.length} 件</span>
        </div>
      </div>
    </div>
  )
}
