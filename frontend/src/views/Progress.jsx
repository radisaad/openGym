import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { dateLocale } from '../lib/i18n-core.js'
import { fmtDate, fmtNum, todayISO, isoOf } from '../lib/format.js'
import { runsOf, runWeeks, sessionStats, runBests, fmtPace, fmtTime } from '../lib/running.js'
import { loadStatus, loadHistory } from '../lib/run-load.js'
import { predictions } from '../lib/run-predict.js'
import { WeekBars, LineSeries } from '../components/RaCharts.jsx'
import { LOAD, LOAD_HINT, CONF } from '../components/ra-copy.js'
import { Segmented } from '../components/ui.jsx'
import '../radi.css'

// Progress: how the running has grown. Volume by week (running and walking), the running pace over
// time (running parts only, never a run/walk average), the training load against the usual weeks,
// the days run, the records, and what the best recent running says about race times.

const RANGES = { 8: '8 wk', 12: '12 wk', 26: '6 mo' }
const shortDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })

export default function Progress() {
  const S = useStore(s => s.S)
  const [n, setN] = useState(12)
  const today = todayISO()
  const weeks = runWeeks(S, n, today)
  const from = weeks[0].week
  const runs = runsOf(S).filter(a => a.d >= from).reverse()
  const total = weeks.reduce((a, w) => ({ km: a.km + w.km, sec: a.sec + w.sec, n: a.n + w.n }), { km: 0, sec: 0, n: 0 })
  const span = Math.max(1, (new Date(today) - new Date(from)) / 86400000)
  const pacePts = runs.map(a => ({ a, st: sessionStats(a) })).filter(x => x.st.runPace && x.st.runKm >= 0.8)
    .map(x => ({ x: (new Date(x.a.d) - new Date(from)) / 86400000 / span, y: x.st.runPace }))
  const loads = loadHistory(S, today, Math.min(n, 12))
  const status = loadStatus(S, today)
  const best = runBests(S)
  const pred = predictions(S, today)

  return <div className="ra-page">
    <div className="ra-head"><div><div className="ra-kicker">{t('Last {0} weeks', n)}</div><h1 className="ra-title">{t('Progress')}</h1></div></div>
    <Segmented value={String(n)} onChange={v => setN(Number(v))} options={Object.entries(RANGES).map(([v, l]) => ({ value: v, label: t(l) }))} />
    <div style={{ height: 14 }} />

    <div className="ra-card">
      <div className="ra-trio" style={{ marginTop: 0 }}>
        <div className="ra-stat"><div className="ra-stat-l">{t('Distance')}</div><div className="ra-stat-v">{fmtNum(Math.round(total.km))}<span className="ra-small ra-muted"> km</span></div></div>
        <div className="ra-stat"><div className="ra-stat-l">{t('Time')}</div><div className="ra-stat-v">{Math.round(total.sec / 3600)}<span className="ra-small ra-muted"> h</span></div></div>
        <div className="ra-stat"><div className="ra-stat-l">{t('Sessions')}</div><div className="ra-stat-v">{total.n}</div></div>
      </div>
    </div>

    <div className="ra-card">
      <h2>{t('Weekly distance')}</h2>
      <div style={{ marginTop: 10 }}><WeekBars label={t('Weekly distance')} weeks={weeks.map(w => ({ label: shortDate(w.week), run: Math.max(0, w.km - w.walkKm), walk: w.walkKm }))} /></div>
      <div className="ra-legend"><span><i style={{ background: 'var(--ra-run)' }} />{t('Running')}</span><span><i style={{ background: 'var(--ra-walk)' }} />{t('Walking')}</span></div>
    </div>

    <div className="ra-card">
      <h2>{t('Running pace')}</h2>
      <div className="ra-small ra-muted" style={{ marginTop: 4 }}>{t('Running parts only, so walking breaks never drag it down. Higher is faster.')}</div>
      {pacePts.length >= 2 ? <div style={{ marginTop: 10 }}><LineSeries invert label={t('Running pace')} fmt={v => fmtPace(v) + ' /km'}
        series={[{ key: 'pace', color: 'var(--ra-run)', points: pacePts }]} /></div>
        : <p className="ra-muted ra-small">{t('Log the running parts of two runs, with their distance, to see the trend.')}</p>}
    </div>

    <div className="ra-card">
      <div className="ra-card-top"><h2>{t('Training load')}</h2><span className={'ra-badge ' + status.status}>{t(LOAD[status.status])}</span></div>
      <div className="ra-small ra-muted">{t(LOAD_HINT[status.status])}</div>
      <div style={{ marginTop: 10 }}><LineSeries label={t('Training load')} fmt={v => String(Math.round(v))} series={[
        { key: 'chronic', color: 'var(--ra-load)', points: loads.map((l, i) => ({ x: i / Math.max(1, loads.length - 1), y: l.chronic })), dots: false, dash: '5 4' },
        { key: 'acute', color: 'var(--ra-run)', points: loads.map((l, i) => ({ x: i / Math.max(1, loads.length - 1), y: l.acute })) },
      ]} /></div>
      <div className="ra-legend"><span><i style={{ background: 'var(--ra-run)' }} />{t('This week')}</span><span><i style={{ background: 'var(--ra-load)' }} />{t('Your usual week')}</span></div>
    </div>

    <div className="ra-card">
      <h2>{t('Days on your feet')}</h2>
      <Heat S={S} today={today} weeks={Math.min(n, 12)} />
      <div className="ra-legend"><span><i style={{ background: 'var(--ra-run)' }} />{t('Run')}</span><span><i style={{ background: 'var(--ra-walk)' }} />{t('Walk')}</span></div>
    </div>

    <div className="ra-card">
      <h2>{t('Race predictions')}</h2>
      {pred.base ? <>
        <div className="ra-races" style={{ marginTop: 12 }}>{pred.races.map(r => <div key={r.id} className="ra-race">
          <div className="n">{r.id === 'half' ? t('Half') : r.id.toUpperCase()}</div>
          <div className="v">{r.sec ? fmtTime(r.sec) : '–'}</div>
          <div className="c">{t(CONF[r.conf])}</div></div>)}</div>
        <div className="ra-small ra-muted" style={{ marginTop: 10 }}>{t('From {0} km of running in {1} on {2}. Run longer without walking and these get sharper.', fmtNum(pred.base.km), fmtTime(pred.base.sec), fmtDate(pred.base.d))}</div>
      </> : <p className="ra-muted ra-small">{t('Run 1 km or more without walking and log its distance: predictions start from there.')}</p>}
    </div>

    <div className="ra-card">
      <h2>{t('Records')}</h2>
      <div className="ra-big">
        <div><div className="l">{t('Longest outing')}</div><div className="v">{best.longest ? fmtNum(best.longest.value) : '–'}<small>km</small></div><div className="ra-small ra-muted">{best.longest ? fmtDate(best.longest.d) : ''}</div></div>
        <div><div className="l">{t('Fastest running pace')}</div><div className="v">{best.fastest ? fmtPace(best.fastest.value) : '–'}<small>/km</small></div><div className="ra-small ra-muted">{best.fastest ? t('over {0} km', fmtNum(best.fastest.km)) : t('1 km or more')}</div></div>
      </div>
    </div>
  </div>
}

function Heat({ S, today, weeks }) {
  const byDay = {}
  for (const a of runsOf(S)) {
    const k = a.sport === 'walk' ? 'w' : sessionStats(a).sec >= 2400 ? 'r2' : 'r1'
    if (byDay[a.d] !== 'r2') byDay[a.d] = byDay[a.d] && byDay[a.d] !== 'w' && k === 'w' ? byDay[a.d] : k
  }
  const end = new Date(today + 'T12:00:00')
  const back = (end.getDay() + 6) % 7
  const cells = []
  const first = new Date(end.getTime() - ((weeks - 1) * 7 + back) * 86400000)
  for (let i = 0; i < weeks * 7; i++) {
    const d = isoOf(new Date(first.getTime() + i * 86400000))
    cells.push(<span key={d} className={d > today ? 'f' : byDay[d] || ''} title={d} />)
  }
  return <div className="ra-heat" style={{ marginTop: 12 }} role="img" aria-label={t('Days on your feet')}>{cells}</div>
}
