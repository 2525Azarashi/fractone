// ============================================================
// TakesSheet — 作曲したテイク (別案) のライブラリ
//  BottomSheet + SwipeRow (右へ: お気に入り / 左へ: 削除 → トーストで元に戻す)
//  生成中のテイクは Skeleton で表示
// ============================================================
import type { Note } from '../../lib/types'
import { NOTE_NAMES, SCALES } from '../../lib/theory'
import { BottomSheet, Skeleton, SwipeRow } from './patterns'
import { IStar, IStarF, ITrash } from './icons'

export interface Take {
  id: string
  at: number
  name: string
  seed: number
  mode: 'continue' | 'new'
  key: number
  scale: keyof typeof SCALES
  bpm: number
  notes: Note[]
  fav: boolean
  stats: { harmony: number; motif: number; smooth: number }
}

function MiniRoll({ notes }: { notes: Note[] }) {
  if (!notes.length) return null
  const t1 = Math.max(...notes.map((n) => n.startTime + n.duration))
  const lo = Math.min(...notes.map((n) => n.midiNoteNumber)) - 1
  const hi = Math.max(...notes.map((n) => n.midiNoteNumber)) + 1
  const W = 120, H = 34
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[34px] w-[120px] shrink-0" preserveAspectRatio="none">
      {notes.map((n) => (
        <rect key={n.id} x={(n.startTime / t1) * W} y={((hi - n.midiNoteNumber) / (hi - lo)) * (H - 3)} width={Math.max(1.5, (n.duration / t1) * W - 0.5)} height={3} rx={1} fill={n.source === 'ai' ? '#4fe3ff' : '#ff5bd6'} opacity={0.9} />
      ))}
    </svg>
  )
}

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return `${s}秒前`
  if (s < 3600) return `${Math.floor(s / 60)}分前`
  return `${Math.floor(s / 3600)}時間前`
}

export function TakesSheet({ open, onClose, takes, pending, currentId, onLoad, onFav, onDelete, onReroll }: {
  open: boolean
  onClose: () => void
  takes: Take[]
  pending: boolean
  currentId: string | null
  onLoad: (t: Take) => void
  onFav: (t: Take) => void
  onDelete: (t: Take) => void
  onReroll: () => void
}) {
  const sorted = [...takes].sort((a, b) => Number(b.fav) - Number(a.fav) || b.at - a.at)
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      eyebrow={`${takes.length} 件`}
      title="テイク・ライブラリ"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10.5px] leading-snug text-[var(--tx-3)]">右へスワイプでお気に入り · 左へスワイプで削除 · タップで読み込み</p>
          <button className="btn-primary shrink-0 rounded-xl px-4 py-2 text-[12px] font-medium" onClick={onReroll} disabled={pending}>別案を作曲</button>
        </div>
      }
    >
      <div className="flex flex-col gap-2 pt-1">
        {pending && (
          <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white/[0.02] px-3 py-3" aria-busy="true">
            <Skeleton className="h-[34px] w-[120px]" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-2.5 w-3/5" />
            </div>
            <Skeleton className="h-6 w-10 rounded-lg" />
          </div>
        )}
        {!pending && takes.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-[13px] text-[var(--tx-2)]">まだテイクがありません</p>
            <p className="mt-1 text-[11px] text-[var(--tx-3)]">「続きを作曲」するたびに、ここへ自動で保存されます</p>
          </div>
        )}
        {sorted.map((t, i) => (
          <div key={t.id} className="take-in" style={{ ['--i' as any]: i }}>
            <SwipeRow
              onTap={() => onLoad(t)}
              left={{ label: t.fav ? 'お気に入り解除' : 'お気に入り', color: '#ffcf7a', icon: <IStar size={14} />, run: () => onFav(t) }}
              right={{ label: '削除', color: '#ff6b8a', icon: <ITrash size={14} />, run: () => onDelete(t) }}
            >
              <div className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${currentId === t.id ? 'border-fuchsia-300/40 bg-fuchsia-400/[0.07]' : 'border-[var(--line)] bg-[#16111f] hover:border-[var(--line-2)]'}`}>
                <MiniRoll notes={t.notes} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[12.5px] font-medium text-white">
                    {t.fav && <IStarF size={12} className="shrink-0 text-amber-200" />}
                    {t.name}
                    {currentId === t.id && <span className="rounded bg-fuchsia-400/20 px-1.5 text-[9px] font-semibold text-fuchsia-200">再生中の案</span>}
                  </p>
                  <p className="num mt-0.5 truncate text-[10px] text-[var(--tx-3)]">
                    {NOTE_NAMES[t.key]} {SCALES[t.scale].label} · {t.bpm}bpm · seed {t.seed} · {ago(t.at)}
                  </p>
                </div>
                <div className="hidden shrink-0 grid-cols-3 gap-2 text-center sm:grid">
                  {[['調和', t.stats.harmony.toFixed(1)], ['反復', `${Math.round(t.stats.motif * 100)}%`], ['滑らか', t.stats.smooth.toFixed(1)]].map(([k, v]) => (
                    <div key={k}><p className="text-[9px] text-[var(--tx-3)]">{k}</p><p className="num text-[11px] text-[var(--tx)]">{v}</p></div>
                  ))}
                </div>
              </div>
            </SwipeRow>
          </div>
        ))}
      </div>
    </BottomSheet>
  )
}
