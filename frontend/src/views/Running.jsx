import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { fmtDate, fmtNum, todayISO, uid } from '../lib/format.js'
import { MOBILE, shareExport } from '../lib/mobile.js'
import { runsOf, sessionStats, runWeeks, runBests, longestJump, lastPain, fmtPace, fmtTime } from '../lib/running.js'
import { shoesOf, withShoe, shoeWear, SHOE_MAX_KM } from '../lib/shoes.js'
import { parseRunFile, applyRunFile, runFileOf, readRunProfile } from '../lib/run-import.js'
import { runSheet, PAIN_LABEL, TYPE_LABEL, effortWord } from '../components/RunSheet.jsx'
import Icon from '../components/Icon.jsx'
import CardHead from '../components/CardHead.jsx'
import { Button, NumberField, TextField, Check } from '../components/ui.jsx'
import { presetsOf, presetTotals, cuesOf } from '../lib/run-intervals.js'
import { useRunTimer } from '../store/useRunTimer.js'
import { nativeCues } from '../lib/run-coach.js'
import { speak, voiceOpts } from '../lib/speech.js'
import { intervalSheet, presetName } from '../components/IntervalSheet.jsx'
import '../running.css'

// Running (v1.4.6): the runs and walks in one place (lib/running.js). This week at a glance, the
// last eight weeks, the bests, every session with its two paces, the shoes and how far they have
// gone, and the log as a file to bring in or take out (lib/run-import.js).

const RECENT = 12

export default function Running() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const runs = runsOf(S)
  const weeks = runWeeks(S, 8, todayISO())
  const week = weeks[weeks.length - 1]
  const prev = weeks[weeks.length - 2]
  const bests = runBests(S)
  const jump = longestJump(S)
  const profile = readRunProfile(S.runProfile)

  return <>
    <div className="hdr"><button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Running')}</h1>
        <div className="sub">{profile.goal || t('Runs and walks, and how far you have come.')}</div></div></div>

    <div className="card run-week">
      <CardHead icon="figureRun" tint="var(--orange)" eyebrow={t('This week')} title={t('{0} km', fmtNum(week.km))}
        sub={[fmtTime(week.sec), week.runs ? tn('{0} run', '{0} runs', week.runs) : null, week.walks ? tn('{0} walk', '{0} walks', week.walks) : null,
          prev.km > 0 ? t('Last week {0} km', fmtNum(prev.km)) : null].filter(Boolean).join(' · ')} />
      <WeekBars weeks={weeks} />
      <div className="row run-actions">
        <Button variant="primary" icon="plus" onClick={() => runSheet({ sport: 'run' })}>{t('Log a run')}</Button>
        <Button icon="steps" onClick={() => runSheet({ sport: 'walk' })}>{t('Log a walk')}</Button>
      </div>
    </div>

    <IntervalsCard S={S} />

    <Watchouts S={S} profile={profile} jump={jump} />

    {runs.length > 0 && <div className="card">
      <CardHead icon="trophy" tint="var(--yellow)" title={t('Bests')} />
      <div className="run-bests">
        <Best label={t('Longest outing')} value={bests.longest ? t('{0} km', fmtNum(bests.longest.value)) : '–'} d={bests.longest?.d} />
        <Best label={t('Longest run')} value={bests.longestRun ? t('{0} km', fmtNum(bests.longestRun.value)) : '–'} d={bests.longestRun?.d} />
        <Best label={t('Fastest running pace')} value={bests.fastest ? t('{0} /km', fmtPace(bests.fastest.value)) : '–'}
          d={bests.fastest?.d} sub={bests.fastest ? t('over {0} km', fmtNum(Math.round(bests.fastest.km * 10) / 10)) : t('1 km or more, running only')} />
      </div>
    </div>}

    <div className="card">
      <CardHead icon="list" title={t('Sessions')} sub={runs.length ? null : t('Nothing logged yet. Log your first run, or bring in a running log below.')} />
      {runs.slice(0, RECENT).map(a => <RunRow key={a.id} a={a} />)}
      {runs.length > RECENT && <div className="small muted run-more">{t('Older sessions are in History.')}</div>}
    </div>

    <ShoesCard S={S} />
    <FileCard S={S} />
  </>
}

