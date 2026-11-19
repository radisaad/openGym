// What the coach (Claude) is told about the runner (v1.4.6, RadiGym): one plain-text brief with the
// profile and its rules, the last sessions with both paces, the load, readiness, the goals and the
// plan the app has worked out. The Coach screen copies it for a Claude conversation, and the
// in-app coach sends it as the conversation's context. Written in English for the model, whatever
// the app's language: the runner's own words (notes) go in as they are. Pure.
import { runsOf, sessionStats, fmtPace, fmtTime, runWeeks, runBests } from './running.js'
import { readRunProfile } from './run-import.js'
import { loadStatus, readiness, rpeOf } from './run-load.js'
import { goalProgress, todayPlan, weekPlan } from './run-plan.js'
import { predictions } from './run-predict.js'
import { BUILT_IN } from './run-intervals.js'

const presetName = id => BUILT_IN.find(p => p.id === id)?.name || id

const sessionLine = a => {
  const st = sessionStats(a)
  const pace = st.mixed
    ? `running ${fmtPace(st.runPace)}/km, overall ${fmtPace(st.pace)}/km (run/walk, ${Math.round((st.runShare || 0) * 100)}% running)`
    : st.pace ? `${fmtPace(st.pace)}/km${a.sport === 'run' && !a.cont && !a.segs?.length && !['tempo', 'race', 'test'].includes(a.type) ? ' (may include walking)' : ''}` : 'no distance'
  const bits = [a.d, a.sport, a.type || null, st.km ? `${st.km} km` : null, fmtTime(st.sec), pace,
    a.rpe ? `effort ${a.rpe}/10` : `effort ~${rpeOf(a)}/10 (assumed)`,
    a.pain ? 'pain ' + Object.entries(a.pain).map(([k, v]) => `${k} ${v}/10`).join(', ') : null,
    a.cad ? `cadence ${a.cad}` : null, a.elev ? `+${a.elev} m` : null, a.note ? `note: "${a.note}"` : null]
  return '- ' + bits.filter(Boolean).join(' · ')
}

/** The brief for `today`. `vitals` as lib/vitals.js vitalsSummary, when Apple Health has them. */
export function coachBrief(S, today, { now = Date.now(), vitals = null, sessions = 12 } = {}) {
  const prof = readRunProfile(S?.runProfile)
  const ready = readiness(S, today, { now, vitals })
  const load = loadStatus(S, today)
  const goals = goalProgress(S, today)
  const plan = todayPlan(S, today, ready, now)
  const week = weekPlan(S, today, ready, now)
  const weeks = runWeeks(S, 6, today)
  const best = runBests(S)
  const pred = predictions(S, today)
  const L = []
  L.push(`You are the personal running coach in RadiGym. Today is ${today}.`)
  L.push('Coach candidly and practically. Consistency and recovery before distance or speed. A run/walk average is not a running pace. One fast split or one long day proves little. Never advise running through sharp or localised pain, limping or pain on weight-bearing: advise rest and an in-person assessment if it persists. Keep answers short and specific, and reply in the language the runner writes in (English or French).')
  if (prof.goal) L.push(`\nGoal: ${prof.goal}`)
  if (prof.notes) L.push(`\nRunner's notes:\n${prof.notes}`)
  if (prof.watch.length) L.push(`\nWatched areas (asked after every session): ${prof.watch.join(', ')}`)
  L.push(`\nReadiness today: ${ready.score}/100 (${ready.level}). Reasons: ${ready.reasons.map(r => r.k + (r.v != null ? ` ${r.v}` : '') + (r.area ? ` (${r.area})` : '')).join(', ') || 'none'}.`)
  L.push(`Training load: last 7 days ${load.acute}, weekly average over 4 weeks ${load.chronic}, ratio ${load.ratio ?? 'n/a'} (${load.status}). Load = minutes × effort.`)
  L.push(`This week: ${goals.runs}/${goals.goal.runs} runs, ${goals.km}/${goals.goal.km} km, ${goals.min}/${goals.goal.min} min.`)
  L.push(`Last 6 weeks (km): ${weeks.map(w => w.km).join(', ')}.`)
  if (best.longest) L.push(`Longest outing: ${best.longest.value} km (${best.longest.d}).`)
  if (best.fastest) L.push(`Fastest running pace over 1 km+: ${fmtPace(best.fastest.value)}/km over ${best.fastest.km} km (${best.fastest.d}).`)
  if (pred.base) L.push(`Predictions from ${pred.base.km} km in ${fmtTime(pred.base.sec)}: ${pred.races.map(r => `${r.id} ${r.sec ? fmtTime(r.sec) : 'not yet'} (${r.conf})`).join(', ')}.`)
  L.push(`\nThe app's plan for today: ${plan.kind}${plan.preset ? ` (${presetName(plan.preset)}, ${plan.min} min)` : plan.min ? ` (${plan.min} min)` : ''}; why: ${plan.why.join(', ')}.`)
  L.push(`Week ahead: ${week.map(d => `${d.d} ${d.kind}${d.preset ? ' ' + presetName(d.preset) : d.min ? ` ${d.min} min` : ''}`).join('; ')}.`)
  L.push(`\nRecent sessions (newest first):`)
  for (const a of runsOf(S).slice(0, sessions)) L.push(sessionLine(a))
  return L.join('\n')
}
