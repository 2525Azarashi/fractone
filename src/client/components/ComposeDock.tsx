// The next action is derived from actual notes, not transient generation metadata.
import { noteCounts, type State } from '../state'
import { ICheck, IDice, IPlay, IPause, ISpark } from './icons'

export function ComposeDock({ state, onContinue, onGenerate, onReroll, busy, onPlay, onAccept, onTakes, onSave, auditioned = false, takeCount = 0 }: {
  state: State; onContinue: () => void; onGenerate: () => void; onReroll: () => void; busy: boolean
  onPlay: () => void; onAccept: () => void; onTakes: () => void; onSave: () => void; auditioned?: boolean; takeCount?: number
}) {
  const counts = noteCounts(state.sequence)
  const playing = state.status === 'playing'
  const locked = busy || state.status === 'recording'
  const hasNotes = state.sequence.length > 0
  const canContinue = counts.fixed >= 2 && !counts.proposed
  const label = busy ? 'メロディを生成中…' : playing ? '一時停止' : counts.proposed ? (auditioned ? 'この提案を採用' : '再生して聴く') : canContinue ? '続きを作曲' : 'メロディを生成'
  const action = playing ? onPlay : counts.proposed ? (auditioned ? onAccept : onPlay) : canContinue ? onContinue : onGenerate
  const hint = busy ? '前の案を残しながら計算しています。少しお待ちください。'
    : state.status === 'recording' ? '録音を停止すると生成・採用できます。'
    : counts.proposed ? `AI提案 ${counts.proposed}音。${auditioned ? '気に入ったら採用、迷ったら別案と比較できます。' : 'まずは聴いてみましょう。採用するまでは提案のまま編集できます。'}`
    : canContinue ? `確定した ${counts.fixed}音を残して、${state.params.bars}小節の続きを提案します。`
    : '左（スマートフォンでは上）で雰囲気を選び、最初のメロディを作りましょう。'
  return (
    <div className="compose-guide" aria-busy={busy}>
      <ol className="workflow-steps" aria-label="曲づくりの流れ">
        {['設定を選ぶ', '生成する', '聴く', '採用・別案', '編集・書き出し'].map((step, i) => <li key={step} aria-current={(busy ? i === 1 : !hasNotes ? i === 0 : counts.proposed ? i === (auditioned ? 3 : 2) : i === 4) ? 'step' : undefined}><span>{i + 1}</span>{step}</li>)}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-white">{hasNotes ? 'メロディを育てよう' : 'まずは、ひとつのメロディから。'}</h2>
          <p id="compose-hint" className="mt-1 text-[13px] leading-relaxed text-[var(--tx-2)]" role="status">{hint}</p>
        </div>
        <button className="btn-primary main-compose flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-[15px] font-semibold" onClick={action} disabled={locked} aria-describedby="compose-hint">
          {busy ? <span className="spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" /> : playing ? <IPause size={18} /> : counts.proposed ? (auditioned ? <ICheck size={18} /> : <IPlay size={18} />) : <ISpark size={18} />}
          {label}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {counts.proposed > 0 && <button className="btn-ghost rounded-lg px-3 text-sm" onClick={onAccept} disabled={locked || playing}>提案 {counts.proposed}音を採用</button>}
        <button className="btn-ghost flex items-center gap-2 rounded-lg px-3 text-sm" onClick={onReroll} disabled={locked || playing || !counts.proposed} aria-describedby="continue-reason"><IDice size={16} />別案を生成</button>
        {!canContinue && <button className="btn-ghost rounded-lg px-3 text-sm" onClick={onContinue} disabled={locked || playing || !canContinue} aria-describedby="continue-reason">続きを作曲（+{state.params.bars}小節）</button>}
        {hasNotes && <button className="btn-ghost rounded-lg px-3 text-sm" onClick={onGenerate} disabled={locked || playing}>新規生成（全体を作り直す）</button>}
        <button className="btn-ghost rounded-lg px-3 text-sm" onClick={onTakes} disabled={busy}>保存した案を比較（{takeCount}）</button>
        <button className="btn-ghost rounded-lg px-3 text-sm" onClick={onSave} disabled={locked || !hasNotes}>MIDI書き出し</button>
      </div>
      <p id="continue-reason" className="mt-2 text-xs leading-relaxed text-[var(--tx-2)]">
        {counts.proposed ? '続きは提案を採用すると作れます。別案は未採用部分のみ差し替え、現在の案はテイクに残します。' : counts.fixed < 2 ? '続きの作曲には、入力または採用済みの音符が2音以上必要です。別案は生成後に使えます。' : '新しい曲を生成しても現在の案はテイクに残ります。直前の編集・生成はUndoで戻せます。'}
      </p>
      <div className="note-legend mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="音符の状態">
        <span data-kind="input">● 入力 {counts.input}音</span><span data-kind="proposed">◇ AI提案 {counts.proposed}音</span><span data-kind="accepted">✓ 採用済み {counts.accepted}音</span>
      </div>
    </div>
  )
}
