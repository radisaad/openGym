import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useRunTimer } from '../store/useRunTimer.js'
import { t } from '../lib/i18n.js'
import { dateLocale } from '../lib/i18n-core.js'
import { fmtNum, todayISO } from '../lib/format.js'
import { runsOf } from '../lib/running.js'
import { readiness } from '../lib/run-load.js'
import { todayPlan, weekPlan, goalProgress } from '../lib/run-plan.js'
import { presetsOf } from '../lib/run-intervals.js'
import { formOf } from '../lib/daily-form.js'
import { startInterval, presetName } from '../components/IntervalSheet.jsx'
import { runSheet } from '../components/RunSheet.jsx'
import ActivityCard, { useVitals } from '../components/ActivityCard.jsx'
import { Ring } from '../components/RaCharts.jsx'
import { checkinSheet, goalsSheet, menuSheet, connectSheet } from '../components/RaSheets.jsx'
import { LEVEL, reasonText, whyText, DAY_KIND, DAY_ICON } from '../components/ra-copy.js'
import Icon from '../components/Icon.jsx'
import '../radi.css'
import '../running.css'

// Today (RadiGym's home): what to do today and why, how ready the body is, the week's goals and
// plan, and the latest session. Everything here is read from the log (lib/run-load.js, run-plan.js);
// Apple Health's sleep and HRV join in on the iPhone.

const LEVEL_COLOR = { ready: 'var(--ra-time)', easy: 'var(--ra-warn)', rest: 'var(--ra-bad)' }

export default function Today() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const going = useRunTimer(s => s.run)
  const today = todayISO()
  const vitals = useVitals(today)
  const ready = readiness(S, today, { vitals })
  const plan = todayPlan(S, today, ready)
  const week = weekPlan(S, today, ready)
  const goals = goalProgress(S, today)
  const last = runsOf(S)[0] || null
  const checked = !!formOf(S, today) || !!S.runPain?.[today]
  const preset = plan.preset ? presetsOf(S).find(p => p.id === plan.preset) : null
  const dateLine = new Date().toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })

  return <div className="ra-page">
    <div className="ra-head">
      <div><div className="ra-kicker">{dateLine}</div><h1 className="ra-title">{t('Today')}</h1></div>
      <button type="button" className="ra-avatar" onClick={menuSheet} aria-label={t('You')}><Icon name="personCircle" /></button>
    </div>

    <Hero plan={plan} preset={preset} going={going} S={S} nav={nav} />

    <div className="ra-card">
      <div className="ra-card-top"><h2>{t('Readiness')}</h2>
        <button type="button" className="ra-link" onClick={checkinSheet}>{checked ? t('Edit check-in') : t('Morning check-in')}<Icon name="chevronRight" /></button></div>
      <div className="ra-ready">
        <Ring value={ready.score / 100} size={96} stroke={11} color={LEVEL_COLOR[ready.level]} label={t('Readiness {0} of 100', ready.score)}>
          <div><div className="ra-ring-v" style={{ fontSize: 28 }}>{ready.score}</div><div className="ra-ring-l">/100</div></div>
        </Ring>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="ra-ready-l" style={{ color: LEVEL_COLOR[ready.level] }}>{t(LEVEL[ready.level])}</div>
          <ul className="ra-reasons">
            {ready.reasons.slice(0, 3).map((r, i) => { const [text, tone] = reasonText(r); return <li key={i} className={tone}>{text}</li> })}
            {!ready.reasons.length && <li>{checked ? t('Nothing holding you back.') : t('Check in to make this smarter.')}</li>}
          </ul>
        </div>
      </div>
      <div className="ra-trio">
        <div className="ra-stat"><div className="ra-stat-l">{t('Recovery')}</div>
          <div className="ra-stat-v">{ready.recovery?.left ? t('{0} h', ready.recovery.left) : t('Ready')}</div>
          <div className="ra-stat-s">{ready.recovery ? t('{0} h since', ready.recovery.since) : '–'}</div></div>
        <div className="ra-stat"><div className="ra-stat-l">{t('Sleep')}</div>
          <div className="ra-stat-v">{vitals?.sleep ? t('{0} h', Math.round(vitals.sleep.v / 6) / 10) : '–'}</div>
          <div className="ra-stat-s">{vitals ? t('Apple Health') : t('Check-in')}</div></div>
        <div className="ra-stat"><div className="ra-stat-l">HRV</div>
          <div className="ra-stat-v">{vitals?.hrv ? `${vitals.hrv.v}` : '–'}</div>
          <div className="ra-stat-s">{vitals?.hrv?.usual ? t('usual {0}', vitals.hrv.usual) : <button type="button" className="ra-link ra-small" onClick={connectSheet}>{t('Connect')}</button>}</div></div>
      </div>
    </div>

    <div className="ra-card">
      <div className="ra-card-top"><h2>{t('This week')}</h2>
        <button type="button" className="ra-link" onClick={goalsSheet}>{t('Goals')}<Icon name="chevronRight" /></button></div>
      <div className="ra-goals">
        <Goal value={goals.share.runs} color="var(--ra-run)" big={`${goals.runs}`} of={goals.goal.runs} label={t('Runs')} />
        <Goal value={goals.share.km} color="var(--ra-walk)" big={fmtNum(Math.round(goals.km * 10) / 10)} of={goals.goal.km} unit="km" label={t('Distance')} />
        <Goal value={goals.share.min} color="var(--ra-time)" big={`${goals.min}`} of={goals.goal.min} unit="min" label={t('Time')} />
      </div>
      <div className="ra-week" style={{ marginTop: 16 }}>
        {week.map((d, i) => <div key={d.d} className={'ra-day ' + d.kind + (i === 0 ? ' today' : '')} title={t(DAY_KIND[d.kind])}>
          <span className="ra-day-w">{new Date(d.d + 'T12:00:00').toLocaleDateString(dateLocale(), { weekday: 'short' }).slice(0, 2)}</span>
          <span className="ra-day-i"><Icon name={DAY_ICON[d.kind]} /></span>
        </div>)}
      </div>
      <button type="button" className="ra-link" style={{ marginTop: 12 }} onClick={() => nav('/coaching')}>{t('See the plan and ask your coach')}<Icon name="chevronRight" /></button>
    </div>

    {last ? <>
      <div className="ra-card-top" style={{ margin: '4px 4px 8px' }}><h2 style={{ fontSize: 20, margin: 0 }}>{t('Latest')}</h2>
        <button type="button" className="ra-link" onClick={() => nav('/activities')}>{t('All activities')}<Icon name="chevronRight" /></button></div>
      <ActivityCard a={last} />
    </> : <div className="ra-card">
      <h2>{t('Your first run starts here')}</h2>
      <p className="ra-muted" style={{ margin: '8px 0 12px' }}>{t('Log a run, start the interval timer, or bring in your history from Apple Health.')}</p>
      <div className="ra-actions">
        <button type="button" className="ra-hero-btn" style={{ background: 'var(--acc)', color: 'var(--on-acc)' }} onClick={connectSheet}><Icon name="heart" />{t('Apple Health')}</button>
        <button type="button" className="ra-hero-btn" style={{ background: 'var(--surface-2)', color: 'var(--label)' }} onClick={() => runSheet()}><Icon name="plus" />{t('Log a run')}</button>
      </div>
    </div>}
  </div>
}

