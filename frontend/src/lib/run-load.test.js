import { describe, it, expect } from 'vitest'
import { rpeOf, sessionLoad, loadStatus, recoveryHours, recoveryNow, readiness, watchedPain, withMorningPain, hoursSinceRun } from './run-load.js'
import { goalsOf, goalProgress, todayPlan, weekPlan, nextPreset } from './run-plan.js'
import { predictions, riegel, efforts } from './run-predict.js'
import { coachBrief } from './run-coach-brief.js'

const S0 = (acts, extra = {}) => ({
  runProfile: { goal: 'Run 10 km', notes: 'Right hip history.', watch: ['hip-r'] },
  activities: Object.fromEntries(acts.map((a, i) => [a.id || 'a' + i, { src: 'manual', _ts: 1, ...a }])),
  ...extra,
})
const TODAY = '2026-11-20'
const NOW = new Date('2026-11-20T08:00:00').getTime()

describe('load', () => {
  it('takes the effort given, else the usual for the kind', () => {
    expect(rpeOf({ rpe: 7 })).toBe(7)
    expect(rpeOf({ sport: 'walk' })).toBe(2)
    expect(rpeOf({ sport: 'run', type: 'test' })).toBe(9)
    expect(sessionLoad({ sport: 'run', sec: 1800, rpe: 5 })).toBe(150)
  })

  it('calls a thin month "starting", and finds a spike against a steady base', () => {
    expect(loadStatus(S0([{ d: '2026-11-19', sport: 'run', min: 30 }]), TODAY).status).toBe('starting')
    const base = []
    for (let i = 8; i <= 27; i += 4) base.push({ d: `2026-${i < 20 ? '11' : '10'}-${String(i < 20 ? 20 - i : 51 - i).padStart(2, '0')}`, sport: 'run', min: 30, rpe: 4 })
    const steady = S0([{ d: '2026-10-28', sport: 'run', min: 30, rpe: 4 }, { d: '2026-11-02', sport: 'run', min: 30, rpe: 4 }, { d: '2026-11-07', sport: 'run', min: 30, rpe: 4 },
      { d: '2026-11-15', sport: 'run', min: 60, rpe: 8 }, { d: '2026-11-18', sport: 'run', min: 60, rpe: 8 }, { d: '2026-11-19', sport: 'run', min: 60, rpe: 8 }])
    const st = loadStatus(steady, TODAY)
    expect(st.acute).toBe(1440)
    expect(st.status).toBe('spike')
  })
})

describe('recovery', () => {
  it('asks more after a harder session, the most after pain', () => {
    expect(recoveryHours({ sport: 'walk', sec: 2400 })).toBe(13)
    expect(recoveryHours({ sport: 'run', sec: 3000, rpe: 6 })).toBe(48)
    expect(recoveryHours({ sport: 'run', sec: 600, rpe: 3, pain: { 'hip-r': 5 } })).toBe(72)
  })

  it('counts down from the end of the last session', () => {
    const S = S0([{ d: '2026-11-19', sport: 'run', sec: 3000, rpe: 6, at: new Date('2026-11-19T19:00:00').getTime() }])
    const r = recoveryNow(S, NOW)
    expect(r.hours).toBe(48)
    expect(r.left).toBe(48 - 12)
    expect(hoursSinceRun(S, NOW)).toBe(12)
  })
})

describe('readiness', () => {
  it('is rest whenever a watched area hurts at 4/10 or more', () => {
    const S = S0([{ d: '2026-11-15', sport: 'run', min: 30, pain: { 'hip-r': 5 } }])
    const r = readiness(S, TODAY, { now: NOW })
    expect(r.level).toBe('rest')
    expect(r.reasons[0]).toMatchObject({ k: 'pain', area: 'hip-r', v: 5 })
  })

  it('takes the morning answer over the last run’s', () => {
    const S = S0([{ d: '2026-11-15', sport: 'run', min: 30, pain: { 'hip-r': 5 } }], { runPain: withMorningPain({}, TODAY, { 'hip-r': 0 }, 1) })
    expect(watchedPain(S, TODAY)['hip-r']).toEqual({ v: 0, d: TODAY, from: 'checkin' })
    expect(readiness(S, TODAY, { now: NOW }).level).toBe('ready')
  })

  it('reads a rough morning and a low HRV', () => {
    const S = S0([], { dayForm: { [TODAY]: { sleep: 1, energy: 2, sore: 4, stress: 4, _ts: 1 } } })
    const vitals = { hrv: { v: 30, d: TODAY, usual: 50 }, rhr: null, sleep: { v: 300, d: TODAY } }
    const r = readiness(S, TODAY, { now: NOW, vitals })
    expect(r.reasons.map(x => x.k)).toEqual(['feelRough', 'hrvLow', 'sleepShort'])
    expect(r.level).toBe('rest')
  })
})

