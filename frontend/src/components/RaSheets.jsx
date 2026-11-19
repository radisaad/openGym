import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { nav } from '../lib/nav.js'
import { MOBILE } from '../lib/mobile.js'
import { formOf, withForm } from '../lib/daily-form.js'
import { withMorningPain, watchedPain } from '../lib/run-load.js'
import { goalsOf } from '../lib/run-plan.js'
import { readRunProfile } from '../lib/run-import.js'
import { readHealthExport } from '../lib/health-export.js'
import { mergeImportedActivities } from '../lib/activities.js'
import { loadHealth, enableRead } from '../lib/health-sync.js'
import { PAIN_LABEL } from './RunSheet.jsx'
import Icon from './Icon.jsx'
import { Button, Slider, Stepper } from './ui.jsx'
import '../radi.css'

// The running side's sheets: the morning check-in, the weekly goals, the profile menu, and
// Apple Health & Strava (connect, and bring in a whole export).

const SCALE = {
  sleep: ['Awful', 'Poor', 'OK', 'Good', 'Great'],
  energy: ['Empty', 'Low', 'OK', 'Good', 'Full'],
  sore: ['None', 'A bit', 'Some', 'Sore', 'Very'],
  stress: ['None', 'A bit', 'Some', 'High', 'Very'],
}
const Q = { sleep: 'How did you sleep?', energy: 'Energy', sore: 'Muscle soreness', stress: 'Stress' }

