import { useEffect, useState } from 'react'
import { t } from '../lib/i18n.js'
import { fmtDate, fmtNum } from '../lib/format.js'
import { nav } from '../lib/nav.js'
import { MOBILE } from '../lib/mobile.js'
import { loadHealth, onHealthChange } from '../lib/health-sync.js'
import { vitalsSummary } from '../lib/vitals.js'
import { sessionStats, fmtPace, fmtTime } from '../lib/running.js'
import { TYPE_LABEL, effortWord } from './RunSheet.jsx'
import Icon from './Icon.jsx'
import '../radi.css'

const SRC = { ah: 'Apple Health', hc: 'Health Connect', import: 'Imported' }

/** A session's name: its own title, its kind, or Run / Walk. */
export const actName = a => a.title || (a.sport === 'walk' ? t('Walk') : a.type ? t(TYPE_LABEL[a.type]) : t('Run'))

/** The run/walk ribbon: each part as wide as its time. */
export function Ribbon({ a }) {
  const parts = a.segs?.length ? a.segs : [{ k: a.sport === 'walk' ? 'walk' : 'run', sec: a.sec || a.min * 60 }]
  return <div className="ra-ribbon" aria-hidden="true">{parts.map((g, i) => <span key={i} className={g.k} style={{ flex: g.sec }} />)}</div>
}

/** One run or walk in the feed: name, day, three big numbers, the ribbon, tags. Opens its page. */
export default function ActivityCard({ a }) {
  const st = sessionStats(a)
  const pace = st.mixed ? st.runPace : st.pace
  const sore = a.pain && Object.values(a.pain).some(v => v >= 4)
  return <button type="button" className="ra-card ra-act" onClick={() => nav('/activities/' + a.id)}>
    <div className="ra-act-top">
      <span className={'ra-act-i ' + (a.sport === 'walk' ? 'walk' : '')}><Icon name={a.sport === 'walk' ? 'steps' : 'figureRun'} /></span>
      <span className="grow"><span className="ra-act-t" style={{ display: 'block' }}>{actName(a)}</span>
        <span className="ra-act-d">{fmtDate(a.d, true)}{a.at ? ' · ' + new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span></span>
      <Icon name="chevronRight" className="chev" />
    </div>
    <div className="ra-act-stats">
      <div><div className="l">{t('Distance')}</div><div className="v">{st.km > 0 ? fmtNum(st.km) : '–'}<span className="u">km</span></div></div>
      <div><div className="l">{t('Time')}</div><div className="v">{fmtTime(st.sec)}</div></div>
      <div><div className="l">{st.mixed ? t('Running pace') : t('Pace')}</div><div className="v">{fmtPace(pace)}<span className="u">/km</span></div></div>
    </div>
    <Ribbon a={a} />
    <div className="ra-tags">
      {st.mixed && <span className="ra-tag run">{t('{0}% running', Math.round(st.runShare * 100))}</span>}
      {a.rpe && <span className="ra-tag">{effortWord(a.rpe)} · {a.rpe}/10</span>}
      {sore && <span className="ra-tag bad"><Icon name="warning" />{t('Pain noted')}</span>}
      {SRC[a.src] && <span className="ra-tag"><Icon name="heart" />{t(SRC[a.src])}</span>}
    </div>
  </button>
}

/** Apple Health's sleep, HRV and resting heart rate summary on the iPhone, or null. */
export function useVitals(today) {
  const [h, setH] = useState(null)
  useEffect(() => {
    if (!MOBILE) return
    let gone = false
    loadHealth().then(f => { if (!gone) setH(f) }).catch(() => {})
    const off = onHealthChange(f => { if (!gone) setH(f) })
    return () => { gone = true; off() }
  }, [])
  return h?.readVitals && h.vitals ? vitalsSummary(h.vitals, today) : null
}
