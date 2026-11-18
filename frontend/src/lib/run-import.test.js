import { describe, it, expect } from 'vitest'
import { parseRunFile, applyRunFile, runFileOf, readRunProfile, RUN_SCHEMA } from './run-import.js'
import { runsOf, sessionStats } from './running.js'

const FILE = {
  schema: RUN_SCHEMA,
  profile: { goal: 'Run 10 km', notes: 'Sore right hip after the first run.', watch: ['hip-r', 'elbow'], heightCm: 180 },
  shoes: [{ id: 'p1', name: 'Daily trainer', km0: 10 }, { id: 'bad id', name: 'x' }],
  runs: [
    { id: 's1', d: '2026-11-01', sport: 'run', sec: 1960, km: 4.6, type: 'runwalk', rpe: 6, pain: { 'hip-r': 2 }, shoe: 'p1' },
    { id: 's2', d: '2026-11-04', sport: 'run', segs: [{ k: 'walk', sec: 2040, km: 2.4 }, { k: 'run', sec: 610, km: 2 }, { k: 'walk', sec: 480, km: 0.7 }], shoe: 'gone' },
    { id: 's3', d: '2026-11-05', sport: 'ride', min: 60 },
    { id: 's4', sport: 'run', min: 30 },
  ],
}

describe('running file', () => {
  it('refuses what is not one', () => {
    expect(parseRunFile('{')).toEqual({ ok: false, error: 'json' })
    expect(parseRunFile('{"schema":"other"}')).toEqual({ ok: false, error: 'schema' })
  })

  it('reads the runs, shoes and profile, and counts what it skipped', () => {
    const p = parseRunFile(JSON.stringify(FILE))
    expect(p.ok).toBe(true)
    expect(p.runs.map(r => r.id)).toEqual(['s1', 's2'])
    expect(p.shoes.map(s => s.id)).toEqual(['p1'])
    expect(p.skipped).toBe(3)
    expect(p.profile).toEqual({ goal: 'Run 10 km', notes: 'Sore right hip after the first run.', watch: ['hip-r'] })
    expect(p.heightCm).toBe(180)
  })

  it('brings the log in once, and only adds', () => {
    const S = { activities: {}, shoes: {}, runProfile: { goal: 'My own goal', notes: '', watch: [] } }
    const p = parseRunFile(JSON.stringify(FILE))
    expect(applyRunFile(S, p, 7)).toEqual({ runs: 2, shoes: 1, profile: true })
    expect(S.runProfile).toEqual({ goal: 'My own goal', notes: 'Sore right hip after the first run.', watch: ['hip-r'] })
    expect(S.heightCm).toBe(180)
    const runs = runsOf(S)
    expect(runs).toHaveLength(2)
    expect(runs.find(r => r.id === 'js1').shoe).toBe('p1')
    // A pair the file does not have is not kept on the run.
    expect(runs.find(r => r.id === 'js2').shoe).toBeUndefined()
    const st = sessionStats(runs.find(r => r.id === 'js2'))
    expect(st.km).toBe(5.1)
    expect(Math.round(st.runPace)).toBe(305)
    expect(applyRunFile(S, p, 8)).toEqual({ runs: 0, shoes: 0, profile: false })
  })

  it('takes its own file back without doubling anything', () => {
    const S = { activities: {}, shoes: {} }
    applyRunFile(S, parseRunFile(JSON.stringify(FILE)), 7)
    const again = parseRunFile(JSON.stringify(runFileOf(S)))
    expect(applyRunFile(S, again, 9).runs).toBe(0)
    expect(runsOf(S)).toHaveLength(2)
  })

  it('writes the log out with no sync stamps or sources', () => {
    const S = { activities: {}, shoes: {}, heightCm: 175 }
    applyRunFile(S, parseRunFile(JSON.stringify(FILE)), 7)
    const out = runFileOf(S)
    expect(out.schema).toBe(RUN_SCHEMA)
    expect(out.profile.heightCm).toBe(175)
    expect(out.runs[0]._ts).toBeUndefined()
    expect(out.runs[0].src).toBeUndefined()
    expect(out.shoes).toEqual([{ id: 'p1', name: 'Daily trainer', km0: 10 }])
  })

  it('reads an empty profile', () => {
    expect(readRunProfile(null)).toEqual({ goal: '', notes: '', watch: [] })
  })
})
