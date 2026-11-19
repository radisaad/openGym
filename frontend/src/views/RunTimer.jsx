import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useRunTimer } from '../store/useRunTimer.js'
import { t, tn } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { runAt, cuesOf, resultSegs } from '../lib/run-intervals.js'
import { fmtTime } from '../lib/running.js'
import { nativeCues, scheduleCues, cancelCues, sayDue, keepAwake } from '../lib/run-coach.js'
import { runSheet } from '../components/RunSheet.jsx'
import { presetName } from '../components/IntervalSheet.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import '../running.css'

// The interval timer on screen (lib/run-intervals.js): what to do now in big letters, how long is
// left, what comes next. The voice does the rest (lib/run-coach.js): the iPhone app says every cue
// itself with the screen locked; a browser says them from here while the page is on screen.

export const STEP_LABEL = { warm: 'Warm-up', walk: 'Walk', run: 'Run', cool: 'Cool-down' }

export default function RunTimer() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const { run, pause, resume, skip, clear } = useRunTimer()
  const [now, setNow] = useState(Date.now())
  const [native, setNative] = useState(null)
  const said = useRef(Date.now())
  const at = run ? runAt(run, now) : null

  useEffect(() => { nativeCues().then(setNative) }, [])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    keepAwake(true)
    return () => { clearInterval(id); keepAwake(false) }
  }, [])

  // The cues from now on, worked out again whenever the clock changes shape (start, pause, skip).
  const cues = useMemo(() => (run ? cuesOf(run, Date.now(), t, tn) : []), [run])
  useEffect(() => {
    if (native === null || !run) return
    if (native) { if (run.pausedAt == null) scheduleCues(cues, S); else cancelCues() }
    else if (run.pausedAt != null) cancelCues()
  }, [cues, native]) // eslint-disable-line react-hooks/exhaustive-deps
  // A browser speaks for itself, while on screen.
  useEffect(() => {
    if (native !== false || !run || run.pausedAt != null) { said.current = now; return }
    sayDue(cues, said.current, now, S)
    said.current = now
  }, [now]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!run) {
    return <div className="rt rt-empty"><p>{t('No interval run going.')}</p>
      <Button onClick={() => nav('/running', { replace: true })}>{t('Running')}</Button></div>
  }

  const stop = () => {
    cancelCues()
    finish()
  }
  const finish = () => {
    const segs = resultSegs(run, Date.now())
    clear()
    nav('/running', { replace: true })
    if (segs.some(s => s.sec >= 30)) runSheet({ draft: { d: todayISO(), segs, type: 'runwalk', preset: run.preset.id, at: run.start } })
  }
  const discard = () => { cancelCues(); clear(); nav('/running', { replace: true }) }
  const paused = run.pausedAt != null
  const kind = at.done ? 'done' : at.step.k

  return <div className={'rt rt-' + kind}>
    <div className="rt-top">
      <span className="rt-name">{presetName(run.preset)}</span>
      <span className="rt-total">{fmtTime(at.elapsed)} / {fmtTime(at.total)}</span>
    </div>
    <div className="rt-bar"><span style={{ width: `${Math.round(at.elapsed / Math.max(1, at.total) * 100)}%` }} /></div>

    {at.done ? <div className="rt-main">
      <div className="rt-kind">{t('Done')}</div>
      <div className="rt-sub">{t('Great work. Log how it felt while it is fresh.')}</div>
    </div> : <div className="rt-main" aria-live="polite">
      <div className="rt-kind">{t(STEP_LABEL[at.step.k])}</div>
      <div className="rt-clock">{fmtTime(Math.ceil(at.left))}</div>
      {at.step.rep > 0 && <div className="rt-sub">{t('{0} of {1}', at.step.rep, at.step.of)}</div>}
      <div className="rt-next">{at.next ? t('Next: {0}, {1}', t(STEP_LABEL[at.next.k]), fmtTime(at.next.sec)) : t('Last step')}</div>
      {paused && <div className="rt-paused">{t('Paused')}</div>}
    </div>}

    <div className="rt-ctl">
      {at.done ? <>
        <Button variant="primary" icon="check" onClick={finish}>{t('Log this run')}</Button>
        <Button variant="ghost" icon="trash" onClick={discard}>{t('Discard')}</Button>
      </> : <>
        <button type="button" className="rt-btn" onClick={stop} aria-label={t('Stop and log')}><Icon name="stop" /></button>
        <button type="button" className="rt-btn big" onClick={paused ? resume : pause} aria-label={paused ? t('Resume') : t('Pause')}>
          <Icon name={paused ? 'play' : 'pause'} /></button>
        <button type="button" className="rt-btn" onClick={skip} aria-label={t('Skip to the next step')}><Icon name="skipForward" /></button>
      </>}
    </div>
    {native === false && !at.done && <div className="rt-hint small">{t('Keep this screen on to hear the cues. The iPhone app says them with the screen locked.')}</div>}
  </div>
}
