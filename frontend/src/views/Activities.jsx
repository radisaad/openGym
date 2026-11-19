import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { weekStartOf } from '../lib/format.js'
import { runsOf, sessionStats, fmtPace, fmtTime, weekOf } from '../lib/running.js'
import { sessionLoad, recoveryHours, rpeOf } from '../lib/run-load.js'
import { withActivity } from '../lib/activities.js'
import { shoesOf } from '../lib/shoes.js'
import ActivityCard, { actName, Ribbon } from '../components/ActivityCard.jsx'
import { runSheet, PAIN_LABEL, effortWord } from '../components/RunSheet.jsx'
import { connectSheet } from '../components/RaSheets.jsx'
import { Segmented } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import '../radi.css'

// Activities: every run and walk, newest first, a week at a time with the week's totals (Strava's
// feed, for one). Each opens its own page (ActivityDetail below).

export default function Activities() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [kind, setKind] = useState('all')
  const start = weekStartOf(S)
  const list = runsOf(S).filter(a => kind === 'all' || a.sport === kind)
  const weeks = []
  for (const a of list) {
    const w = weekOf(a.d, start)
    let g = weeks[weeks.length - 1]
    if (!g || g.w !== w) { g = { w, items: [], km: 0, sec: 0 }; weeks.push(g) }
    const st = sessionStats(a)
    g.items.push(a); g.km += st.km; g.sec += st.sec
  }
  const thisWeek = weekOf(todayISO(), start)
  return <div className="ra-page">
    <div className="ra-head">
      <div><div className="ra-kicker">{tn('{0} session', '{0} sessions', list.length)}</div><h1 className="ra-title">{t('Activities')}</h1></div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="ra-avatar" onClick={connectSheet} aria-label={t('Apple Health & Strava')}><Icon name="heart" /></button>
        <button type="button" className="ra-avatar" onClick={() => runSheet()} aria-label={t('Log a run')}><Icon name="plus" /></button>
      </div>
    </div>
    <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: t('All') }, { value: 'run', label: t('Runs') }, { value: 'walk', label: t('Walks') }]} />
    {!list.length && <div className="ra-card" style={{ marginTop: 14 }}>
      <h2>{t('No activities yet')}</h2>
      <p className="ra-muted">{t('Log a run, use the interval timer, or bring in your history from Apple Health.')}</p>
      <button type="button" className="ra-link" onClick={connectSheet}>{t('Apple Health & Strava')}<Icon name="chevronRight" /></button>
    </div>}
    {weeks.map(g => <section key={g.w}>
      <div className="ra-weekhead"><b>{g.w === thisWeek ? t('This week') : t('Week of {0}', fmtDate(g.w))}</b>
        <span className="ra-muted ra-num">{t('{0} km', fmtNum(Math.round(g.km * 10) / 10))} · {fmtTime(g.sec)}</span></div>
      {g.items.map(a => <ActivityCard key={a.id} a={a} />)}
    </section>)}
    {list.length > 0 && <button type="button" className="ra-link" style={{ margin: '4px 4px 16px' }} onClick={() => nav('/running')}>{t('Shoes, interval workouts and log file')}<Icon name="chevronRight" /></button>}
  </div>
}

