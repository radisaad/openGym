import { describe, it, expect } from 'vitest'
import { readActivity, withActivity, activitiesOf, SPORTS } from './activities.js'
import { readRunFields, readSeg, readPain } from './run-fields.js'
import { sessionStats, fmtPace, fmtTime, parseTime, runWeeks, runBests, longestJump, lastPain, runsOf, weekOf } from './running.js'

const S0 = acts => ({ activities: Object.fromEntries(acts.map((a, i) => [a.id || 'a' + i, { src: 'manual', _ts: 1, ...a }])) })

describe('run fields', () => {
  it('keeps the running details on a run and a walk only', () => {
    const e = { sec: 1800, rpe: 6, cad: 150, pain: { 'hip-r': 0 }, shoe: 'p1', type: 'easy' }
    expect(readRunFields(e, 'run')).toEqual({ sec: 1800, rpe: 6, cad: 150, pain: { 'hip-r': 0 }, shoe: 'p1', type: 'easy' })
    expect(readRunFields(e, 'walk').sec).toBe(1800)
    expect(readRunFields(e, 'ride')).toEqual({})
  })

  it('drops what is out of range', () => {
    expect(readRunFields({ rpe: 11, cad: 5, hr: 400, elev: -3, shoe: 'a b', type: 'jog' }, 'run')).toEqual({})
    expect(readSeg({ k: 'swim', sec: 60 })).toBe(null)
    expect(readSeg({ k: 'run', sec: 0 })).toBe(null)
    expect(readSeg({ k: 'run', sec: 120, km: 0.4 })).toEqual({ k: 'run', sec: 120, km: 0.4 })
    expect(readPain({ 'hip-r': 3, elbow: 4, knee: 12 })).toEqual({ 'hip-r': 3 })
  })

  it('keeps a zero pain answer: checked and nothing is an answer', () => {
    expect(readPain({ 'hip-r': 0 })).toEqual({ 'hip-r': 0 })
  })

  it('takes the time from the parts when the entry has none', () => {
    expect(readRunFields({ segs: [{ k: 'walk', sec: 300 }, { k: 'run', sec: 600 }] }, 'run').sec).toBe(900)
  })

  it('only marks a run continuous when it has no parts', () => {
    expect(readRunFields({ cont: true }, 'run').cont).toBe(true)
    expect(readRunFields({ cont: true, segs: [{ k: 'run', sec: 60 }] }, 'run').cont).toBeUndefined()
  })
})

describe('activities with run fields', () => {
  it('has walking as a sport of its own', () => {
    expect(SPORTS).toContain('walk')
  })

  it('works out minutes and distance from seconds and parts', () => {
    const a = readActivity({ d: '2026-11-10', sport: 'run', sec: 112, segs: [{ k: 'run', sec: 112, km: 0.4 }] })
    expect(a.min).toBe(2)
    expect(a.km).toBe(0.4)
    expect(a.sec).toBe(112)
  })

  it('keeps the fields through a save', () => {
    const map = withActivity({}, 'x', { d: '2026-11-10', sport: 'run', min: 30, km: 5, sec: 1800, rpe: 5, pain: { 'hip-r': 1 } }, 5)
    expect(map.x).toMatchObject({ sec: 1800, rpe: 5, pain: { 'hip-r': 1 }, _ts: 5 })
  })

  it('leaves the other sports as they were', () => {
    const a = readActivity({ d: '2026-11-10', sport: 'ride', min: 60, km: 20, rpe: 7, sec: 10 })
    expect(a).toEqual({ d: '2026-11-10', sport: 'ride', min: 60, km: 20, src: 'manual' })
  })
})

