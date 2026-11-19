// The running log (v1.4.6): runs and walks, read off the activities (lib/activities.js, the fields
// in lib/run-fields.js), and the numbers a runner looks at. Pure, from the profile.
//
// The one rule everything here keeps: a run/walk session has two paces, never one. The average
// over the whole outing, walking included, is the outing's pace; the running pace is the running
// parts alone. A run that came without parts gives a running pace only when it was run the whole
// way (`cont`) or is a kind of run that is (a race, a test, a tempo run). Otherwise its pace is the
// outing's and is shown as that. A 7:03 run/walk average is not a 7:03 runner.
import { activitiesOf } from './activities.js'
import { RUN_SPORTS } from './run-fields.js'
import { fmtClock } from './calculators.js'
import { weekStartOf, isoOf } from './format.js'

// Run types whose whole time is running even with no parts logged.
const ALL_RUN_TYPES = new Set(['tempo', 'race', 'test'])
const round2 = v => Math.round(v * 100) / 100
const DAY = 86400000

/** Every run and walk, newest first, as the activities list has them. */
export const runsOf = S => activitiesOf(S).filter(a => RUN_SPORTS.has(a.sport))

/** The seconds a session took: its own seconds, else its minutes. */
export const secOf = a => (a?.sec > 0 ? a.sec : (a?.min > 0 ? a.min * 60 : 0))

/**
 * What one session adds up to:
 *   { km, sec, runKm, runSec, walkKm, walkSec, pace, runPace, runShare, mixed, parts }
 * `pace` is seconds a km over the whole outing (null without a distance); `runPace` the running
 * parts alone, null when they cannot be told apart. `runShare` is the share of the time spent
 * running (0 to 1), null when unknown. `mixed` when the session holds both running and walking.
 */
export function sessionStats(a) {
  const sec = secOf(a)
  const segs = Array.isArray(a?.segs) ? a.segs : []
  let runKm = 0, runSec = 0, walkKm = 0, walkSec = 0, runKnown = true
  if (segs.length) {
    for (const g of segs) {
      if (g.k === 'run') { runSec += g.sec; runKm += g.km || 0; if (!(g.km > 0)) runKnown = false }
      else { walkSec += g.sec; walkKm += g.km || 0 }
    }
  } else if (a?.sport === 'walk') {
    walkSec = sec; walkKm = a.km || 0
  } else if (a?.cont === true || ALL_RUN_TYPES.has(a?.type)) {
    runSec = sec; runKm = a?.km || 0
  } else {
    runKnown = false
  }
  const km = a?.km > 0 ? a.km : runKm + walkKm
  const hasSegs = segs.length > 0 || a?.sport === 'walk' || runSec > 0
  return {
    km: round2(km), sec,
    runKm: round2(runKm), runSec, walkKm: round2(walkKm), walkSec,
    pace: km > 0 && sec > 0 ? sec / km : null,
    runPace: runKnown && runKm > 0 && runSec > 0 ? runSec / runKm : null,
    runShare: hasSegs && sec > 0 ? Math.min(1, runSec / sec) : null,
    mixed: runSec > 0 && walkSec > 0,
    parts: segs.length,
  }
}

/** "5:05" for seconds a km (rounded to the second), "–" for nothing. */
export function fmtPace(secPerKm) {
  if (!(secPerKm > 0) || !Number.isFinite(secPerKm)) return '–'
  const s = Math.round(secPerKm)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "h:mm:ss" or "m:ss". */
export const fmtTime = sec => fmtClock(Math.max(0, Number(sec) || 0))

/** Seconds from "1:02:03", "50:38", "10" (minutes) or "10,5"; null when it does not read. */
export function parseTime(text) {
  const s = String(text ?? '').trim()
  if (!s) return null
  if (/^\d+([.,]\d+)?$/.test(s)) return Math.round(Number(s.replace(',', '.')) * 60) || null
  const parts = s.split(':')
  if (parts.length > 3 || parts.some(p => !/^\d+$/.test(p))) return null
  if (parts.slice(1).some(p => Number(p) >= 60)) return null
  return parts.reduce((n, p) => n * 60 + Number(p), 0) || null
}

/** The Monday (or Sunday, by the profile) a day's week starts on, as ISO. */
export function weekOf(iso, start = 1) {
  const d = new Date(iso + 'T12:00:00')
  const back = (d.getDay() - start + 7) % 7
  return isoOf(new Date(d.getTime() - back * DAY))
}

/**
 * The last `n` weeks, oldest first, ending with the week of `today`:
 *   [{ week, km, sec, runKm, runSec, walkKm, n, runs, walks }]
 * `runs` and `walks` count sessions by sport; `n` is all of them. `walkKm` is the walking known
 * to be walking (walks and walking parts); a run without parts counts as running in `km - walkKm`.
 */
export function runWeeks(S, n = 8, today = isoOf(new Date())) {
  const start = weekStartOf(S)
  const last = weekOf(today, start)
  const weeks = []
  for (let i = n - 1; i >= 0; i--) {
    const w = isoOf(new Date(new Date(last + 'T12:00:00').getTime() - i * 7 * DAY))
    weeks.push({ week: w, km: 0, sec: 0, runKm: 0, runSec: 0, walkKm: 0, n: 0, runs: 0, walks: 0 })
  }
  const at = new Map(weeks.map(w => [w.week, w]))
  for (const a of runsOf(S)) {
    const w = at.get(weekOf(a.d, start))
    if (!w) continue
    const st = sessionStats(a)
    w.km += st.km; w.sec += st.sec; w.runKm += st.runKm; w.runSec += st.runSec; w.walkKm += st.walkKm; w.n++
    if (a.sport === 'walk') w.walks++; else w.runs++
  }
  for (const w of weeks) { w.km = round2(w.km); w.runKm = round2(w.runKm); w.walkKm = round2(w.walkKm) }
  return weeks
}

/**
 * The records worth a line: the longest session, the longest run (runs only), and the fastest
 * running pace held over at least `minKm` (1 km by default, so a 400 m sprint is not a pace).
 * Each { id, d, value } or null.
 */
export function runBests(S, minKm = 1) {
  let longest = null, longestRun = null, fastest = null
  for (const a of runsOf(S)) {
    const st = sessionStats(a)
    if (st.km > 0 && (!longest || st.km > longest.value)) longest = { id: a.id, d: a.d, value: st.km }
    if (a.sport === 'run' && st.km > 0 && (!longestRun || st.km > longestRun.value)) longestRun = { id: a.id, d: a.d, value: st.km }
    if (st.runPace && st.runKm >= minKm && (!fastest || st.runPace < fastest.value)) fastest = { id: a.id, d: a.d, value: st.runPace, km: st.runKm }
  }
  return { longest, longestRun, fastest }
}

/**
 * The step from the longest session of the weeks before to the latest one, as a ratio (1.56 is
 * 56% further), when the latest one is the longest yet. What a runner coming back should look at
 * before the next long day. Null with too little to compare.
 */
export function longestJump(S) {
  const runs = runsOf(S).filter(a => sessionStats(a).km > 0)
  if (runs.length < 2) return null
  const [latest, ...before] = runs
  const prev = Math.max(...before.map(a => sessionStats(a).km))
  const km = sessionStats(latest).km
  return km > prev && prev > 0 ? { id: latest.id, km, prev, ratio: km / prev } : null
}

/** The latest pain answer for `area` and the day it was given, or null. */
export function lastPain(S, area) {
  for (const a of runsOf(S)) if (a.pain && area in a.pain) return { d: a.d, id: a.id, v: a.pain[area] }
  return null
}