/** One run or walk, in full. */
export function ActivityDetail() {
  const nav = useNavigate()
  const { id } = useParams()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const a = runsOf(S).find(x => x.id === id)
  if (!a) return <div className="ra-page"><p className="ra-muted">{t('This activity is gone.')}</p>
    <button type="button" className="ra-link" onClick={() => nav('/activities', { replace: true })}>{t('Activities')}</button></div>
  const st = sessionStats(a)
  const shoe = a.shoe ? shoesOf(S).find(s => s.id === a.shoe) : null
  const remove = () => {
    const kept = a
    update(s => { s.activities = withActivity(s.activities, kept.id, null) })
    nav('/activities', { replace: true })
    toast(t('Activity removed'), { action: t('Undo'), onAction: () => update(s => { s.activities = withActivity(s.activities, kept.id, kept) }) })
  }
  const big = [
    [t('Distance'), st.km > 0 ? fmtNum(st.km) : '–', 'km'],
    [t('Time'), fmtTime(st.sec), ''],
    st.mixed ? [t('Running pace'), fmtPace(st.runPace), '/km'] : [t('Pace'), fmtPace(st.pace), '/km'],
    st.mixed ? [t('Overall pace'), fmtPace(st.pace), '/km'] : [t('Effort'), a.rpe ? `${a.rpe}` : `~${rpeOf(a)}`, '/10'],
    ...(a.elev != null ? [[t('Climb'), `${a.elev}`, 'm']] : []),
    ...(a.cad ? [[t('Cadence'), `${a.cad}`, t('spm')]] : []),
    ...(a.hr ? [[t('Heart rate'), `${a.hr}`, 'bpm']] : []),
    ...(st.mixed ? [[t('Running'), `${Math.round(st.runShare * 100)}`, '%']] : []),
  ]
  return <div className="ra-page">
    <div className="hdr"><button className="iconbtn" data-back="/activities" onClick={() => nav(-1)} aria-label={t('Activities')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1 style={{ margin: 0 }}>{actName(a)}</h1>
        <div className="sub">{fmtDate(a.d, true, true)}{a.at ? ' · ' + new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div></div></div>

    <div className="ra-card">
      <div className="ra-big">{big.map(([l, v, u]) => <div key={l}><div className="l">{l}</div><div className="v">{v}<small>{u}</small></div></div>)}</div>
    </div>

    {a.segs?.length > 0 && <div className="ra-card">
      <h2>{t('Run and walk')}</h2>
      <div style={{ marginTop: 12 }}><Ribbon a={a} /></div>
      <table className="ra-parts">
        <thead><tr><th>{t('Part')}</th><th>{t('Time')}</th><th>km</th><th>{t('Pace')}</th></tr></thead>
        <tbody>{a.segs.map((g, i) => <tr key={i}>
          <td><span className={'ra-dot ' + g.k} />{g.k === 'run' ? t('Run') : t('Walk')}</td>
          <td>{fmtTime(g.sec)}</td><td>{g.km ? fmtNum(g.km) : '–'}</td><td>{g.km ? fmtPace(g.sec / g.km) : '–'}</td>
        </tr>)}</tbody>
      </table>
    </div>}

    <div className="ra-card">
      <h2>{t('How it went')}</h2>
      <div className="ra-trio">
        <div className="ra-stat"><div className="ra-stat-l">{t('Effort')}</div><div className="ra-stat-v">{a.rpe ? `${a.rpe}/10` : '–'}</div><div className="ra-stat-s">{a.rpe ? effortWord(a.rpe) : t('Not rated')}</div></div>
        <div className="ra-stat"><div className="ra-stat-l">{t('Load')}</div><div className="ra-stat-v">{sessionLoad(a)}</div><div className="ra-stat-s">{t('min × effort')}</div></div>
        <div className="ra-stat"><div className="ra-stat-l">{t('Recovery')}</div><div className="ra-stat-v">{t('{0} h', recoveryHours(a))}</div><div className="ra-stat-s">{t('before the next run')}</div></div>
      </div>
      {a.pain && <div className="ra-tags" style={{ marginTop: 12 }}>
        {Object.entries(a.pain).map(([k, v]) => <span key={k} className={'ra-tag' + (v >= 4 ? ' bad' : '')}>{t(PAIN_LABEL[k])} {v}/10</span>)}
      </div>}
      {shoe && <div className="ra-small ra-muted" style={{ marginTop: 10 }}><Icon name="steps" /> {shoe.name}</div>}
      {a.note && <p style={{ margin: '12px 0 0', lineHeight: 1.45 }}>{a.note}</p>}
    </div>

    <div className="ra-actions" style={{ marginBottom: 16 }}>
      <button type="button" className="ra-hero-btn" style={{ background: 'var(--acc)', color: 'var(--on-acc)' }} onClick={() => runSheet({ id: a.id })}><Icon name="pencil" />{t('Edit')}</button>
      <button type="button" className="ra-hero-btn" style={{ background: 'var(--surface-2)', color: 'var(--red)' }} onClick={remove}><Icon name="trash" />{t('Remove')}</button>
    </div>
  </div>
}
