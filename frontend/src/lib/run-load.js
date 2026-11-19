// Training load, recovery and readiness for the running log (v1.4.6, RadiGym). Pure, from the
// profile and whatever the phone's health store adds; nothing here pretends to measure what it
// cannot. Without a strap there is no HRV of our own: when Apple Health has HRV, resting heart
// rate or sleep (lib/vitals.js), they count; when it has not, the morning check-in and the log do.
//
//   load       session RPE (Foster): minutes × how hard it felt (1 to 10). A session without an
//              answer is given the usual effort of its kind (DEFAULT_RPE).
//   status     the last 7 days against the 4 weeks before (acute:chronic). Under 0.8 the load is
//              easing off, 0.8 to 1.3 is the productive band, above 1.3 is a jump and above 1.5 a
//              spike. With under three sessions in four weeks it is "starting": no ratio means much.
//   recovery   hours until the legs are ready for the next run, from the load of the last session
//              (8 to 72 h), longer when a watched area hurt.
//   readiness  0 to 100 and one of 'ready', 'easy', 'rest', with the reasons that moved it. A
//              watched area (S.runProfile.watch, the right hip) at 4/10 or more is always 'rest'.
import { runsOf, secOf } from './running.js'
import { isoOf } from './format.js'
import { formOf, formScore } from './daily-form.js'
import { readRunProfile } from './run-import.js'

const DAY = 86400000
export const DEFAULT_RPE = { walk: 2, easy: 4, runwalk: 4, long: 5, tempo: 7, intervals: 7, race: 9, test: 9 }
export const RECOVERY_MIN_H = 8
export const RECOVERY_MAX_H = 72
export const PAIN_STOP = 4

const back = (iso, n) => isoOf(new Date(new Date(iso + 'T12:00:00').getTime() - n * DAY))

/** How hard a session felt, 1 to 10: its own answer, else the usual for its kind. */
export const rpeOf = a => (a?.rpe > 0 ? a.rpe : a?.sport === 'walk' ? DEFAULT_RPE.walk : DEFAULT_RPE[a?.type] || DEFAULT_RPE.easy)

/** A session's load: minutes × effort. */
export const sessionLoad = a => Math.round((secOf(a) / 60) * rpeOf(a))

/** The load of each day from `days` days before `today` up to it: { iso: load }. */
export function dayLoads(S, today, days = 56) {
  const from = back(today, days - 1)
  const out = {}
  for (const a of runsOf(S)) {
    if (a.d < from || a.d > today) continue
    out[a.d] = (out[a.d] || 0) + sessionLoad(a)
  }
  return out
}

const sumDays = (loads, today, from, to) => {
  let n = 0
  for (let i = from; i < to; i++) n += loads[back(today, i)] || 0
  return n
}

/**
 * Where the training stands on `today`: { acute, chronic, ratio, status, sessions28 }. `acute` is the
 * last 7 days' load, `chronic` the weekly average of the 28 days.
 */
export function loadStatus(S, today) {
  const loads = dayLoads(S, today, 28)
  const acute = sumDays(loads, today, 0, 7)
  const chronic = Math.round(sumDays(loads, today, 0, 28) / 4)
  const from = back(today, 27)
  const sessions28 = runsOf(S).filter(a => a.d >= from && a.d <= today).length
  const ratio = chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : null
  let status = 'starting'
  if (sessions28 >= 3 && chronic >= 60) {
    status = ratio < 0.8 ? 'easing' : ratio <= 1.3 ? 'productive' : ratio <= 1.5 ? 'high' : 'spike'
  }
  return { acute, chronic, ratio, status, sessions28 }
}

/** The last `n` weeks of load, oldest first: [{ end, acute, chronic }] at the end of each week. */
export function loadHistory(S, today, n = 8) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const end = back(today, i * 7)
    const { acute, chronic } = loadStatus(S, end)
    out.push({ end, acute, chronic })
  }
  return out
}

// When a session ended: its own start plus its time, else the evening of its day.
const endOf = a => (a.at > 0 ? a.at + secOf(a) * 1000 : new Date(a.d + 'T19:00:00').getTime())
const worstPain = a => Math.max(0, ...Object.values(a?.pain || {}))

/** Hours a session asks before the next run. */
export function recoveryHours(a) {
  const h = Math.min(RECOVERY_MAX_H, Math.max(RECOVERY_MIN_H, Math.round(sessionLoad(a) * 0.16)))
  return worstPain(a) >= PAIN_STOP ? RECOVERY_MAX_H : h
}