function Checkin({ close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const today = todayISO()
  const had = formOf(S, today) || {}
  const watch = readRunProfile(S.runProfile).watch
  const painNow = watchedPain(S, today)
  const [f, setF] = useState({ sleep: had.sleep ?? null, energy: had.energy ?? null, sore: had.sore ?? null, stress: had.stress ?? null })
  const [pain, setPain] = useState(() => Object.fromEntries(watch.map(a => [a, painNow[a]?.from === 'checkin' ? painNow[a].v : 0])))
  const save = () => {
    update(s => {
      s.dayForm = withForm(s.dayForm, today, f)
      if (watch.length) s.runPain = withMorningPain(s.runPain, today, pain)
    })
    close()
  }
  return <>
    <h3>{t('Morning check-in')}</h3>
    <div className="ra-small ra-muted" style={{ marginBottom: 10 }}>{t('Thirty seconds. It decides how hard today should be.')}</div>
    {Object.keys(SCALE).map(k => <div key={k}>
      <div className="ra-small" style={{ fontWeight: 600 }}>{t(Q[k])}</div>
      <div className="ra-scale" role="radiogroup" aria-label={t(Q[k])}>
        {SCALE[k].map((w, i) => <button key={w} type="button" role="radio" aria-checked={f[k] === i + 1} className={f[k] === i + 1 ? 'on' : ''}
          onClick={() => setF(x => ({ ...x, [k]: x[k] === i + 1 ? null : i + 1 }))}><b>{i + 1}</b>{t(w)}</button>)}
      </div>
    </div>)}
    {watch.map(a => <div key={a} className="run-pain">
      <span className="ra-small" style={{ fontWeight: 600 }}>{t(PAIN_LABEL[a])}</span>
      <Slider min={0} max={10} value={pain[a]} onChange={v => setPain(p => ({ ...p, [a]: v }))} ariaLabel={t(PAIN_LABEL[a])} ariaValueText={`${pain[a]}/10`} />
      <span className={'ra-small ra-num' + (pain[a] >= 4 ? ' run-bad' : '')} style={{ textAlign: 'end' }}>{pain[a]}/10</span>
    </div>)}
    <div style={{ height: 14 }} />
    <Button variant="primary" icon="check" onClick={save}>{t('Save')}</Button>
  </>
}
export const checkinSheet = () => useUI.getState().openSheet(close => <Checkin close={close} />)

function Goals({ close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [g, setG] = useState(goalsOf(S))
  const row = (k, label, unit, step, max) => <div style={{ marginBottom: 12 }}>
    <div className="ra-small" style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
    <Stepper value={g[k]} min={0} max={max} step={step} decimal={false} unit={unit} onChange={v => setG(x => ({ ...x, [k]: v }))} ariaLabel={label} />
  </div>
  return <>
    <h3>{t('Weekly goals')}</h3>
    <div className="ra-small ra-muted" style={{ marginBottom: 12 }}>{t('Start small and keep it: two runs a week beats one big week.')}</div>
    {row('runs', t('Runs a week'), '', 1, 14)}
    {row('km', t('Distance a week'), 'km', 1, 300)}
    {row('min', t('Time a week'), 'min', 10, 1800)}
    <Button variant="primary" icon="check" onClick={() => { update(s => { s.runGoals = g }); close() }}>{t('Save')}</Button>
  </>
}
export const goalsSheet = () => useUI.getState().openSheet(close => <Goals close={close} />)

function Menu({ close }) {
  const go = to => { close(); nav(to) }
  const row = (icon, tint, title, sub, onClick) => <button type="button" className="item" onClick={onClick}>
    <span className="lrow-i" style={{ background: tint }} aria-hidden="true"><Icon name={icon} /></span>
    <span className="grow"><span className="tt">{title}</span>{sub && <span className="ss ra-small ra-muted">{sub}</span>}</span>
    <Icon name="chevronRight" className="chev" />
  </button>
  return <div className="ra-menu">
    <h3>{t('You')}</h3>
    {row('heart', 'var(--red)', t('Apple Health & Strava'), t('Sync your runs, and bring in your history'), () => { close(); connectSheet() })}
    {row('target', 'var(--ra-time)', t('Weekly goals'), null, () => { close(); goalsSheet() })}
    {row('steps', 'var(--teal)', t('Shoes, interval workouts and log file'), null, () => go('/running'))}
    {row('dumbbell', 'var(--grey)', t('Gym'), t('Routines, exercises and gym stats'), () => go('/gym'))}
    {row('gear', 'var(--grey)', t('Settings'), null, () => go('/settings'))}
  </div>
}
export const menuSheet = () => useUI.getState().openSheet(close => <Menu close={close} />)

function Connect({ close }) {
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const fileRef = useRef(null)
  const [health, setHealth] = useState(null)
  const [busy, setBusy] = useState(null)
  useEffect(() => { if (MOBILE) loadHealth().then(setHealth).catch(() => {}) }, [])
  const turnOn = async kind => {
    const r = await enableRead(kind, () => useStore.getState().S)
    if (r.ok) { setHealth(r.health); toast(t('Connected')) } else toast(t('Apple Health did not allow it. Check the Health app’s settings for RadiGym.'))
  }
  const pick = async ev => {
    const file = ev.target.files?.[0]; if (!file) return
    ev.target.value = ''
    setBusy(0)
    try {
      const list = await readHealthExport(file, n => setBusy(n))
      let added = 0
      update(s => { added = mergeImportedActivities(s, list) })
      toast(t('Brought in {0} runs and walks from Apple Health.', added))
      close()
    } catch (e) {
      toast(e?.message === 'zip64' || e?.message === 'unsupported' ? t('This export is too big to open here. Unzip it and pick export.xml instead.')
        : e?.message === 'noExport' ? t('No Apple Health export in that file.') : t('Could not read that file.'))
    } finally { setBusy(null) }
  }
  return <div>
    <h3>{t('Apple Health & Strava')}</h3>
    <h4 style={{ margin: '14px 0 4px' }}><Icon name="heart" /> {t('Apple Health')}</h4>
    {MOBILE ? <>
      <div className="ra-small ra-muted">{t('New runs and walks from Apple Health, your Apple Watch and apps like Strava come in by themselves.')}</div>
      <div className="ra-actions" style={{ marginTop: 10 }}>
        <Button icon={health?.readSport ? 'check' : 'plus'} disabled={!!health?.readSport} onClick={() => turnOn('sport')}>{health?.readSport ? t('Runs and walks: on') : t('Read runs and walks')}</Button>
        <Button icon={health?.readVitals ? 'check' : 'plus'} disabled={!!health?.readVitals} onClick={() => turnOn('vitals')}>{health?.readVitals ? t('Sleep and heart: on') : t('Read sleep, HRV and heart rate')}</Button>
      </div>
    </> : <div className="ra-small ra-muted">{t('Live sync runs in the iPhone app. Here you can bring in your whole history from an export.')}</div>}
    <div className="ra-small" style={{ fontWeight: 600, marginTop: 14 }}>{t('Bring in your whole history')}</div>
    <ol className="ra-steps">
      <li>{t('On the iPhone, open the Health app and tap your picture.')}</li>
      <li>{t('Tap Export All Health Data, then send the file to this device (AirDrop works).')}</li>
      <li>{t('Pick export.zip here. Big exports take a minute.')}</li>
    </ol>
    {busy != null && <><div className="ra-small ra-muted">{t('Reading… {0} found so far', busy)}</div><div className="ra-progress"><span style={{ width: '60%' }} /></div></>}
    <Button variant="primary" icon="download" disabled={busy != null} onClick={() => fileRef.current?.click()}>{t('Import Apple Health export')}</Button>
    <input ref={fileRef} type="file" accept=".zip,.xml,application/zip,text/xml,application/xml" hidden onChange={pick} />

    <h4 style={{ margin: '20px 0 4px' }}><Icon name="bolt" /> Strava</h4>
    <div className="ra-small ra-muted">{t('Strava runs reach RadiGym through Apple Health. In the Strava app: You, then Settings, then Applications, Services, and Devices, then Health: turn it on.')}</div>
    <div className="ra-small ra-muted" style={{ marginTop: 8 }}>{t('Sending your RadiGym runs to Strava comes with your RadiGym server.')}</div>
    <div style={{ height: 8 }} />
  </div>
}
export const connectSheet = () => useUI.getState().openSheet(close => <Connect close={close} />)
