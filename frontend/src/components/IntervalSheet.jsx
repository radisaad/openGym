import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { uid } from '../lib/format.js'
import { readPreset, presetTotals, presetsOf, TIMES_MAX, BUILT_IN } from '../lib/run-intervals.js'
import { fmtTime, parseTime } from '../lib/running.js'
import Icon from './Icon.jsx'
import { Button, Stepper, TextField } from './ui.jsx'

// Build or change an interval workout (lib/run-intervals.js): a warm-up walk, blocks of run and
// walk steps each repeated, a cool-down walk. The profile's own live in S.runIntervals; a built-in
// one opens as a copy to change.

const EDGE_MIN = [0, 3, 5, 10]
const builtIn = new Set(BUILT_IN.map(p => p.id))
/** A preset's name as shown: the built-in ones in the app's language, the profile's own as typed. */
export const presetName = p => (builtIn.has(p?.id) ? t(p.name) : p?.name || t('My intervals'))
const stepDraft = s => ({ k: s.k, time: fmtTime(s.sec) })

function IntervalEdit({ id, close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const had = id ? presetsOf(S).find(p => p.id === id) : null
  const own = !!had && (S.runIntervals || []).some(p => p?.id === id)
  const [name, setName] = useState(had ? (own ? had.name : t(had.name)) : '')
  const [warm, setWarm] = useState(had ? had.warm : 300)
  const [cool, setCool] = useState(had ? had.cool : 300)
  const [blocks, setBlocks] = useState(had?.blocks.length
    ? had.blocks.map(b => ({ times: b.times, steps: b.steps.map(stepDraft) }))
    : [{ times: 6, steps: [{ k: 'walk', time: '2:00' }, { k: 'run', time: '2:00' }] }])

  const preset = readPreset({ id: own ? id : 'u' + uid(), name: name.trim() || t('My intervals'), warm, cool,
    blocks: blocks.map(b => ({ times: b.times, steps: b.steps.map(s => ({ k: s.k, sec: parseTime(s.time) })) })) })
  const tot = preset ? presetTotals(preset) : null

  const setBlock = (bi, patch) => setBlocks(list => list.map((b, j) => (j === bi ? { ...b, ...patch } : b)))
  const setStep = (bi, si, patch) => setBlock(bi, { steps: blocks[bi].steps.map((s, j) => (j === si ? { ...s, ...patch } : s)) })

  const save = () => {
    if (!preset) return
    update(s => {
      const list = (Array.isArray(s.runIntervals) ? s.runIntervals : []).filter(p => p?.id !== preset.id)
      s.runIntervals = [preset, ...list]
    })
    close()
    toast(t('Saved'))
  }
  const remove = () => {
    update(s => { s.runIntervals = (s.runIntervals || []).filter(p => p?.id !== id) })
    close()
  }

  const edge = (label, value, set) => <>
    <div className="small muted run-lbl">{label}</div>
    <div className="chips">{EDGE_MIN.map(m => <button key={m} type="button" className={'chip nocap' + (value === m * 60 ? ' on' : '')}
      aria-pressed={value === m * 60} onClick={() => set(m * 60)}>{m ? t('{0} min', m) : t('None')}</button>)}</div>
  </>

  return <>
    <h3>{own ? t('Edit intervals') : t('New intervals')}</h3>
    <TextField value={name} onChange={e => setName(e.target.value)} placeholder={t('Name')} maxLength={40} aria-label={t('Name')} />
    {edge(t('Warm-up walk'), warm, setWarm)}
    {blocks.map((b, bi) => <div key={bi} className="rt-block">
      {b.steps.map((st, si) => <div key={si} className="rt-step">
        <button type="button" className={'chip nocap ichip' + (st.k === 'run' ? ' on' : '')} onClick={() => setStep(bi, si, { k: st.k === 'run' ? 'walk' : 'run' })}
          aria-label={t('Run or walk')}><Icon name={st.k === 'run' ? 'figureRun' : 'steps'} />{st.k === 'run' ? t('Run') : t('Walk')}</button>
        <input className="input" inputMode="numeric" value={st.time} placeholder="2:00" aria-label={t('Time')} onChange={e => setStep(bi, si, { time: e.target.value })} />
        <button type="button" className="iconbtn" disabled={b.steps.length < 2} aria-label={t('Remove')}
          onClick={() => setBlock(bi, { steps: b.steps.filter((_, j) => j !== si) })}><Icon name="xmark" /></button>
      </div>)}
      <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="chip add nocap run-add" onClick={() => setBlock(bi, { steps: [...b.steps, { k: 'run', time: '1:00' }] })}><Icon name="plus" />{t('Step')}</button>
        <span className="grow" />
        <Stepper value={b.times} min={1} max={TIMES_MAX} step={1} decimal={false} onChange={v => setBlock(bi, { times: v })} unit="×" ariaLabel={t('Repeats')} />
        {blocks.length > 1 && <button type="button" className="iconbtn" aria-label={t('Remove')} onClick={() => setBlocks(l => l.filter((_, j) => j !== bi))}><Icon name="trash" /></button>}
      </div>
    </div>)}
    <button type="button" className="chip add nocap run-add" style={{ marginTop: 10 }} onClick={() => setBlocks(l => [...l, { times: 3, steps: [{ k: 'walk', time: '1:00' }, { k: 'run', time: '1:00' }] }])}>
      <Icon name="plus" />{t('Another block')}</button>
    {edge(t('Cool-down walk'), cool, setCool)}
    {tot && <div className="run-sum small">{t('{0} in all, {1} of it running', fmtTime(tot.sec), fmtTime(tot.runSec))} · {tn('{0} step', '{0} steps', tot.steps)}</div>}
    <div style={{ height: 16 }} />
    <Button variant="primary" icon="check" onClick={save} disabled={!preset}>{t('Save')}</Button>
    {own && <><div style={{ height: 8 }} /><Button variant="ghost" icon="trash" onClick={remove}>{t('Remove')}</Button></>}
  </>
}

/** New intervals, or the preset `id` to change (a built-in one as a copy). */
export const intervalSheet = (id = null) => useUI.getState().openSheet(close => <IntervalEdit id={id} close={close} />)