/** The latest session's recovery at `now`: { id, hours, left } (left in hours, 0 when done), or null. */
export function recoveryNow(S, now = Date.now()) {
  const last = runsOf(S).filter(a => endOf(a) <= now).sort((a, b) => endOf(b) - endOf(a))[0]
  if (!last) return null
  const hours = recoveryHours(last)
  const left = Math.max(0, Math.round(hours - (now - endOf(last)) / 3600e3))
  return { id: last.id, hours, left, since: Math.round((now - endOf(last)) / 3600e3) }
}

/** Hours since the last run (walks left out), or null. */
export function hoursSinceRun(S, now = Date.now()) {
  const last = runsOf(S).filter(a => a.sport === 'run' && endOf(a) <= now).sort((a, b) => endOf(b) - endOf(a))[0]
  return last ? Math.round((now - endOf(last)) / 3600e3) : null
}

/**
 * The pain answers that count today for each watched area: the morning check-in's (S.runPain) when
 * there is one, else the latest session's. { area: { v, d, from: 'checkin' | 'run' } }.
 */
export function watchedPain(S, today) {
  const watch = readRunProfile(S?.runProfile).watch
  const morning = S?.runPain?.[today] || null
  const out = {}
  for (const area of watch) {
    if (morning && Number.isInteger(morning[area])) { out[area] = { v: morning[area], d: today, from: 'checkin' }; continue }
    const last = runsOf(S).find(a => a.pain && area in a.pain)
    if (last) out[area] = { v: last.pain[area], d: last.d, from: 'run' }
  }
  return out
}

/**
 * Readiness on `today`: { score, level, reasons: [{ k, v? }] }. `vitals` is lib/vitals.js
 * vitalsSummary (or null without Apple Health); `now` for the recovery clock.
 */
export function readiness(S, today, { now = Date.now(), vitals = null } = {}) {
  let score = 80
  const reasons = []
  const pain = watchedPain(S, today)
  let stop = false
  for (const [area, p] of Object.entries(pain)) {
    if (p.v >= PAIN_STOP) { stop = true; reasons.push({ k: 'pain', area, v: p.v }) }
    else if (p.v > 0) { score -= 10; reasons.push({ k: 'painLow', area, v: p.v }) }
  }
  const form = formOf(S, today)
  const fs = formScore(form)
  if (fs != null) {
    score += Math.round((fs - 3) * 10)
    reasons.push({ k: fs >= 3.5 ? 'feelGood' : fs <= 2.5 ? 'feelRough' : 'feelOk', v: fs })
  }
  if (vitals?.hrv?.usual && vitals.hrv.d === today) {
    const r = vitals.hrv.v / vitals.hrv.usual
    if (r < 0.85) { score -= 15; reasons.push({ k: 'hrvLow', v: vitals.hrv.v, usual: vitals.hrv.usual }) }
    else if (r > 1.05) { score += 5; reasons.push({ k: 'hrvHigh', v: vitals.hrv.v, usual: vitals.hrv.usual }) }
  }
  if (vitals?.rhr?.usual && vitals.rhr.d === today && vitals.rhr.v > vitals.rhr.usual + 5) {
    score -= 10; reasons.push({ k: 'rhrHigh', v: vitals.rhr.v, usual: vitals.rhr.usual })
  }
  if (vitals?.sleep && vitals.sleep.d === today) {
    if (vitals.sleep.v < 360) { score -= 10; reasons.push({ k: 'sleepShort', v: vitals.sleep.v }) }
    else if (vitals.sleep.v >= 450) { score += 5; reasons.push({ k: 'sleepGood', v: vitals.sleep.v }) }
  }
  const rec = recoveryNow(S, now)
  if (rec?.left > 0) { score -= Math.min(30, rec.left); reasons.push({ k: 'recovering', v: rec.left }) }
  const load = loadStatus(S, today)
  if (load.status === 'spike') { score -= 20; reasons.push({ k: 'loadSpike', v: load.ratio }) }
  else if (load.status === 'high') { score -= 10; reasons.push({ k: 'loadHigh', v: load.ratio }) }
  score = Math.max(0, Math.min(100, score))
  if (stop) score = Math.min(score, 30)
  const level = stop || score < 45 ? 'rest' : score < 65 ? 'easy' : 'ready'
  return { score, level, reasons, load, recovery: rec }
}

/** S.runPain with the morning answers of `iso` (watched areas, 0 to 10), stamped `now`. */
export function withMorningPain(map, iso, pain, now = Date.now()) {
  const entry = { _ts: now }
  for (const [k, v] of Object.entries(pain || {})) if (Number.isInteger(v) && v >= 0 && v <= 10) entry[k] = v
  return { ...(map && typeof map === 'object' ? map : {}), [iso]: entry }
}
