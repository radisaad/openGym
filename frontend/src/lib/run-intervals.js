// The run/walk interval timer (v1.4.6): a workout of walking and running steps, worked out ahead,
// so every step and every spoken cue has its time before the run starts. The phone's voice can
// then say all of it with the screen off (the iPhone gets the whole list, lib/run-coach.js), and
// the page only has to look at the clock when it is on screen.
//
//   preset = { id, name, warm: sec, blocks: [{ times, steps: [{ k: 'run' | 'walk', sec }] }], cool: sec }
//
// A block repeats its steps `times` times ("walk 2:00, run 2:00" × 6); there can be several (a
// pyramid, or 2:00/2:00 then 1:00/1:00). The warm-up and cool-down are walks of their own.
//
// The clock is timestamps, never a counter: run = { preset, start, pausedAt, paused } with `paused`
// the milliseconds spent paused before now. A locked phone, a reload or a killed app all come back
// to the right step. Pure: the copy goes through `tr` (t) and `trn` (tn), passed in.

export const STEP_KINDS = ['warm', 'walk', 'run', 'cool']
export const STEP_MIN = 5
export const STEP_MAX = 3 * 3600
export const TIMES_MAX = 50
export const WARN_SEC = 10
const NAME_MAX = 40

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const secOf = v => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= STEP_MIN && n <= STEP_MAX ? n : null }

// The ready-made ones. The first is the coach's starting point: 2 minutes of walking and 2 of easy
// running, six times, between a 5-minute warm-up and cool-down.
export const BUILT_IN = [
  { id: 'b-2-2', name: 'Walk 2, run 2, six times', warm: 300, cool: 300, blocks: [{ times: 6, steps: [{ k: 'walk', sec: 120 }, { k: 'run', sec: 120 }] }] },
  { id: 'b-1-2', name: 'Run 1, walk 2, eight times', warm: 300, cool: 300, blocks: [{ times: 8, steps: [{ k: 'run', sec: 60 }, { k: 'walk', sec: 120 }] }] },
  { id: 'b-3-1', name: 'Run 3, walk 1, five times', warm: 300, cool: 300, blocks: [{ times: 5, steps: [{ k: 'run', sec: 180 }, { k: 'walk', sec: 60 }] }] },
]

/** A preset read back, or null: a name, at least one step to do. */
export function readPreset(p) {
  if (!isMap(p) || !/^[\w-]{1,40}$/.test(String(p.id || ''))) return null
  const blocks = (Array.isArray(p.blocks) ? p.blocks : []).slice(0, 10).map(b => {
    const steps = (Array.isArray(b?.steps) ? b.steps : []).slice(0, 10)
      .map(s => (['run', 'walk'].includes(s?.k) && secOf(s.sec) ? { k: s.k, sec: secOf(s.sec) } : null)).filter(Boolean)
    const times = Math.min(TIMES_MAX, Math.max(1, Math.round(Number(b?.times)) || 1))
    return steps.length ? { times, steps } : null
  }).filter(Boolean)
  const warm = secOf(p.warm) || 0, cool = secOf(p.cool) || 0
  if (!blocks.length && !warm && !cool) return null
  const name = typeof p.name === 'string' ? p.name.trim().slice(0, NAME_MAX) : ''
  return { id: p.id, name, warm, blocks, cool }
}

/** The profile's own presets (S.runIntervals), then the built-in ones. */
export function presetsOf(S) {
  const own = (Array.isArray(S?.runIntervals) ? S.runIntervals : []).map(readPreset).filter(Boolean)
  return [...own, ...BUILT_IN]
}

/**
 * Every step in order: [{ k, sec, at, block, rep, of }], `at` the second it starts from the
 * beginning; `rep` / `of` count the repeats of its block (1-based), 0 for a warm-up or cool-down.
 */
export function stepsOf(preset) {
  const out = []
  let at = 0
  const push = (k, sec, block, rep, of) => { out.push({ k, sec, at, block, rep, of }); at += sec }
  if (preset?.warm) push('warm', preset.warm, -1, 0, 0)
  ;(preset?.blocks || []).forEach((b, bi) => {
    for (let r = 1; r <= b.times; r++) for (const s of b.steps) push(s.k, s.sec, bi, r, b.times)
  })
  if (preset?.cool) push('cool', preset.cool, -1, 0, 0)
  return out
}

/** How long the whole workout is, in seconds, and how much of it is running. */
export function presetTotals(preset) {
  const steps = stepsOf(preset)
  return { sec: steps.reduce((n, s) => n + s.sec, 0), runSec: steps.filter(s => s.k === 'run').reduce((n, s) => n + s.sec, 0), steps: steps.length }
}

/* ---------------------------------------------------------------- the clock ---- */

/** A new run of `preset`, started at `now`. */
export const startRun = (preset, now = Date.now()) => ({ preset, start: now, pausedAt: null, paused: 0 })

