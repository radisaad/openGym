import { useNavigate } from 'react-router-dom'
import { t, tn } from '../lib/i18n.js'
import { fmtNum, todayISO } from '../lib/format.js'
import { runWeeks, fmtTime, runsOf, sessionStats, fmtPace } from '../lib/running.js'
import { fmtDate } from '../lib/format.js'
import { presetsOf } from '../lib/run-intervals.js'
import { useRunTimer } from '../store/useRunTimer.js'
import { presetName, startInterval } from './IntervalSheet.jsx'
import { Button } from './ui.jsx'
import '../running.css'
import { runSheet } from './RunSheet.jsx'
import CardHead from './CardHead.jsx'
import Icon from './Icon.jsx'

// Running on Home (v1.4.6): this week's distance and time, one tap into Running, one into logging
// a run. On unless the profile switched it off (S.runHome === false).
export default function RunningHomeCard({ S }) {
  const nav = useNavigate()
  const going = useRunTimer(st => st.run)
  if (S.runHome === false) return null
  const week = runWeeks(S, 1, todayISO())[0]
  const last = runsOf(S)[0] || null
  const lastSt = last ? sessionStats(last) : null
  const first = presetsOf(S)[0]
  const sub = week.n
    ? [fmtTime(week.sec), tn('{0} session', '{0} sessions', week.n)].join(' · ')
    : t('No runs or walks yet since the week began.')
  return <div className="card tap-host run-home">
    <CardHead icon="figureRun" tint="var(--orange)" eyebrow={t('Running this week')} title={t('{0} km', fmtNum(week.km))} sub={sub}
      open={{ onClick: () => nav('/running') }}
      action={<button type="button" className="iconbtn" onClick={() => runSheet()} aria-label={t('Log a run')}><Icon name="plus" /></button>} />
    {last && <div className="small muted run-home-last">{t('Last: {0}', [fmtDate(last.d), lastSt.km > 0 ? t('{0} km', fmtNum(lastSt.km)) : null, fmtTime(lastSt.sec),
      lastSt.runPace && lastSt.mixed ? t('{0} /km running', fmtPace(lastSt.runPace)) : lastSt.pace ? t('{0} /km', fmtPace(lastSt.pace)) : null].filter(Boolean).join(' · '))}</div>}
    <div className="run-home-go">
      {going ? <Button variant="primary" icon="play" onClick={() => nav('/running/timer')}>{t('Back to your run')}</Button>
        : <Button variant="primary" icon="play" onClick={() => startInterval(first, S)}>{presetName(first)}</Button>}
    </div>
  </div>
}