describe('plan', () => {
  it('has a weekly goal of two runs to start', () => {
    expect(goalsOf({})).toEqual({ runs: 2, km: 10, min: 90 })
    expect(goalsOf({ runGoals: { runs: 3, km: 15, min: -5 } })).toEqual({ runs: 3, km: 15, min: 90 })
  })

  it('counts the week against the goals', () => {
    const p = goalProgress(S0([{ d: '2026-11-17', sport: 'run', min: 30, km: 4 }, { d: '2026-11-18', sport: 'walk', min: 40, km: 3 }]), TODAY)
    expect(p).toMatchObject({ runs: 1, km: 7, min: 70 })
    expect(p.share.runs).toBe(0.5)
  })

  it('rests on a sore hip, walks the day after a run, runs when recovered', () => {
    const rest = { level: 'rest', reasons: [{ k: 'pain' }] }
    expect(todayPlan(S0([]), TODAY, rest, NOW)).toMatchObject({ kind: 'rest', why: ['pain'] })
    const yesterday = S0([{ d: '2026-11-19', sport: 'run', min: 30, at: new Date('2026-11-19T18:00:00').getTime() }])
    expect(todayPlan(yesterday, TODAY, { level: 'ready', reasons: [] }, NOW)).toMatchObject({ kind: 'walk', why: ['recovering'] })
    const run = todayPlan(S0([{ d: '2026-11-16', sport: 'run', min: 30 }]), TODAY, { level: 'ready', reasons: [] }, NOW)
    expect(run).toMatchObject({ kind: 'run', preset: 'b-2-2', min: 34 })
  })

  it('picks the gentlest workout on an easy day, and steps up after three easy finishes', () => {
    expect(nextPreset(S0([]), 'easy')).toBe('b-1-2')
    const three = [1, 3, 5].map(n => ({ d: `2026-11-1${n}`, sport: 'run', min: 34, preset: 'b-2-2', rpe: 5 }))
    expect(nextPreset(S0(three), 'ready')).toBe('b-3-1')
    expect(nextPreset(S0(three.map(a => ({ ...a, rpe: 8 }))), 'ready')).toBe('b-2-2')
  })

  it('spreads the week’s runs at least two days apart, with walks between', () => {
    const w = weekPlan(S0([{ d: '2026-11-16', sport: 'run', min: 30 }]), TODAY, { level: 'ready', reasons: [] }, NOW)
    expect(w).toHaveLength(7)
    const runs = w.map((d, i) => (['run', 'long'].includes(d.kind) ? i : null)).filter(i => i != null)
    expect(runs.length).toBe(2)
    expect(runs[1] - runs[0]).toBeGreaterThanOrEqual(3)
    expect(w[runs[0] + 1].kind).toBe('walk')
  })
})

describe('predictions', () => {
  it('uses only running done without walking, from 1 km', () => {
    const S = S0([
      { d: '2026-11-18', sport: 'run', segs: [{ k: 'walk', sec: 2040, km: 2.45 }, { k: 'run', sec: 610, km: 2 }] },
      { d: '2026-11-14', sport: 'run', sec: 3038, km: 7.18, type: 'runwalk' },
      { d: '2026-11-16', sport: 'run', sec: 112, km: 0.4, type: 'test' },
    ])
    expect(efforts(S, TODAY)).toEqual([{ km: 2, sec: 610, d: '2026-11-18', id: 'a0' }])
    const p = predictions(S, TODAY)
    expect(p.races[0]).toMatchObject({ id: '5k', sec: Math.round(riegel(610, 2, 5)), conf: 'rough' })
    expect(p.races[2]).toMatchObject({ id: 'half', sec: null, conf: 'notYet' })
  })

  it('says nothing without a base', () => {
    expect(predictions(S0([]), TODAY).base).toBe(null)
  })
})

describe('the coach brief', () => {
  it('carries the rules, the profile, the plan and the sessions with both paces', () => {
    const S = S0([{ d: '2026-11-18', sport: 'run', segs: [{ k: 'walk', sec: 600, km: 0.8 }, { k: 'run', sec: 610, km: 2 }], rpe: 6 }])
    const b = coachBrief(S, TODAY, { now: NOW })
    expect(b).toContain('A run/walk average is not a running pace')
    expect(b).toContain('Right hip history.')
    expect(b).toContain('running 5:05/km, overall')
    expect(b).toContain("The app's plan for today")
  })
})