/** The interval timer's workouts, one tap to start (views/RunTimer.jsx). */
function IntervalsCard({ S }) {
  const nav = useNavigate()
  const going = useRunTimer(s => s.run)
  const start = async preset => {
    useRunTimer.getState().start(preset)
    // A browser's voice wants its first line said inside the tap; the phone app says it itself.
    if (!(await nativeCues())) {
      const first = cuesOf(useRunTimer.getState().run, Date.now(), t, tn)[0]
      if (first) speak(first.text, { ...voiceOpts(S), onSilent: true })
    }
    nav('/running/timer')
  }
  return <div className="card rt-presets">
    <CardHead icon="timer" tint="var(--orange)" title={t('Interval timer')} sub={t('Run and walk on cue, with your phone in your pocket.')}
      action={<button type="button" className="iconbtn" onClick={() => intervalSheet()} aria-label={t('New intervals')}><Icon name="plus" /></button>} />
    {going && <Button variant="primary" icon="play" onClick={() => nav('/running/timer')}>{t('Back to your run')}</Button>}
    {!going && presetsOf(S).map(p => {
      const tot = presetTotals(p)
      return <div key={p.id} className="row" style={{ alignItems: 'center', gap: 4 }}>
        <button type="button" className="item grow" onClick={() => start(p)} aria-label={t('Start {0}', presetName(p))}>
          <span className="lrow-i act-i" aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 8 }}><Icon name="play" /></span>
          <span className="grow"><span className="tt">{presetName(p)}</span>
            <span className="ss">{t('{0} in all, {1} of it running', fmtTime(tot.sec), fmtTime(tot.runSec))}</span></span>
        </button>
        <button type="button" className="iconbtn" onClick={() => intervalSheet(p.id)} aria-label={t('Edit intervals')}><Icon name="pencil" /></button>
      </div>
    })}
  </div>
}

function WeekBars({ weeks }) {
  const top = Math.max(1, ...weeks.map(w => w.km))
  return <div className="run-bars" role="img" aria-label={t('Distance in each of the last {0} weeks', weeks.length)}>
    {weeks.map((w, i) => <div key={w.week} className={'run-bar' + (i === weeks.length - 1 ? ' now' : '')} title={`${fmtDate(w.week)}: ${fmtNum(w.km)} km`}>
      <span className="run-bar-v">{w.km > 0 ? fmtNum(Math.round(w.km)) : ''}</span>
      <span className="run-bar-f" style={{ height: `${Math.max(w.km > 0 ? 6 : 2, w.km / top * 100)}%` }} />
    </div>)}
  </div>
}

function Best({ label, value, d, sub }) {
  return <div className="run-best"><div className="small muted">{label}</div><div className="run-best-v">{value}</div>
    <div className="small dim">{[d ? fmtDate(d) : null, sub].filter(Boolean).join(' · ')}</div></div>
}

/** What to look at before the next session: a pain answered high, a big jump in distance. */
function Watchouts({ S, profile, jump }) {
  const notes = []
  for (const area of profile.watch) {
    const p = lastPain(S, area)
    if (p && p.v >= 4) notes.push({ key: area, bad: true, text: t('{0} was {1}/10 after your run on {2}. Rest it until normal walking and stairs feel fine, and get it checked if it stays.', t(PAIN_LABEL[area]), p.v, fmtDate(p.d)) })
    else if (p && p.v > 0) notes.push({ key: area, text: t('{0} was {1}/10 last time. Keep the next run easy and check it again the morning after.', t(PAIN_LABEL[area]), p.v) })
  }
  if (jump && jump.ratio >= 1.3) notes.push({ key: 'jump', text: t('Your latest outing was {0}% longer than any before it. Let the next few stay shorter and easy before going further again.', Math.round((jump.ratio - 1) * 100)) })
  if (!notes.length) return null
  return <div className="card run-watch">
    <CardHead icon="warning" tint="var(--orange)" title={t('Before your next run')} />
    {notes.map(n => <p key={n.key} className={'small' + (n.bad ? ' run-bad' : '')}>{n.text}</p>)}
  </div>
}

export function RunRow({ a, showDate = true }) {
  const st = sessionStats(a)
  const sore = a.pain && Object.values(a.pain).some(v => v >= 4)
  const pace = st.mixed
    ? [st.runPace ? t('{0} /km running', fmtPace(st.runPace)) : null, st.pace ? t('{0} /km overall', fmtPace(st.pace)) : null]
    : [st.pace ? t('{0} /km', fmtPace(st.pace)) : null]
  return <button type="button" className="item act-row run-row" onClick={() => runSheet({ id: a.id })}>
    <span className="lrow-i act-i" aria-hidden="true"><Icon name={a.sport === 'walk' ? 'steps' : 'figureRun'} /></span>
    <span className="grow">
      <span className="tt">{a.title || (a.sport === 'walk' ? t('Walk') : a.type ? t(TYPE_LABEL[a.type]) : t('Run'))}
        {sore && <Icon name="warning" className="run-sore" />}</span>
      <span className="ss">{[showDate ? fmtDate(a.d, true) : null, st.km > 0 ? t('{0} km', fmtNum(st.km)) : null, fmtTime(st.sec), ...pace,
        a.rpe ? effortWord(a.rpe) : null].filter(Boolean).join(' · ')}</span>
    </span>
    <Icon name="chevronRight" className="chev" />
  </button>
}