function Goal({ value, color, big, of, unit, label }) {
  return <div style={{ display: 'grid', justifyItems: 'center' }}>
    <Ring value={value ?? 0} size={78} stroke={9} color={color} label={`${label}: ${big} / ${of}`}>
      <div className="ra-ring-v" style={{ fontSize: 18 }}>{value == null ? '–' : `${Math.min(999, Math.round(value * 100))}%`}</div>
    </Ring>
    <div className="ra-goal-n">{big}<span className="ra-muted" style={{ fontWeight: 500 }}> / {of}{unit ? ' ' + unit : ''}</span></div>
    <div className="ra-goal-l">{label}</div>
  </div>
}

function Hero({ plan, preset, going, S, nav }) {
  if (going) return <div className="ra-hero">
    <div className="ra-kicker">{t('In progress')}</div>
    <div className="ra-hero-title">{presetName(going.preset)}</div>
    <div className="ra-hero-why">{t('Your interval run is going. The voice keeps counting even when you leave this screen.')}</div>
    <button type="button" className="ra-hero-btn" onClick={() => nav('/running/timer')}><Icon name="play" />{t('Back to your run')}</button>
  </div>
  if (plan.kind === 'run' && preset) {
    const runMin = Math.round(preset.blocks.reduce((n, b) => n + b.times * b.steps.filter(s => s.k === 'run').reduce((m, s) => m + s.sec, 0), 0) / 60)
    return <div className="ra-hero">
      <div className="ra-kicker">{t("Today's run")}</div>
      <div className="ra-hero-title">{presetName(preset)}</div>
      <div className="ra-hero-meta">{t('{0} min · {1} min running · voice-guided', plan.min, runMin)}</div>
      <div className="ra-hero-why">{whyText(plan)}</div>
      <button type="button" className="ra-hero-btn" onClick={() => startInterval(preset, S)}><Icon name="play" />{t('Start')}</button>
    </div>
  }
  const cls = plan.kind === 'walk' ? 'walk' : plan.kind === 'done' ? 'done' : 'rest'
  const title = plan.kind === 'walk' ? t('Easy walk, {0} min', plan.min) : plan.kind === 'done' ? t('Done for today') : t('Rest day')
  return <div className={'ra-hero ' + cls}>
    <div className="ra-kicker">{t('Today')}</div>
    <div className="ra-hero-title">{title}</div>
    <div className="ra-hero-why">{whyText(plan)}</div>
    <div className="ra-hero-row">
      {plan.kind === 'walk' && <button type="button" className="ra-hero-btn" onClick={() => runSheet({ sport: 'walk' })}><Icon name="steps" />{t('Log a walk')}</button>}
      {plan.kind === 'rest' && <button type="button" className="ra-hero-btn" onClick={checkinSheet}><Icon name="heart" />{t('Morning check-in')}</button>}
      {plan.kind === 'done' && <button type="button" className="ra-hero-btn" onClick={() => nav('/activities')}><Icon name="list" />{t('See your run')}</button>}
    </div>
  </div>
}

