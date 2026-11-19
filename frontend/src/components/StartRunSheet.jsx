import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { presetsOf, presetTotals } from '../lib/run-intervals.js'
import { fmtTime } from '../lib/running.js'
import { presetName, startInterval, intervalSheet } from './IntervalSheet.jsx'
import { runSheet } from './RunSheet.jsx'
import Icon from './Icon.jsx'
import '../running.css'

// What the big button in the tab bar opens when nothing is running (RadiGym is running-first):
// an interval run in one tap, a run or a walk to log, and the gym workout the button used to start.

function StartRun({ close, onGym }) {
  const S = useStore(s => s.S)
  const presets = presetsOf(S).slice(0, 4)
  const row = (key, icon, tint, title, sub, onClick) => <button key={key} type="button" className="item start-run-row" onClick={onClick}>
    <span className="lrow-i" aria-hidden="true" style={{ background: tint }}><Icon name={icon} /></span>
    <span className="grow"><span className="tt">{title}</span>{sub && <span className="ss">{sub}</span>}</span>
    <Icon name="chevronRight" className="chev" />
  </button>
  return <>
    <h3>{t('Start')}</h3>
    <div className="small muted run-lbl">{t('Interval timer')}</div>
    {presets.map(p => row(p.id, 'play', 'var(--orange)', presetName(p),
      t('{0} in all, {1} of it running', fmtTime(presetTotals(p).sec), fmtTime(presetTotals(p).runSec)),
      () => { close(); startInterval(p, S) }))}
    {row('new', 'plus', 'var(--grey)', t('New intervals'), null, () => { close(); intervalSheet() })}
    <div className="small muted run-lbl">{t('Log')}</div>
    {row('run', 'figureRun', 'var(--blue)', t('Log a run'), null, () => { close(); runSheet({ sport: 'run' }) })}
    {row('walk', 'steps', 'var(--teal)', t('Log a walk'), null, () => { close(); runSheet({ sport: 'walk' }) })}
    <div className="small muted run-lbl">{t('Gym')}</div>
    {row('gym', 'dumbbell', 'var(--green)', t('Start a gym workout'), null, () => { close(); onGym() })}
  </>
}

/** The start sheet; `onGym` starts a gym workout the way the button always did. */
export const startRunSheet = onGym => useUI.getState().openSheet(close => <StartRun close={close} onGym={onGym} />)