/** Seconds of workout done at `now` (paused time left out). */
export function elapsedOf(run, now = Date.now()) {
  if (!run) return 0
  const end = run.pausedAt ?? now
  return Math.max(0, (end - run.start - (run.paused || 0)) / 1000)
}

export const pauseRun = (run, now = Date.now()) => (run && run.pausedAt == null ? { ...run, pausedAt: now } : run)
export const resumeRun = (run, now = Date.now()) => (run && run.pausedAt != null ? { ...run, paused: (run.paused || 0) + (now - run.pausedAt), pausedAt: null } : run)

/**
 * Where the run is at `now`: { i, step, next, left, done, elapsed, total }. `left` is the seconds
 * left in the step; `done` once every step is over (then `i` is the step count).
 */
export function runAt(run, now = Date.now()) {
  const steps = stepsOf(run?.preset)
  const total = steps.reduce((n, s) => n + s.sec, 0)
  const elapsed = Math.min(total, elapsedOf(run, now))
  if (!steps.length || elapsed >= total) return { i: steps.length, step: null, next: null, left: 0, done: true, elapsed: total, total, steps }
  let i = steps.findIndex(s => elapsed < s.at + s.sec)
  if (i < 0) i = steps.length - 1
  return { i, step: steps[i], next: steps[i + 1] || null, left: steps[i].at + steps[i].sec - elapsed, done: false, elapsed, total, steps }
}

/** The run moved to the start of the next step (a skip): its clock jumps the rest of this one. */
export function skipStep(run, now = Date.now()) {
  const at = runAt(run, now)
  if (at.done) return run
  return { ...run, start: run.start - at.left * 1000 }
}

/**
 * The run's parts as a run/walk session's (lib/run-fields.js): what was done up to `now`, a warm-up
 * and a cool-down as walking, side-by-side walks joined. For the run logger when the timer ends.
 */
export function resultSegs(run, now = Date.now()) {
  const steps = stepsOf(run?.preset)
  const done = elapsedOf(run, now)
  const out = []
  for (const s of steps) {
    const sec = Math.round(Math.min(s.sec, Math.max(0, done - s.at)))
    if (sec < 1) break
    const k = s.k === 'run' ? 'run' : 'walk'
    const last = out[out.length - 1]
    if (last && last.k === k) last.sec += sec; else out.push({ k, sec })
  }
  return out
}

/* ---------------------------------------------------------------- the voice ---- */

/** "2 minutes", "90 seconds", "1 minute 30" said aloud. */
export function spokenDuration(sec, tr, trn) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60)
  if (!m) return trn('{0} second', '{0} seconds', s)
  if (!s) return trn('{0} minute', '{0} minutes', m)
  if (sec < 120) return tr('{0} seconds', sec)
  return tr('{0} minutes {1}', m, s)
}

const KIND_WORD = { warm: 'Warm-up walk', walk: 'Walk', run: 'Run', cool: 'Cool-down walk' }

/** What is said as a step starts: "Run, 2 minutes. 3 of 6." */
export function startLine(step, tr, trn, last = false) {
  const what = tr('{0}, {1}.', tr(KIND_WORD[step.k]), spokenDuration(step.sec, tr, trn))
  const rep = step.rep && step.k === 'run' && step.of > 1 ? ' ' + (step.rep === step.of ? tr('Last one.') : tr('{0} of {1}.', step.rep, step.of)) : ''
  return what + rep + (last ? ' ' + tr('Last step.') : '')
}

/**
 * Every cue of the run from `now` on, with its clock time: [{ at: ms, text }]. A step's start, a
 * warning WARN_SEC before the next one (on steps long enough), halfway, and the end. The first
 * step's line is said at once when the run starts.
 */
export function cuesOf(run, now = Date.now(), tr = s => s, trn = (a, b, n) => (n === 1 ? a : b)) {
  if (!run || run.pausedAt != null) return []
  const steps = stepsOf(run.preset)
  const total = steps.reduce((n, s) => n + s.sec, 0)
  const base = run.start + (run.paused || 0)
  const at = sec => base + sec * 1000
  const out = []
  steps.forEach((s, i) => {
    out.push({ at: at(s.at), text: startLine(s, tr, trn, i === steps.length - 1 && steps.length > 1) })
    const next = steps[i + 1]
    if (next && s.sec >= WARN_SEC * 3 && next.k !== s.k && !(next.k === 'cool' && s.k === 'walk')) {
      out.push({ at: at(s.at + s.sec - WARN_SEC), text: tr('{0} in 10 seconds.', tr(KIND_WORD[next.k])) })
    }
  })
  if (total >= 600) out.push({ at: at(total / 2), text: tr('Halfway. Nice and easy.') })
  out.push({ at: at(total), text: tr('Done. Great work. Log how it felt.') })
  const from = now - 1500
  return out.filter(c => c.at >= from).sort((a, b) => a.at - b.at)
}