describe('session stats', () => {
  it('gives a run/walk session two paces, never one', () => {
    const st = sessionStats({ sport: 'run', sec: 1800, km: 4.5, segs: [
      { k: 'walk', sec: 300, km: 0.5 }, { k: 'run', sec: 1200, km: 3.5 }, { k: 'walk', sec: 300, km: 0.5 },
    ] })
    expect(Math.round(st.pace)).toBe(400) // 6:40 over the whole outing
    expect(Math.round(st.runPace)).toBe(343) // 5:43 while running
    expect(st.runShare).toBeCloseTo(2 / 3)
    expect(st.mixed).toBe(true)
  })

  it('has no running pace for a run without parts that was not run the whole way', () => {
    const st = sessionStats({ sport: 'run', sec: 2100, km: 5 })
    expect(st.pace).toBe(420)
    expect(st.runPace).toBe(null)
    expect(st.runShare).toBe(null)
  })

  it('reads a continuous run, a race or a test as running all the way', () => {
    expect(sessionStats({ sport: 'run', sec: 1500, km: 5, cont: true }).runPace).toBe(300)
    expect(sessionStats({ sport: 'run', sec: 112, km: 0.4, type: 'test' }).runPace).toBe(280)
  })

  it('reads a walk as walking only', () => {
    const st = sessionStats({ sport: 'walk', sec: 2400, km: 3 })
    expect(st.runPace).toBe(null)
    expect(st.walkKm).toBe(3)
    expect(st.runShare).toBe(0)
  })

  it('has no running pace when a running part has no distance', () => {
    const st = sessionStats({ sport: 'run', sec: 600, segs: [{ k: 'run', sec: 300, km: 1 }, { k: 'run', sec: 300 }] })
    expect(st.runPace).toBe(null)
  })
})

describe('formats', () => {
  it('writes paces and times', () => {
    expect(fmtPace(305)).toBe('5:05')
    expect(fmtPace(423.4)).toBe('7:03')
    expect(fmtPace(null)).toBe('–')
    expect(fmtTime(3038)).toBe('50:38')
    expect(fmtTime(3725)).toBe('1:02:05')
  })

  it('reads times typed in', () => {
    expect(parseTime('50:38')).toBe(3038)
    expect(parseTime('1:02:05')).toBe(3725)
    expect(parseTime('10')).toBe(600)
    expect(parseTime('10,5')).toBe(630)
    expect(parseTime('5:75')).toBe(null)
    expect(parseTime('abc')).toBe(null)
    expect(parseTime('')).toBe(null)
  })
})

describe('the log over time', () => {
  const S = S0([
    { id: 'r1', d: '2026-11-02', sport: 'run', min: 22, km: 3.5 },
    { id: 'r2', d: '2026-11-05', sport: 'run', min: 33, km: 4.6, pain: { 'hip-r': 2 } },
    { id: 'w1', d: '2026-11-07', sport: 'walk', min: 40, km: 3 },
    { id: 'r3', d: '2026-11-12', sport: 'run', min: 51, km: 7.2, pain: { 'hip-r': 0 } },
    { id: 'b1', d: '2026-11-12', sport: 'ride', min: 60, km: 20 },
  ])

  it('lists runs and walks, not the other sports', () => {
    expect(runsOf(S).map(a => a.id).sort()).toEqual(['r1', 'r2', 'r3', 'w1'])
  })

  it('starts weeks on the profile’s day', () => {
    expect(weekOf('2026-11-12', 1)).toBe('2026-11-09')
    expect(weekOf('2026-11-12', 0)).toBe('2026-11-08')
  })

  it('adds up the weeks, oldest first', () => {
    const w = runWeeks(S, 3, '2026-11-12')
    expect(w.map(x => x.week)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09'])
    expect(w[1]).toMatchObject({ km: 11.1, n: 3, runs: 2, walks: 1 })
    expect(w[2]).toMatchObject({ km: 7.2, n: 1, runs: 1 })
  })

  it('names the longest session and the jump to it', () => {
    expect(runBests(S).longest).toMatchObject({ id: 'r3', value: 7.2 })
    const j = longestJump(S)
    expect(j.prev).toBe(4.6)
    expect(j.ratio).toBeCloseTo(7.2 / 4.6)
  })

  it('has no jump when the latest one is not the longest', () => {
    const S2 = S0([{ id: 'a', d: '2026-11-01', sport: 'run', min: 50, km: 7 }, { id: 'b', d: '2026-11-03', sport: 'run', min: 20, km: 3 }])
    expect(longestJump(S2)).toBe(null)
  })

  it('takes no fastest pace from under a kilometre', () => {
    const S2 = S0([{ id: 's', d: '2026-11-01', sport: 'run', sec: 112, km: 0.4, type: 'test' }])
    expect(runBests(S2).fastest).toBe(null)
  })

  it('finds the latest pain answer for an area', () => {
    expect(lastPain(S, 'hip-r')).toMatchObject({ id: 'r3', v: 0 })
    expect(lastPain(S, 'knee-l')).toBe(null)
  })

  it('keeps the other sports out of the activities list untouched', () => {
    expect(activitiesOf(S).find(a => a.id === 'b1')).toMatchObject({ sport: 'ride', km: 20 })
  })
})
