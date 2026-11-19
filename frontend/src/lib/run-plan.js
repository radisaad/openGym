// Goals, today's session and the week ahead (v1.4.6, RadiGym). The coach's rules, written down once:
//
//   - consistency first: the weekly goal is a number of runs (2 to start), distance and time follow
//   - a run wants 44 hours or more after the last one; between them, rest or an easy walk
//   - readiness 'rest' (a watched area at 4/10 or more, or a rough day) means no run today
//   - readiness 'easy' picks the gentlest interval workout
//   - an interval workout moves up only after three finished sessions at it that felt 6/10 or easier
//   - one longer outing a week at most, never more than 10% past the longest of the last four weeks
//
// Pure: the reasons come back as codes for the screen to put in words.
import { runsOf, runWeeks, sessionStats, secOf } from './running.js'
import { hoursSinceRun } from './run-load.js'
import { BUILT_IN } from './run-intervals.js'
import { isoOf } from './format.js'

const DAY = 86400000
export const GOAL_DEFAULT = { runs: 2, km: 10, min: 90 }
const GOAL_MAX = { runs: 14, km: 300, min: 1800 }
export const RUN_GAP_H = 44
// The ladder of the built-in interval workouts, gentlest first.
export const LADDER = ['b-1-2', 'b-2-2', 'b-3-1']

const add = (iso, n) => isoOf(new Date(new Date(iso + 'T12:00:00').getTime() + n * DAY))

/** The weekly goals: { runs, km, min }, each 0 for "no goal". */
export function goalsOf(S) {
  const g = S?.runGoals && typeof S.runGoals === 'object' ? S.runGoals : null
  if (!g) return { ...GOAL_DEFAULT }
  const out = {}
  for (const k of Object.keys(GOAL_DEFAULT)) {
    const v = Math.round(Number(g[k]))
    out[k] = Number.isFinite(v) && v >= 0 ? Math.min(GOAL_MAX[k], v) : GOAL_DEFAULT[k]
  }
  return out
}

/** This week against the goals: { runs, km, min, goal, share: { runs, km, min } } (share 0 to 1+). */
export function goalProgress(S, today) {
  const w = runWeeks(S, 1, today)[0]
  const goal = goalsOf(S)
  const have = { runs: w.runs, km: w.km, min: Math.round(w.sec / 60) }
  const share = {}
  for (const k of Object.keys(goal)) share[k] = goal[k] > 0 ? have[k] / goal[k] : null
  return { ...have, goal, share }
}

// The interval workout the runner is on: the last built-in one used, else the coach's 2/2.
function ladderStep(S) {
  const recent = runsOf(S).filter(a => a.sport === 'run').slice(0, 6)
  const fromTitle = a => BUILT_IN.find(p => a.title && a.title === p.name)?.id
  for (const a of recent) { const id = a.preset || fromTitle(a); if (id && LADDER.includes(id)) return { id, recent } }
  return { id: 'b-2-2', recent }
}

/** The interval workout for the next run: steps up after three easy-enough finishes, gentlest on an 'easy' day. */
export function nextPreset(S, level = 'ready') {
  if (level === 'easy') return LADDER[0]
  const { id, recent } = ladderStep(S)
  const at = recent.filter(a => a.preset === id)
  const ready = at.length >= 3 && at.slice(0, 3).every(a => a.rpe && a.rpe <= 6 && !Object.values(a.pain || {}).some(v => v >= 2))
  const i = LADDER.indexOf(id)
  return ready && i < LADDER.length - 1 ? LADDER[i + 1] : id
}

/**
 * What today asks for: { kind: 'rest' | 'walk' | 'run' | 'done', preset?, min?, why: [codes] }.
 * `ready` is lib/run-load.js readiness for today.
 */
export function todayPlan(S, today, ready, now = Date.now()) {
  const why = []
  const ranToday = runsOf(S).some(a => a.d === today && a.sport === 'run')
  if (ranToday) return { kind: 'done', why: ['ranToday'] }
  if (ready?.level === 'rest') {
    why.push(ready.reasons.some(r => r.k === 'pain') ? 'pain' : 'lowReadiness')
    return { kind: 'rest', min: 0, why }
  }
  const since = hoursSinceRun(S, now)
  if (since != null && since < RUN_GAP_H) return { kind: 'walk', min: 25, why: ['recovering'], hoursLeft: RUN_GAP_H - since }
  const prog = goalProgress(S, today)
  if (prog.goal.runs > 0 && prog.runs >= prog.goal.runs) return { kind: 'walk', min: 30, why: ['goalDone'] }
  const preset = nextPreset(S, ready?.level)
  if (ready?.level === 'easy') why.push('easyDay')
  else why.push(preset !== ladderStep(S).id ? 'stepUp' : 'steady')
  const p = BUILT_IN.find(x => x.id === preset)
  const min = Math.round((p.warm + p.cool + p.blocks.reduce((n, b) => n + b.times * b.steps.reduce((m, s) => m + s.sec, 0), 0)) / 60)
  return { kind: 'run', preset, min, why }
}

/**
 * The next 7 days, today first: [{ d, kind: 'run' | 'long' | 'walk' | 'rest', preset?, min? }].
 * The week's runs left are spread at least two days apart; the last of them can be the longer
 * outing when the runner has run for three weeks in a row.
 */
export function weekPlan(S, today, ready, now = Date.now()) {
  const days = Array.from({ length: 7 }, (_, i) => ({ d: add(today, i), kind: 'rest' }))
  const t = todayPlan(S, today, ready, now)
  const goal = goalsOf(S).runs || GOAL_DEFAULT.runs
  // Runs to place over the 7 days: the weekly goal, spread out.
  let next = t.kind === 'run' ? 0 : t.kind === 'walk' && t.hoursLeft ? Math.ceil(t.hoursLeft / 24) : t.kind === 'rest' ? 2 : 2
  const steady = runWeeks(S, 4, today).slice(0, 3).every(w => w.runs > 0)
  const longest = Math.max(0, ...runsOf(S).filter(a => a.d > add(today, -28)).map(a => secOf(a) / 60))
  const placed = []
  for (let i = next; i < 7 && placed.length < goal; i += 3) placed.push(i)
  const preset = nextPreset(S, ready?.level)
  placed.forEach((i, n) => {
    const isLong = steady && n === placed.length - 1 && placed.length > 1
    days[i] = isLong
      ? { d: days[i].d, kind: 'long', min: Math.max(30, Math.round(Math.min(longest * 1.1, longest + 10))) }
      : { d: days[i].d, kind: 'run', preset }
  })
  if (t.kind === 'walk' || t.kind === 'rest' || t.kind === 'done') days[0] = { d: today, kind: t.kind === 'done' ? 'done' : t.kind, min: t.min }
  // A walk the day after a run keeps the legs moving.
  for (let i = 1; i < 7; i++) if (days[i].kind === 'rest' && ['run', 'long'].includes(days[i - 1].kind)) days[i] = { d: days[i].d, kind: 'walk', min: 25 }
  return days
}

/** The longest session of the last four weeks, in minutes (for the long-run cap shown with the plan). */
export const longestRecentMin = (S, today) => Math.round(Math.max(0, ...runsOf(S).filter(a => a.d > add(today, -28)).map(a => sessionStats(a).sec / 60)))
