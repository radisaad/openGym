// The running screens' words for what lib/run-load.js, run-plan.js and run-predict.js return as codes.
import { t } from '../lib/i18n.js'
import { PAIN_LABEL } from './RunSheet.jsx'

export const LEVEL = { ready: 'Ready to run', easy: 'Go easy', rest: 'Rest today' }
export const LOAD = { starting: 'Building a base', easing: 'Easing off', productive: 'Productive', high: 'High', spike: 'Spike' }
export const LOAD_HINT = {
  starting: 'Not enough weeks yet to compare. Keep logging and this fills in.',
  easing: 'Less than your usual weeks. Fine for recovery, and room to build.',
  productive: 'In the sweet spot: enough to improve, not so much it breaks you.',
  high: 'More than your usual weeks. Keep the next sessions easy.',
  spike: 'A big jump on your usual weeks. This is when injuries happen: back off.',
}
const area = a => t(PAIN_LABEL[a] || a)
const hours = m => Math.round((m / 60) * 10) / 10

/** A readiness reason in words, and whether it pulls down ('bad') or up ('good'). */
export function reasonText(r) {
  switch (r.k) {
    case 'pain': return [t('{0} at {1}/10. No running until it settles.', area(r.area), r.v), 'bad']
    case 'painLow': return [t('{0} at {1}/10. Keep it easy and watch it.', area(r.area), r.v), 'bad']
    case 'feelGood': return [t('You feel good this morning.'), 'good']
    case 'feelRough': return [t('A rough morning. Go gently today.'), 'bad']
    case 'feelOk': return [t('An ordinary morning.'), '']
    case 'hrvLow': return [t('HRV {0} ms, under your usual {1}.', r.v, r.usual), 'bad']
    case 'hrvHigh': return [t('HRV {0} ms, above your usual {1}.', r.v, r.usual), 'good']
    case 'rhrHigh': return [t('Resting heart rate {0}, above your usual {1}.', r.v, r.usual), 'bad']
    case 'sleepShort': return [t('Only {0} h of sleep.', hours(r.v)), 'bad']
    case 'sleepGood': return [t('Good sleep: {0} h.', hours(r.v)), 'good']
    case 'recovering': return [t('Legs still recovering: about {0} h to go.', r.v), 'bad']
    case 'loadSpike': return [t('Your load jumped to {0}× your usual week.', r.v), 'bad']
    case 'loadHigh': return [t('Your load is {0}× your usual week.', r.v), 'bad']
    default: return [r.k, '']
  }
}

/** Why today's plan is what it is, in one sentence. */
export function whyText(plan) {
  const k = plan.why?.[0]
  switch (k) {
    case 'ranToday': return t('You have run today. Eat, drink, and let it sink in.')
    case 'pain': return t('A sore area needs rest before the next run. Walk only if it does not hurt.')
    case 'lowReadiness': return t('Your body says not today. Rest, or walk very gently.')
    case 'recovering': return t('Your last run needs about {0} more hours. An easy walk keeps you moving meanwhile.', plan.hoursLeft)
    case 'goalDone': return t('Weekly run goal reached. An easy walk is plenty today.')
    case 'easyDay': return t('Readiness is so-so: the gentlest intervals today.')
    case 'stepUp': return t('Three easy finishes in a row: time to step up.')
    case 'steady': return t('Same workout again: consistency builds the base.')
    default: return ''
  }
}

export const DAY_KIND = { run: 'Run', long: 'Long run', walk: 'Easy walk', rest: 'Rest', done: 'Done' }
export const DAY_ICON = { run: 'figureRun', long: 'figureRun', walk: 'steps', rest: 'moon', done: 'check' }
export const CONF = { good: 'Good guess', rough: 'Rough guess', low: 'Long shot', notYet: 'Not yet' }
