// Race predictions (v1.4.6, RadiGym): what the best recent running says about 5 km, 10 km and the
// half, by Riegel's formula (T2 = T1 × (D2 / D1)^1.06). Honest about what it is built on: only
// running done without walking counts (a whole run run through, a race or a test, or one running
// part of a run/walk session), from 1 km up, in the last 90 days; the further the target is past
// that effort, the lower the confidence, and the half waits for a longer base.
import { runsOf, sessionStats } from './running.js'
import { isoOf } from './format.js'

export const RIEGEL = 1.06
export const TARGETS = [{ id: '5k', km: 5 }, { id: '10k', km: 10 }, { id: 'half', km: 21.0975 }]
const WINDOW_DAYS = 90
const CONTINUOUS = new Set(['tempo', 'race', 'test'])

export const riegel = (sec, km, toKm) => sec * Math.pow(toKm / km, RIEGEL)

/** Every effort run without walking, from 1 km, in the window: [{ km, sec, d, id }]. */
export function efforts(S, today) {
  const from = isoOf(new Date(new Date(today + 'T12:00:00').getTime() - WINDOW_DAYS * 86400000))
  const out = []
  for (const a of runsOf(S)) {
    if (a.sport !== 'run' || a.d < from || a.d > today) continue
    if (a.segs?.length) {
      for (const g of a.segs) if (g.k === 'run' && g.km >= 1) out.push({ km: g.km, sec: g.sec, d: a.d, id: a.id })
    } else if ((a.cont || CONTINUOUS.has(a.type)) && a.km >= 1) {
      const st = sessionStats(a)
      out.push({ km: st.km, sec: st.sec, d: a.d, id: a.id })
    }
  }
  return out
}

/**
 * The predictions: { base: effort | null, races: [{ id, km, sec, conf: 'good' | 'rough' | 'low' | 'notYet' }] }.
 * The base is the effort that predicts the fastest 5 km. `conf` falls with the stretch from the base
 * to the race; the half is 'notYet' until a base of 8 km.
 */
export function predictions(S, today) {
  const list = efforts(S, today)
  if (!list.length) return { base: null, races: TARGETS.map(r => ({ ...r, sec: null, conf: 'notYet' })) }
  const base = list.reduce((best, e) => (riegel(e.sec, e.km, 5) < riegel(best.sec, best.km, 5) ? e : best))
  const races = TARGETS.map(r => {
    const stretch = r.km / base.km
    const conf = r.id === 'half' && base.km < 8 ? 'notYet' : stretch <= 2 ? 'good' : stretch <= 4 ? 'rough' : 'low'
    return { ...r, sec: conf === 'notYet' ? null : Math.round(riegel(base.sec, base.km, r.km)), conf }
  })
  return { base, races }
}
