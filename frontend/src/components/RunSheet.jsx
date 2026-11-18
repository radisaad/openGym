import { useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { todayISO, uid, fmtNum } from '../lib/format.js'
import { NOTE_MAX } from '../lib/history.js'
import { useSheetKeyboard } from '../lib/use-sheet-keyboard.js'
import { activitiesOf, withActivity } from '../lib/activities.js'
import { PAIN_AREAS, RUN_TYPES } from '../lib/run-fields.js'
import { sessionStats, fmtPace, fmtTime, parseTime } from '../lib/running.js'
import { activeShoes, defaultShoe } from '../lib/shoes.js'
import { readRunProfile } from '../lib/run-import.js'
import DateField from './DateField.jsx'
import Icon from './Icon.jsx'
import { Button, NumberField, Slider, Segmented, Check } from './ui.jsx'

// Log a run or a walk by hand (lib/running.js, the fields in lib/run-fields.js), or open one to fix
// or remove. Three shapes: a run, a walk, or a run with walking in it, logged part by part so its
// running pace is its own number and never the outing's average.

export const PAIN_LABEL = {
  'hip-r': 'Right hip', 'hip-l': 'Left hip', 'knee-r': 'Right knee', 'knee-l': 'Left knee',
  calf: 'Calves', shin: 'Shins', foot: 'Feet', back: 'Lower back',
}
export const TYPE_LABEL = {
  easy: 'Easy', long: 'Long', runwalk: 'Run/walk', tempo: 'Tempo', intervals: 'Intervals', race: 'Race', test: 'All-out test',
}
/** A word for an effort of 1 to 10. */
export const effortWord = n => (n <= 3 ? t('Easy') : n <= 6 ? t('Moderate') : n <= 8 ? t('Hard') : t('All-out'))

const shapeOf = a => (!a ? 'run' : a.sport === 'walk' ? 'walk' : a.segs?.length ? 'mixed' : 'run')
const segDraft = g => ({ k: g.k, km: g.km ?? null, time: g.sec ? fmtTime(g.sec) : '' })

function RunLog({ id = null, sport = 'run', day = null, draft: pre = null, close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  // `pre`: a run the interval timer just finished (views/RunTimer.jsx), its parts and times filled in.
  const had = id ? activitiesOf(S).find(a => a.id === id) : pre
  const profile = readRunProfile(S.runProfile)
  const shoes = activeShoes(S)
  const [shape, setShape] = useState(had ? shapeOf(had) : sport === 'walk' ? 'walk' : 'run')
  const [d, setD] = useState(had?.d || day || todayISO())
  const [km, setKm] = useState(had?.km ?? null)
  const [time, setTime] = useState(had ? fmtTime(had.sec || had.min * 60) : '')
  const [cont, setCont] = useState(had?.cont === true)
  const [segs, setSegs] = useState(had?.segs?.length ? had.segs.map(segDraft)
    : [{ k: 'walk', km: null, time: '' }, { k: 'run', km: null, time: '' }, { k: 'walk', km: null, time: '' }])
  const [type, setType] = useState(had?.type || null)
  const [rpe, setRpe] = useState(had?.rpe || null)
  // Every area the profile watches is asked each time; others when one is added.
  const [pain, setPain] = useState(() => {
    const p = { ...(had?.pain || {}) }
    for (const a of profile.watch) if (!(a in p)) p[a] = id ? undefined : 0
    return p
  })
  const [more, setMore] = useState(!!(had?.cad || had?.elev || had?.hr || had?.steps))
  const [cad, setCad] = useState(had?.cad ?? null)
  const [elev, setElev] = useState(had?.elev ?? null)
  const [hr, setHr] = useState(had?.hr ?? null)
  const [steps, setSteps] = useState(had?.steps ?? null)
  const [shoe, setShoe] = useState(id ? had.shoe || null : defaultShoe(S))
  const [note, setNote] = useState(had?.note || '')
  const noteRef = useRef(null)
  const onNoteFocus = useSheetKeyboard(noteRef)

  const parts = segs.map(g => ({ k: g.k, sec: parseTime(g.time), km: Number(g.km) > 0 ? Number(g.km) : undefined }))
  const mixedOk = parts.some(g => g.sec > 0)
  const sec = shape === 'mixed' ? parts.reduce((n, g) => n + (g.sec || 0), 0) : parseTime(time)
  const draft = shape === 'mixed'
    ? { sport: 'run', sec, segs: parts.filter(g => g.sec > 0) }
    : { sport: shape, sec, km: Number(km) > 0 ? Number(km) : undefined, cont: shape === 'run' && cont }
  const st = sec > 0 ? sessionStats({ ...draft, km: draft.km ?? draft.segs?.reduce((n, g) => n + (g.km || 0), 0) }) : null
  const ok = sec > 0 && d <= todayISO() && (shape !== 'mixed' || mixedOk)

  const save = () => {
    if (!ok) return
    const answered = Object.fromEntries(Object.entries(pain).filter(([, v]) => v != null))
    const entry = {
      ...(had?.at ? { at: had.at } : {}), ...(had?.title ? { title: had.title } : {}),
      d, ...draft, type: shape === 'mixed' ? type || 'runwalk' : shape === 'run' ? type || undefined : undefined,
      rpe: rpe || undefined, pain: answered,
      ...(more ? { cad, elev, hr, steps } : {}),
      shoe: shoe || undefined, note: note.trim().slice(0, NOTE_MAX), src: had?.src || 'manual',
    }
    update(s => { s.activities = withActivity(s.activities, id || 'm' + uid(), entry) })
    close()
    const sore = Object.values(answered).some(v => v >= 4)
    toast(sore ? t('Saved. Take that pain seriously: rest it, and get it checked if it stays.') : id ? t('Saved') : draft.sport === 'walk' ? t('Walk logged.') : t('Run logged. Nice work.'))
  }
  const remove = () => {
    update(s => { s.activities = withActivity(s.activities, id, null) })
    close()
    toast(t('Activity removed'))
  }
  const setSeg = (i, patch) => setSegs(list => list.map((g, j) => (j === i ? { ...g, ...patch } : g)))

  return <>
    <h3>{id ? (had.sport === 'walk' ? t('Edit walk') : t('Edit run')) : t('Log a run')}</h3>
    <Segmented value={shape} onChange={setShape} options={[
      { value: 'run', label: t('Run') }, { value: 'mixed', label: t('Run + walk') }, { value: 'walk', label: t('Walk') },
    ]} />
    <div style={{ height: 12 }} />
    <label className="measure-date">
      <span>{t('Date')}</span>
      <DateField value={d} max={todayISO()} onChange={setD} label={t('Date')} />
    </label>

    {shape !== 'mixed' ? <div className="run-grid">
      <label><span className="small muted">{t('Distance (km)')}</span>
        <NumberField className="input" value={km} nullable onChange={setKm} aria-label={t('Distance (km)')} /></label>
      <label><span className="small muted">{t('Time')}</span>
        <input className="input" inputMode="numeric" placeholder="32:40" value={time} onChange={e => setTime(e.target.value)} aria-label={t('Time')} /></label>
    </div> : <div className="run-parts">
      <div className="small muted">{t('Each part in order, the warm-up walk first. Time as mm:ss.')}</div>
      {segs.map((g, i) => <div key={i} className="run-part">
        <button type="button" className={'chip nocap ichip' + (g.k === 'run' ? ' on' : '')} onClick={() => setSeg(i, { k: g.k === 'run' ? 'walk' : 'run' })}
          aria-label={t('Run or walk')}><Icon name={g.k === 'run' ? 'figureRun' : 'steps'} />{g.k === 'run' ? t('Run') : t('Walk')}</button>
        <NumberField className="input" value={g.km} nullable onChange={v => setSeg(i, { km: v })} placeholder={t('km')} aria-label={t('Distance (km)')} />
        <input className="input" inputMode="numeric" placeholder="2:00" value={g.time} onChange={e => setSeg(i, { time: e.target.value })} aria-label={t('Time')} />
        <button type="button" className="iconbtn" onClick={() => setSegs(list => list.filter((_, j) => j !== i))} aria-label={t('Remove')} disabled={segs.length < 2}><Icon name="xmark" /></button>
      </div>)}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="chip add nocap run-add" onClick={() => setSegs(l => [...l, { k: 'run', km: null, time: '' }])}><Icon name="plus" />{t('Run')}</button>
        <button type="button" className="chip add nocap run-add" onClick={() => setSegs(l => [...l, { k: 'walk', km: null, time: '' }])}><Icon name="plus" />{t('Walk')}</button>
      </div>
    </div>}

    {st && <div className="run-sum small" aria-live="polite">
      {[st.km > 0 ? t('{0} km', fmtNum(st.km)) : null, fmtTime(st.sec),
        st.pace ? t('{0} /km overall', fmtPace(st.pace)) : null,
        st.runPace && st.mixed ? t('{0} /km running', fmtPace(st.runPace)) : null].filter(Boolean).join(' · ')}
    </div>}

    {shape === 'run' && <Check checked={cont} onChange={setCont} label={t('Ran the whole way, no walking')} />}

    {shape !== 'walk' && <>
      <div className="small muted run-lbl">{t('What kind of session')}</div>
      <div className="chips" style={{ flexWrap: 'wrap' }}>
        {RUN_TYPES.filter(k => (shape === 'mixed' ? true : k !== 'runwalk')).map(k => <button key={k} type="button"
          className={'chip nocap' + ((type || (shape === 'mixed' ? 'runwalk' : null)) === k ? ' on' : '')}
          aria-pressed={type === k} onClick={() => setType(type === k ? null : k)}>{t(TYPE_LABEL[k])}</button>)}
      </div>
    </>}

    <div className="small muted run-lbl">{rpe ? t('How hard it felt: {0}/10, {1}', rpe, effortWord(rpe)) : t('How hard it felt')}</div>
    <div className="chips run-rpe" role="radiogroup" aria-label={t('How hard it felt')}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <button key={n} type="button" role="radio" aria-checked={rpe === n}
        className={'chip nocap' + (rpe === n ? ' on' : '')} onClick={() => setRpe(rpe === n ? null : n)}>{n}</button>)}
    </div>

    <div className="small muted run-lbl">{t('Any pain? 0 is none, 10 is the worst.')}</div>
    {Object.keys(pain).map(area => <div key={area} className="run-pain">
      <span className="small">{t(PAIN_LABEL[area])}</span>
      <Slider min={0} max={10} value={pain[area] ?? 0} onChange={v => setPain(p => ({ ...p, [area]: v }))} ariaLabel={t(PAIN_LABEL[area])}
        ariaValueText={`${pain[area] ?? 0}/10`} />
      <span className={'small run-pain-v' + ((pain[area] ?? 0) >= 4 ? ' bad' : '')}>{pain[area] == null ? '–' : `${pain[area]}/10`}</span>
    </div>)}
    <div className="chips" style={{ flexWrap: 'wrap' }}>
      {PAIN_AREAS.filter(a => !(a in pain)).map(a => <button key={a} type="button" className="chip add nocap run-add" onClick={() => setPain(p => ({ ...p, [a]: 0 }))}>
        <Icon name="plus" />{t(PAIN_LABEL[a])}</button>)}
    </div>

    {shoes.length > 0 && <>
      <div className="small muted run-lbl">{t('Shoes')}</div>
      <div className="chips" style={{ flexWrap: 'wrap' }}>
        {shoes.map(s => <button key={s.id} type="button" className={'chip nocap' + (shoe === s.id ? ' on' : '')} aria-pressed={shoe === s.id}
          onClick={() => setShoe(shoe === s.id ? null : s.id)}>{s.name}</button>)}
      </div>
    </>}

    <button type="button" className="linkbtn run-lbl" onClick={() => setMore(!more)} aria-expanded={more}>
      <Icon name={more ? 'chevronUp' : 'chevronDown'} />{t('More details')}</button>
    {more && <div className="run-grid">
      <label><span className="small muted">{t('Cadence (steps/min)')}</span><NumberField className="input" decimal={false} nullable value={cad} onChange={setCad} /></label>
      <label><span className="small muted">{t('Elevation gain (m)')}</span><NumberField className="input" decimal={false} nullable value={elev} onChange={setElev} /></label>
      <label><span className="small muted">{t('Average heart rate')}</span><NumberField className="input" decimal={false} nullable value={hr} onChange={setHr} /></label>
      <label><span className="small muted">{t('Steps')}</span><NumberField className="input" decimal={false} nullable value={steps} onChange={setSteps} /></label>
    </div>}

    <textarea ref={noteRef} className="input" rows={2} maxLength={NOTE_MAX} value={note} style={{ marginTop: 12 }}
      placeholder={t('How was it? (optional)')} onFocus={onNoteFocus} onChange={e => setNote(e.target.value)} />
    <div style={{ height: 16 }} />
    <Button variant="primary" icon="check" onClick={save} disabled={!ok}>{t('Save')}</Button>
    {id && <><div style={{ height: 8 }} /><Button variant="ghost" icon="trash" onClick={remove}>{t('Remove')}</Button></>}
  </>
}

/** Log a new run (or walk, with `sport`), or open the one with `id`; `draft` fills a new one in. */
export const runSheet = ({ id = null, sport = 'run', day = null, draft = null } = {}) =>
  useUI.getState().openSheet(close => <RunLog id={id} sport={sport} day={day} draft={draft} close={close} />)