function ShoesCard({ S }) {
  const shoes = shoesOf(S)
  return <div className="card">
    <CardHead icon="steps" tint="var(--teal)" title={t('Shoes')} sub={shoes.length ? null : t('Add your pair to see how far it has gone. Road shoes usually last 500 to 800 km.')}
      action={<button type="button" className="iconbtn" onClick={() => shoeSheet()} aria-label={t('Add shoes')}><Icon name="plus" /></button>} />
    {shoes.map(s => <button key={s.id} type="button" className="item run-shoe" onClick={() => shoeSheet(s.id)}>
      <span className="grow">
        <span className="tt">{s.name}{s.retired ? ' · ' + t('Retired') : ''}</span>
        <span className="ss">{t('{0} of {1} km', fmtNum(s.km), fmtNum(s.max))}{shoeWear(s) === 'due' ? ' · ' + t('Time for a new pair') : shoeWear(s) === 'soon' ? ' · ' + t('Nearly worn out') : ''}</span>
        <span className={'run-shoe-bar ' + shoeWear(s)}><span style={{ width: `${Math.round(s.share * 100)}%` }} /></span>
      </span>
      <Icon name="chevronRight" className="chev" />
    </button>)}
  </div>
}

function ShoeEdit({ id, close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const had = id ? shoesOf(S).find(s => s.id === id) : null
  const [name, setName] = useState(had?.name || '')
  const [km0, setKm0] = useState(had?.km0 || null)
  const [max, setMax] = useState(had?.max || SHOE_MAX_KM)
  const [retired, setRetired] = useState(!!had?.retired)
  const save = () => {
    if (!name.trim()) return
    update(s => { s.shoes = withShoe(s.shoes, id || 'p' + uid(), { name, km0, max, retired }) })
    close()
  }
  return <>
    <h3>{had ? t('Edit shoes') : t('Add shoes')}</h3>
    <TextField value={name} onChange={e => setName(e.target.value)} placeholder={t('Name, like the model')} maxLength={60} aria-label={t('Name')} />
    <div className="run-grid">
      <label><span className="small muted">{t('Already run in them (km)')}</span><NumberField className="input" nullable value={km0} onChange={setKm0} /></label>
      <label><span className="small muted">{t('Replace at (km)')}</span><NumberField className="input" decimal={false} value={max} onChange={setMax} /></label>
    </div>
    {had && <Check checked={retired} onChange={setRetired} label={t('Retired, no longer in use')} />}
    <div style={{ height: 16 }} />
    <Button variant="primary" icon="check" onClick={save} disabled={!name.trim()}>{t('Save')}</Button>
    {had && <><div style={{ height: 8 }} /><Button variant="ghost" icon="trash" onClick={() => { update(s => { s.shoes = withShoe(s.shoes, id, null) }); close() }}>{t('Remove')}</Button></>}
  </>
}
const shoeSheet = (id = null) => useUI.getState().openSheet(close => <ShoeEdit id={id} close={close} />)

function FileCard({ S }) {
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const fileRef = useRef(null)
  const doImport = async ev => {
    const f = ev.target.files?.[0]; if (!f) return
    ev.target.value = ''
    const parsed = parseRunFile(await f.text())
    if (!parsed.ok) { toast(t('That is not a running log file.')); return }
    let got = null
    update(s => { got = applyRunFile(s, parsed) })
    toast(got && (got.runs || got.shoes || got.profile) ? t('Brought in {0} sessions and {1} pairs of shoes.', got.runs, got.shoes) : t('Everything in that file is already here.'))
  }
  const doExport = async () => {
    const json = JSON.stringify(runFileOf(S), null, 2)
    const name = 'opengym-running-' + todayISO() + '.json'
    if (MOBILE) { try { await shareExport(json, name) } catch { /* share sheet dismissed */ } return }
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
  }
  return <div className="card">
    <CardHead icon="folder" title={t('Running log file')} sub={t('Bring in a log from a coach or another app, or save yours.')} />
    <div className="row run-actions">
      <Button icon="download" onClick={() => fileRef.current?.click()}>{t('Import')}</Button>
      <Button icon="share" onClick={doExport} disabled={!runsOf(S).length}>{t('Export')}</Button>
    </div>
    <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={doImport} />
  </div>
}
