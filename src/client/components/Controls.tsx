// Transport stays next to the roll; advanced editing is progressively disclosed.
import type { Dispatch, ReactNode } from 'react'
import type { Action, State } from '../state'
import { INSTRUMENTS, audio } from '../../lib/audio-engine'
import type { Instrument } from '../../lib/types'
import { midiToName, uid } from '../../lib/theory'
import { IGrid, ILoop, IMetro, IPause, IPlay, IRec, IRedo, IStop, ITrash, IUndo } from './icons'

function TBtn({ onClick, children, active, title, disabled }: { onClick: () => void; children: ReactNode; active?: boolean; title: string; disabled?: boolean }) {
  return <button type="button" title={title} aria-label={title} aria-pressed={active} onClick={onClick} disabled={disabled} data-active={!!active} className="neu-btn flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-[13px]">{children}</button>
}

export function Controls({ state, dispatch, onRecord, onPlay, onStop, onDelete, onQuantize, onClear }: {
  state: State; dispatch: Dispatch<Action>; onRecord: () => void; onPlay: () => void; onStop: () => void; onDelete: () => void; onQuantize: () => void; onAcceptAi: () => void; onClear: () => void
}) {
  const rec = state.status === 'recording', playing = state.status === 'playing', busy = state.status === 'composing'
  const locked = busy || rec || playing
  const selected = state.sequence.filter((n) => state.selected.includes(n.id))
  const first = selected[0]
  const spb = 60 / state.params.bpm
  const update = (patch: Partial<typeof first>) => {
    if (!first || locked) return
    dispatch({ type: 'updateNotes', record: true, notes: selected.map((n) => ({ ...n, ...patch })) })
  }
  const addNote = () => {
    if (locked) return
    const note = { id: uid('u'), midiNoteNumber: state.params.centerNote, startTime: state.cursor, duration: Math.max(state.snap, .5) * spb, velocity: .8, source: 'user' as const }
    dispatch({ type: 'addNotes', notes: [note] }); dispatch({ type: 'select', ids: [note.id] }); audio.preview(note.midiNoteNumber, .2)
  }
  return (
    <section className="transport-and-edit" aria-label="再生と音符の編集">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="再生コントロール">
        <TBtn title={playing ? '一時停止 (Space)' : '再生 (Space)'} onClick={onPlay} active={playing} disabled={busy || (!state.sequence.length && !rec)}>{playing ? <IPause size={16} /> : <IPlay size={16} />}{playing ? '一時停止' : '再生'}</TBtn>
        <TBtn title="停止して先頭へ (Enter)" onClick={onStop} disabled={busy}><IStop size={15} />停止</TBtn>
        <TBtn title="ループ再生" onClick={() => dispatch({ type: 'toggle', key: 'loop' })} active={state.loop} disabled={locked}><ILoop size={15} />ループ {state.loop ? 'ON' : 'OFF'}</TBtn>
        <label className="flex items-center gap-2 text-xs text-[var(--tx-2)]">テンポ<input aria-label="再生テンポ BPM" className="select num !w-20 !pr-2" type="number" min={50} max={200} value={state.params.bpm} disabled={locked} onChange={(e) => { const bpm = Number(e.target.value); if (Number.isFinite(bpm) && bpm >= 50 && bpm <= 200) dispatch({ type: 'params', patch: { bpm } }) }} />BPM</label>
        <TBtn title={rec ? '録音を停止 (R)' : '鍵盤の演奏を録音 (R)'} onClick={onRecord} active={rec} disabled={busy || playing}><IRec size={14} />{rec ? '録音を停止' : '録音'}</TBtn>
      </div>
      <p className="my-2 text-xs text-[var(--tx-2)]" role="status">{busy ? '生成中は編集・再生を待ってください。' : rec ? '録音中：下の鍵盤を弾くと音符を記録します。' : playing ? '再生中：停止すると音符を編集できます。' : !state.sequence.length ? '生成すると再生できます。音符の追加や録音から始めることもできます。' : `${state.sequence.length}音を試聴・編集できます。`}</p>
      <fieldset disabled={locked}>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="音符の基本編集">
          <button className="btn-ghost rounded-lg px-3 text-[13px]" onClick={addNote}>＋ カーソル位置に音符を追加</button>
          <TBtn title="元に戻す (Ctrl+Z)" onClick={() => dispatch({ type: 'undo' })} disabled={!state.history.length}><IUndo size={15} />元に戻す</TBtn>
          <TBtn title="やり直す (Ctrl+Shift+Z)" onClick={() => dispatch({ type: 'redo' })} disabled={!state.future.length}><IRedo size={15} />やり直す</TBtn>
          <TBtn title="選択した音符を削除 (Delete)" onClick={onDelete} disabled={!selected.length}><ITrash size={15} />選択を削除</TBtn>
        </div>
        <div className="note-inspector mt-3 rounded-xl border border-[var(--line-2)] p-3">
          <label className="flex flex-wrap items-center gap-2 text-xs text-[var(--tx-2)]">編集する音符
            <select className="select !w-auto max-w-full" aria-label="編集する音符" value={first?.id ?? ''} onChange={(e) => dispatch({ type: 'select', ids: e.target.value ? [e.target.value] : [] })}>
              <option value="">グリッドで選択、またはここから選ぶ</option>
              {state.sequence.map((n, i) => <option key={n.id} value={n.id}>{i + 1}: {midiToName(n.midiNoteNumber)} · {n.source === 'ai' ? 'AI提案' : n.accepted ? '採用済み' : '入力'} · {(n.startTime / spb + 1).toFixed(2)}拍目</option>)}
            </select>
          </label>
          {first ? <>
            <p className="my-2 text-xs text-[var(--tx-2)]" role="status">{selected.length}音を選択中 · {first.source === 'ai' ? '◇ AI提案（編集しても採用までは提案です）' : first.accepted ? '✓ 採用済み' : '● 入力した音符'}{selected.length > 1 ? ' · 下の値は選択した全音符に適用します。' : ''}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="text-xs text-[var(--tx-2)]">音の高さ<select className="select mt-1" aria-label="選択音符の高さ" value={first.midiNoteNumber} onChange={(e) => { update({ midiNoteNumber: Number(e.target.value) }); audio.preview(Number(e.target.value), .2) }}>{Array.from({ length: 61 }, (_, i) => <option key={i} value={36 + i}>{midiToName(36 + i)}</option>)}</select></label>
              <label className="text-xs text-[var(--tx-2)]">開始（拍目）<input aria-label="選択音符の開始位置" className="select mt-1" type="number" min={1} step={state.snap} value={Number((first.startTime / spb + 1).toFixed(3))} onChange={(e) => { const v = Number(e.target.value); if (v >= 1 && Number.isFinite(v)) update({ startTime: (v - 1) * spb }) }} /></label>
              <label className="text-xs text-[var(--tx-2)]">長さ（拍）<input aria-label="選択音符の長さ" className="select mt-1" type="number" min={state.snap} max={64} step={state.snap} value={Number((first.duration / spb).toFixed(3))} onChange={(e) => { const v = Number(e.target.value); if (v >= state.snap && v <= 64) update({ duration: v * spb }) }} /></label>
              <label className="text-xs text-[var(--tx-2)]">強さ（%）<input aria-label="選択音符の強さ" className="select mt-1" type="number" min={1} max={100} value={Math.round((first.velocity ?? .8) * 100)} onChange={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= 100) update({ velocity: v / 100 }) }} /></label>
            </div>
          </> : <p className="mt-2 text-xs text-[var(--tx-2)]">音符を選ぶと高さ・開始位置・長さ・強さを編集できます。削除するには先に音符を選んでください。</p>}
        </div>
        <details className="disclosure mt-3">
          <summary>編集ツール・操作ガイド <span>グリッド・音色・クオンタイズ</span></summary>
          <div className="space-y-3 p-3">
            <p className="text-[13px] leading-relaxed text-[var(--tx-2)]">追加：ダブルクリックまたは「音符を追加」。移動：音符をドラッグ／矢印キー。長さ：右端をドラッグ。複数選択：Shift＋クリック／空白をドラッグ。削除：選択後Delete。タッチでは「タッチ編集」をオンにしてください。</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-[var(--tx-2)]">グリッド<select aria-label="グリッド" className="select mt-1" value={state.snap} onChange={(e) => dispatch({ type: 'snap', snap: Number(e.target.value) })}><option value={1}>4分音符</option><option value={.5}>8分音符</option><option value={.25}>16分音符</option></select></label>
              <TBtn title="選択または全音符をグリッドに揃える" onClick={onQuantize} disabled={!state.sequence.length}><IGrid size={15} />{selected.length ? '選択を揃える' : '全音符を揃える'}</TBtn>
              <button className="btn-ghost rounded-lg px-3 text-xs" disabled={!state.sequence.length} onClick={() => dispatch({ type: 'select', ids: state.sequence.map((n) => n.id) })}>全音符を選択</button>
              <TBtn title="メトロノーム" active={state.audio.metronome} onClick={() => dispatch({ type: 'audio', patch: { metronome: !state.audio.metronome } })}><IMetro size={15} />メトロノーム</TBtn>
              <label className="text-xs text-[var(--tx-2)]">音色<select aria-label="音色" className="select mt-1" value={state.audio.instrument} onChange={(e) => { dispatch({ type: 'audio', patch: { instrument: e.target.value as Instrument } }); audio.update({ instrument: e.target.value as Instrument }); audio.preview(72, .3) }}>{INSTRUMENTS.map((ins) => <option key={ins.id} value={ins.id}>{ins.label}</option>)}</select></label>
            </div>
            <p className="text-xs text-[var(--tx-2)]">クオンタイズは発音位置と長さを選んだグリッドに揃える操作です。Undoで戻せます。</p>
            <div className="border-t border-[var(--line-2)] pt-3"><button className="rounded-lg border border-rose-300/30 px-4 text-xs text-rose-200" onClick={onClear} disabled={!state.sequence.length}>全音符を消去（Undoで戻せます）</button></div>
          </div>
        </details>
      </fieldset>
    </section>
  )
}
