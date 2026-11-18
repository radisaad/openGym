import { describe, it, expect } from 'vitest'
import {
  readPreset, presetsOf, stepsOf, presetTotals, startRun, elapsedOf, pauseRun, resumeRun, runAt, skipStep,
  resultSegs, spokenDuration, startLine, cuesOf, BUILT_IN,
} from './run-intervals.js'

const fmt = (s, ...a) => a.reduce((x, v, i) => x.replaceAll(`{${i}}`, v), s)
const tr = (s, ...a) => fmt(s, ...a)
const trn = (one, other, n) => fmt(n === 1 ? one : other, n)
const P = { id: 'p', name: 'Test', warm: 300, cool: 300, blocks: [{ times: 6, steps: [{ k: 'walk', sec: 120 }, { k: 'run', sec: 120 }] }] }
const T0 = 1_000_000

describe('presets', () => {
  it('reads one and drops what does not fit', () => {
    expect(readPreset({ ...P, blocks: [{ times: 99, steps: [{ k: 'run', sec: 60 }, { k: 'swim', sec: 60 }, { k: 'walk', sec: 2 }] }] }))
      .toEqual({ id: 'p', name: 'Test', warm: 300, cool: 300, blocks: [{ times: 50, steps: [{ k: 'run', sec: 60 }] }] })
    expect(readPreset({ id: 'x', blocks: [] })).toBe(null)
    expect(readPreset({ id: 'bad id', warm: 300 })).toBe(null)
  })

  it('lists the profile’s own first, then the built-in ones', () => {
    const list = presetsOf({ runIntervals: [P, { id: 'broken' }] })
    expect(list.map(p => p.id)).toEqual(['p', ...BUILT_IN.map(b => b.id)])
  })

  it('has the coach’s 2/2 × 6 first among the built-in ones', () => {
    expect(presetTotals(BUILT_IN[0])).toEqual({ sec: 300 + 6 * 240 + 300, runSec: 720, steps: 14 })
  })
})

describe('steps', () => {
  it('lays the workout out in order, with repeats counted', () => {
    const s = stepsOf(P)
    expect(s).toHaveLength(14)
    expect(s[0]).toEqual({ k: 'warm', sec: 300, at: 0, block: -1, rep: 0, of: 0 })
    expect(s[2]).toEqual({ k: 'run', sec: 120, at: 420, block: 0, rep: 1, of: 6 })
    expect(s[13]).toMatchObject({ k: 'cool', at: 1740 })
  })
})

describe('the clock', () => {
  it('finds the step and what is left of it', () => {
    const r = startRun(P, T0)
    expect(runAt(r, T0 + 10_000)).toMatchObject({ i: 0, left: 290, done: false })
    const at = runAt(r, T0 + 430_000)
    expect(at.step.k).toBe('run')
    expect(at.left).toBe(110)
    expect(at.next.k).toBe('walk')
    expect(runAt(r, T0 + 3_000_000)).toMatchObject({ done: true, elapsed: 2040 })
  })

  it('stops while paused and goes on where it was', () => {
    let r = startRun(P, T0)
    r = pauseRun(r, T0 + 60_000)
    expect(elapsedOf(r, T0 + 600_000)).toBe(60)
    r = resumeRun(r, T0 + 600_000)
    expect(elapsedOf(r, T0 + 610_000)).toBe(70)
    expect(pauseRun(pauseRun(r, T0 + 700_000), T0 + 800_000).pausedAt).toBe(T0 + 700_000)
  })

  it('skips to the next step', () => {
    const r = skipStep(startRun(P, T0), T0 + 10_000)
    expect(runAt(r, T0 + 10_000)).toMatchObject({ i: 1, left: 120 })
  })
})

describe('the result', () => {
  it('gives the parts done, warm-up and cool-down as walking', () => {
    const segs = resultSegs(startRun(P, T0), T0 + 3_000_000)
    expect(segs[0]).toEqual({ k: 'walk', sec: 420 })
    expect(segs[1]).toEqual({ k: 'run', sec: 120 })
    expect(segs[segs.length - 1]).toEqual({ k: 'walk', sec: 300 })
    expect(segs.reduce((n, s) => n + s.sec, 0)).toBe(2040)
  })

  it('stops at the moment the run was stopped', () => {
    expect(resultSegs(startRun(P, T0), T0 + 450_000)).toEqual([{ k: 'walk', sec: 420 }, { k: 'run', sec: 30 }])
  })
})

describe('the voice', () => {
  it('says durations the way a person would', () => {
    expect(spokenDuration(120, tr, trn)).toBe('2 minutes')
    expect(spokenDuration(60, tr, trn)).toBe('1 minute')
    expect(spokenDuration(45, tr, trn)).toBe('45 seconds')
    expect(spokenDuration(90, tr, trn)).toBe('90 seconds')
    expect(spokenDuration(150, tr, trn)).toBe('2 minutes 30')
  })

  it('names the step and which repeat it is', () => {
    expect(startLine({ k: 'run', sec: 120, rep: 3, of: 6 }, tr, trn)).toBe('Run, 2 minutes. 3 of 6.')
    expect(startLine({ k: 'run', sec: 120, rep: 6, of: 6 }, tr, trn)).toBe('Run, 2 minutes. Last one.')
    expect(startLine({ k: 'warm', sec: 300, rep: 0, of: 0 }, tr, trn)).toBe('Warm-up walk, 5 minutes.')
  })

  it('times every cue, with a warning before each change', () => {
    const cues = cuesOf(startRun(P, T0), T0, tr, trn)
    expect(cues[0]).toEqual({ at: T0, text: 'Warm-up walk, 5 minutes.' })
    expect(cues[1]).toEqual({ at: T0 + 290_000, text: 'Walk in 10 seconds.' })
    expect(cues.find(c => c.text === 'Run in 10 seconds.').at).toBe(T0 + 410_000)
    expect(cues.find(c => c.text.startsWith('Halfway')).at).toBe(T0 + 1_020_000)
    expect(cues[cues.length - 1]).toEqual({ at: T0 + 2_040_000, text: 'Done. Great work. Log how it felt.' })
    // The last run warns of the cool-down; a walk going into the cool-down walk would not.
    expect(cues.filter(c => c.text === 'Cool-down walk in 10 seconds.')).toHaveLength(1)
    const walkLast = { ...P, blocks: [{ times: 2, steps: [{ k: 'run', sec: 120 }, { k: 'walk', sec: 120 }] }] }
    expect(cuesOf(startRun(walkLast, T0), T0, tr, trn).filter(c => c.text === 'Cool-down walk in 10 seconds.')).toHaveLength(0)
  })

  it('gives only the cues still to come, none while paused', () => {
    const r = startRun(P, T0)
    expect(cuesOf(r, T0 + 1_000_000, tr, trn).every(c => c.at >= T0 + 998_500)).toBe(true)
    expect(cuesOf(pauseRun(r, T0 + 5000), T0 + 6000, tr, trn)).toEqual([])
  })

  it('moves the cues by the time spent paused', () => {
    const r = resumeRun(pauseRun(startRun(P, T0), T0 + 60_000), T0 + 120_000)
    expect(cuesOf(r, T0 + 120_000, tr, trn)[0].at).toBe(T0 + 60_000 + 290_000)
  })
})
