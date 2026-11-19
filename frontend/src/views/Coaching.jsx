import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { dateLocale } from '../lib/i18n-core.js'
import { todayISO } from '../lib/format.js'
import { copyText } from '../lib/clipboard.js'
import { readiness } from '../lib/run-load.js'
import { todayPlan, weekPlan } from '../lib/run-plan.js'
import { presetsOf } from '../lib/run-intervals.js'
import { coachBrief } from '../lib/run-coach-brief.js'
import { presetName, startInterval } from '../components/IntervalSheet.jsx'
import { useVitals } from '../components/ActivityCard.jsx'
import { checkinSheet } from '../components/RaSheets.jsx'
import { LEVEL, whyText, DAY_KIND, DAY_ICON } from '../components/ra-copy.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import '../radi.css'

// The coach: today's call and the week ahead, worked out from the log by the rules your coaching
// notes set (lib/run-plan.js), and Claude for everything a rule cannot answer. "Talk to Claude"
// hands Claude the whole picture (lib/run-coach-brief.js) with your question; the conversation
// moves inside RadiGym once your server runs the coach.

const ASK = [
  'How should I run this week?',
  'Is my hip ready for a harder run?',
  'Plan my next four weeks towards 5 km without walking.',
  'Look at my last run: what went well, what should change?',
  'What should I eat and drink around my runs?',
]

export default function Coaching() {
  const S = useStore(s => s.S)
  const toast = useUI(s => s.toast)
  const today = todayISO()
  const vitals = useVitals(today)
  const ready = readiness(S, today, { vitals })
  const plan = todayPlan(S, today, ready)
  const week = weekPlan(S, today, ready)
  const presets = presetsOf(S)
  const [q, setQ] = useState('')

  const ask = async () => {
    const question = q.trim() || t(ASK[0])
    const text = `${coachBrief(S, today, { vitals })}\n\n---\nMy question: ${question}`
    const ok = await copyText(text)
    toast(ok ? t('Copied. Paste it into Claude to start.') : t('Could not copy. Use Copy my coach brief instead.'))
    window.open('https://claude.ai/new', '_blank', 'noopener')
  }
  const copyBrief = async () => { toast((await copyText(coachBrief(S, today, { vitals }))) ? t('Coach brief copied.') : t('Could not copy.')) }

  return <div className="ra-page">
    <div className="ra-head"><div><div className="ra-kicker">{t(LEVEL[ready.level])} · {ready.score}/100</div><h1 className="ra-title">{t('Coach')}</h1></div>
      <button type="button" className="ra-avatar" onClick={checkinSheet} aria-label={t('Morning check-in')}><Icon name="heart" /></button></div>

    <div className="ra-card">
      <div className="ra-kicker">{t('Today')}</div>
      <h2 style={{ margin: '6px 0' }}>{plan.kind === 'run' ? presetName(presets.find(p => p.id === plan.preset)) : t(DAY_KIND[plan.kind])}</h2>
      <p className="ra-muted" style={{ margin: 0, lineHeight: 1.4 }}>{whyText(plan)}</p>
      {plan.kind === 'run' && <div style={{ marginTop: 12 }}><Button variant="primary" icon="play" onClick={() => startInterval(presets.find(p => p.id === plan.preset), S)}>{t('Start')}</Button></div>}
    </div>

    <div className="ra-card">
      <h2>{t('The week ahead')}</h2>
      <div style={{ marginTop: 8 }}>{week.map(d => <div key={d.d} className="ra-plan-row">
        <span className={'ra-day ' + d.kind} style={{ background: 'none', padding: 0 }}><span className="ra-day-i"><Icon name={DAY_ICON[d.kind]} /></span></span>
        <span className="grow"><b>{new Date(d.d + 'T12:00:00').toLocaleDateString(dateLocale(), { weekday: 'long' })}</b>
          <span className="ra-small ra-muted" style={{ display: 'block' }}>{d.kind === 'run' ? presetName(presets.find(p => p.id === d.preset)) : d.min ? t('{0}, about {1} min', t(DAY_KIND[d.kind]), d.min) : t(DAY_KIND[d.kind])}</span></span>
      </div>)}</div>
    </div>

    <div className="ra-card">
      <div className="ra-card-top"><h2>{t('Talk to Claude')}</h2><Icon name="sparkles" /></div>
      <div className="ra-small ra-muted">{t('Claude gets your whole picture: your notes and hip history, every recent session with both paces, your load, readiness and this plan.')}</div>
      <div className="ra-ask">{ASK.map(s => <button key={s} type="button" className={q === t(s) ? 'on' : ''} onClick={() => setQ(t(s))}>{t(s)}</button>)}</div>
      <textarea className="input" rows={3} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Or ask anything about your running…')} />
      <div className="ra-actions" style={{ marginTop: 10 }}>
        <Button variant="primary" icon="sparkles" onClick={ask}>{t('Ask Claude')}</Button>
        <Button icon="copy" onClick={copyBrief}>{t('Copy my coach brief')}</Button>
      </div>
      <div className="ra-small ra-muted" style={{ marginTop: 10 }}>{t('For now this opens Claude with your brief copied. Once your RadiGym server runs, the conversation happens right here.')}</div>
    </div>

    <div className="ra-card">
      <h2>{t('How your coach plans')}</h2>
      <ul className="ra-rules">
        <li>{t('Consistency first: the weekly goal is a number of runs, distance follows.')}</li>
        <li>{t('At least 44 hours between runs. Between them, rest or an easy walk.')}</li>
        <li>{t('A watched area at 4/10 or more means no running that day.')}</li>
        <li>{t('Intervals step up only after three finishes that felt 6/10 or easier, with no pain.')}</li>
        <li>{t('A run/walk average is never treated as your running pace.')}</li>
      </ul>
    </div>
  </div>
}
