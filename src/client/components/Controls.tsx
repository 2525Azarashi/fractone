// コントロールコンポーネント: 録音 / 再生 / 停止 / ループ / テンポ / 音色 / 編集ツール
import type { Dispatch } from 'react'
import type { Action, State } from '../state'
import { INSTRUMENTS, audio } from '../../lib/audio-engine'
import type { Instrument } from '../../lib/types'

function TBtn({ onClick, children, active, title, className = '', disabled }: { onClick: () => void; children: React.ReactNode; active?: boolean; title: string; className?: string; disabled?: boolean }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} data-active={!!active} className={`neu-btn grid h-9 min-w-9 place-items-center rounded-2xl px-2 text-[13px] font-extrabold disabled:opacity-30 ${className}`}>
      {children}
    </button>
  )
}

export function Controls({ state, dispatch, onRecord, onPlay, onStop, onDelete, onQuantize, onAcceptAi, onReroll, onClear }: {
  state: State; dispatch: Dispatch<Action>
  onRecord: () => void; onPlay: () => void; onStop: () => void; onDelete: () => void; onQuantize: () => void
  onAcceptAi: () => void; onReroll: () => void; onClear: () => void
}) {
  const rec = state.status === 'recording'
  const playing = state.status === 'playing'
  const aiCount = state.sequence.filter((n) => n.source === 'ai').length
  return (
    <div className="thin-scroll -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">
      {/* transport */}
      <div className="neu-inset flex items-center gap-1.5 rounded-[20px] p-1.5">
        <TBtn title="録音 (R)" onClick={onRecord} active={rec} className={rec ? 'rec-glow !bg-gradient-to-br !from-rose-500 !to-pink-500' : ''}>
          <span className={`block h-3.5 w-3.5 rounded-full ${rec ? 'bg-white' : 'bg-rose-400'}`} />
        </TBtn>
        <TBtn title="再生 / 一時停止 (Space)" onClick={onPlay} active={playing}>
          {playing ? '❚❚' : '▶'}
        </TBtn>
        <TBtn title="停止して先頭へ (Enter)" onClick={onStop}>■</TBtn>
        <TBtn title="ループ再生" onClick={() => dispatch({ type: 'toggle', key: 'loop' })} active={state.loop}>⟲</TBtn>
        <TBtn title="メトロノーム" onClick={() => { dispatch({ type: 'audio', patch: { metronome: !state.audio.metronome } }) }} active={state.audio.metronome}>𝅘𝅥</TBtn>
      </div>

      {/* tempo */}
      <div className="neu-inset flex items-center gap-1 rounded-[20px] px-2 py-1.5">
        <button className="h-7 w-7 rounded-full text-sm font-black hover:bg-white/10" onClick={() => dispatch({ type: 'params', patch: { bpm: Math.max(50, state.params.bpm - 2) } })} aria-label="テンポを下げる">−</button>
        <div className="w-[58px] text-center leading-none">
          <span key={state.params.bpm} className="kt-swap block font-display text-[17px] font-black text-white">{state.params.bpm}</span>
          <span className="text-[8px] font-bold tracking-[0.2em] text-violet-200/50">BPM</span>
        </div>
        <button className="h-7 w-7 rounded-full text-sm font-black hover:bg-white/10" onClick={() => dispatch({ type: 'params', patch: { bpm: Math.min(200, state.params.bpm + 2) } })} aria-label="テンポを上げる">＋</button>
      </div>

      {/* instrument (音色変更) */}
      <label className="neu-inset flex items-center gap-1 rounded-[20px] py-1.5 pl-2.5 pr-1.5" title="音色">
        <span className="text-[15px]">{INSTRUMENTS.find((i) => i.id === state.audio.instrument)?.emoji}</span>
        <select
          className="select !w-[118px] !py-1.5 !text-[11px]"
          value={state.audio.instrument}
          onChange={(e) => {
            const id = e.target.value as Instrument
            dispatch({ type: 'audio', patch: { instrument: id } })
            audio.update({ instrument: id })
            audio.preview(72, 0.3)
          }}
        >
          {INSTRUMENTS.map((ins) => (
            <option key={ins.id} value={ins.id}>{ins.emoji} {ins.label}</option>
          ))}
        </select>
      </label>

      {/* edit tools */}
      <div className="neu-inset flex items-center gap-1 rounded-[20px] p-1.5">
        <TBtn title="元に戻す (Ctrl+Z)" onClick={() => dispatch({ type: 'undo' })} disabled={!state.history.length}>↶</TBtn>
        <TBtn title="やり直す (Ctrl+Shift+Z)" onClick={() => dispatch({ type: 'redo' })} disabled={!state.future.length}>↷</TBtn>
        <TBtn title="選択した音符を削除 (Delete)" onClick={onDelete} disabled={!state.selected.length}>🗑</TBtn>
        <TBtn title="クオンタイズ (選択 or 全体)" onClick={onQuantize}>⊞</TBtn>
        <select
          className="select !w-[74px] !py-1.5 !text-[11px]"
          value={state.snap}
          title="グリッド"
          onChange={(e) => dispatch({ type: 'snap', snap: Number(e.target.value) })}
        >
          <option value={1}>1/4</option>
          <option value={0.5}>1/8</option>
          <option value={0.25}>1/16</option>
        </select>
      </div>

      {/* AI tools */}
      <div className="neu-inset flex items-center gap-1 rounded-[20px] p-1.5 2xl:ml-auto">
        <TBtn title="AIの音符を自分の音符として確定" onClick={onAcceptAi} disabled={!aiCount}>✔<span className="hidden 2xl:inline"> 採用</span></TBtn>
        <TBtn title="直前のAI生成をシードを変えて作り直す" onClick={onReroll} disabled={!state.result}>🎲<span className="hidden 2xl:inline"> 別案</span></TBtn>
        <TBtn title="すべて消去" onClick={onClear} disabled={!state.sequence.length}>✕</TBtn>
      </div>
    </div>
  )
}
