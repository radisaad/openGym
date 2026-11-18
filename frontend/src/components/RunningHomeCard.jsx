import { useNavigate } from 'react-router-dom'
import { t, tn } from '../lib/i18n.js'
import { fmtNum, todayISO } from '../lib/format.js'
import { runWeeks, fmtTime } from '../lib/running.js'
import { runSheet } from './RunSheet.jsx'
import CardHead from './CardHead.jsx'
import Icon from './Icon.jsx'

// Running on Home (v1.4.6): this week's distance and time, one tap into Running, one into logging
// a run. On unless the profile switched it off (S.runHome === false).
export default function RunningHomeCard({ S }) {
  const nav = useNavigate()
  if (S.runHome === false) return null
  const week = runWeeks(S, 1, todayISO())[0]
  const sub = week.n
    ? [fmtTime(week.sec), tn('{0} session', '{0} sessions', week.n)].join(' · ')
    : t('No runs or walks yet since the week began.')
  return <div className="card tap-host run-home">
    <CardHead icon="figureRun" tint="var(--orange)" eyebrow={t('Running this week')} title={t('{0} km', fmtNum(week.km))} sub={sub}
      open={{ onClick: () => nav('/running') }}
      action={<button type="button" className="iconbtn" onClick={() => runSheet()} aria-label={t('Log a run')}><Icon name="plus" /></button>} />
  </div>
}
