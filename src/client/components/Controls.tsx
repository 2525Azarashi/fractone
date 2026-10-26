// コントロールコンポーネント: 録音 / 再生 / 停止 / ループ / テンポ / 音色 / 編集ツール
import type { Dispatch, ReactNode } from 'react'
import type { Action, State } from '../state'
import { INSTRUMENTS, audio } from '../../lib/audio-engine'
import type { Instrument } from '../../lib/types'
import { ICheck, IGrid, ILoop, IMetro, IMinus, IPause, IPlay, IPlus, IRec, IRedo, IStop, ITrash, IUndo, IX } from './icons'

function TBtn({ onClick, children, active, title, className = '', disabled }: { onClick: () => void; children: ReactNode; active?: boolean; title: string; className?: string; disabled?: boolean }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} data-active={!!active} className={`neu-btn grid h-8 min-w-8 place-items-center rounded-lg px-1.5 disabled:opacity-25 ${className}`}>
      {children}
    </button>
  )
}

const Group = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`flex items-center gap-1 rounded-xl border border-[var(--line)] bg-black/20 p-1 ${className}`}>{children}</div>
)

export function Controls({ state, dispatch, onRecord, onPlay, onStop, onDelete, onQuantize, onAcceptAi, onClear }: {
  state: State; dispatch: Dispatch<Action>
  onRecord: () => void; onPlay: () => void; onStop: () => void; onDelete: () => void; onQuantize: () => void
  onAcceptAi: () => void; onClear: () => void
}) {
  const rec = state.status === 'recording'
  const playing = state.status === 'playing'
  const aiCount = state.sequence.filter((n) => n.source === 'ai').length
  return (
    <div className="thin-scroll -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">
      <Group>
        <TBtn title="録音 (R)" onClick={onRecord} active={rec} className={rec ? 'rec-glow !border-rose-400/50 !text-rose-300' : '!text-rose-400'}>
          <IRec size={14} />
        </TBtn>
        <TBtn title="再生 / 一時停止 (Space)" onClick={onPlay} active={playing} className="!w-10">
          {playing ? <IPause size={14} /> : <IPlay size={14} />}
        </TBtn>
        <TBtn title="停止して先頭へ (Enter)" onClick={onStop}><IStop size={14} /></TBtn>
        <span className="mx-0.5 h-4 w-px bg-[var(--line-2)]" />
        <TBtn title="ループ再生" onClick={() => dispatch({ type: 'toggle', key: 'loop' })} active={state.loop}><ILoop size={14} /></TBtn>
        <TBtn title="メトロノーム" onClick={() => dispatch({ type: 'audio', patch: { metronome: !state.audio.metronome } })} active={state.audio.metronome}><IMetro size={14} /></TBtn>
      </Group>

      <Group className="!gap-0 !px-1.5">
        <button className="grid h-7 w-6 place-items-center rounded-md text-[var(--tx-3)] hover:text-white" onClick={() => dispatch({ type: 'params', patch: { bpm: Math.max(50, state.params.bpm - 2) } })} aria-label="テンポを下げる"><IMinus size={13} /></button>
        <div className="flex w-[64px] items-baseline justify-center gap-1">
          <span key={state.params.bpm} className="kt-swap num text-[15px] font-semibold text-white">{state.params.bpm}</span>
          <span className="text-[10px] text-[var(--tx-3)]">BPM</span>
        </div>
        <button className="grid h-7 w-6 place-items-center rounded-md text-[var(--tx-3)] hover:text-white" onClick={() => dispatch({ type: 'params', patch: { bpm: Math.min(200, state.params.bpm + 2) } })} aria-label="テンポを上げる"><IPlus size={13} /></button>
      </Group>

      <Group className="!py-0.5 !pl-2.5">
        <span className="text-[10px] text-[var(--tx-3)]">音色</span>
        <select
          className="select !w-[124px] !border-transparent !bg-transparent !py-1 !text-[12px] !shadow-none"
          value={state.audio.instrument}
          onChange={(e) => {
            const id = e.target.value as Instrument
            dispatch({ type: 'audio', patch: { instrument: id } })
            audio.update({ instrument: id })
            audio.preview(72, 0.3)
          }}
        >
          {INSTRUMENTS.map((ins) => (
            <option key={ins.id} value={ins.id}>{ins.label}</option>
          ))}
        </select>
      </Group>

      <Group>
        <TBtn title="元に戻す (Ctrl+Z)" onClick={() => dispatch({ type: 'undo' })} disabled={!state.history.length}><IUndo size={14} /></TBtn>
        <TBtn title="やり直す (Ctrl+Shift+Z)" onClick={() => dispatch({ type: 'redo' })} disabled={!state.future.length}><IRedo size={14} /></TBtn>
        <TBtn title="選択した音符を削除 (Delete)" onClick={onDelete} disabled={!state.selected.length}><ITrash size={14} /></TBtn>
        <TBtn title="クオンタイズ (選択 or 全体)" onClick={onQuantize}><IGrid size={14} /></TBtn>
        <select className="select !w-[64px] !border-transparent !bg-transparent !py-1 !pl-2 !pr-5 !text-[11px] !shadow-none" value={state.snap} title="グリッド" onChange={(e) => dispatch({ type: 'snap', snap: Number(e.target.value) })}>
          <option value={1}>1/4</option>
          <option value={0.5}>1/8</option>
          <option value={0.25}>1/16</option>
        </select>
      </Group>

      <Group className="2xl:ml-auto">
        <TBtn title="AIの音符を自分のメロディとして確定" onClick={onAcceptAi} disabled={!aiCount} className="!px-2.5 text-[11.5px] font-medium">
          <span className="flex items-center gap-1.5"><ICheck size={14} className="text-cyan-300" />採用</span>
        </TBtn>
        <TBtn title="すべて消去" onClick={onClear} disabled={!state.sequence.length}><IX size={14} /></TBtn>
      </Group>
    </div>
  )
}
