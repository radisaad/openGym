// The running details an activity can carry (v1.4.6, running log): on a run or a walk only, beside
// the plain { d, sport, min, km } every activity has (lib/activities.js). A leaf module, no imports,
// so activities.js can keep these fields when it cleans an entry without a cycle.
//
//   sec    the whole session in seconds (min stays, rounded, for everything that reads minutes)
//   segs   the parts in order, [{ k: 'run' | 'walk', sec, km? }]: a run/walk session is a run with
//          walking in it, and its pace is two numbers, never one (lib/running.js)
//   cont   true when a run without parts was run the whole way, so its average is a running pace
//   type   what the session was for (RUN_TYPES): an easy run, a long one, a test...
//   rpe    how hard it felt, 1 to 10
//   pain   { area: 0..10 } for the areas checked after it (PAIN_AREAS). A 0 is kept: "checked,
//          nothing" is an answer, and the one a sore hip waits for
//   cad    steps a minute, `elev` metres climbed, `hr` average heart rate, `steps` the step count
//   shoe   the id of the pair worn (lib/shoes.js); `preset` the interval workout it followed

export const RUN_SPORTS = new Set(['run', 'walk'])
export const SEG_KINDS = ['run', 'walk']
export const RUN_TYPES = ['easy', 'long', 'runwalk', 'tempo', 'intervals', 'race', 'test']
export const PAIN_AREAS = ['hip-r', 'hip-l', 'knee-r', 'knee-l', 'calf', 'shin', 'foot', 'back']
export const SEG_MAX = 60
export const RUN_SEC_MAX = 24 * 3600

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const int = (v, lo, hi) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null
}
const km3 = v => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n < 1000 ? Math.round(n * 1000) / 1000 : null
}

/** One part read back, or null: a kind and a time, a distance when there was one. */
export function readSeg(seg) {
  if (!isMap(seg) || !SEG_KINDS.includes(seg.k)) return null
  const sec = int(seg.sec, 1, RUN_SEC_MAX)
  if (sec == null) return null
  const km = km3(seg.km)
  return { k: seg.k, sec, ...(km != null ? { km } : {}) }
}

/** The pain answers kept: known areas, 0 to 10. Null when none. */
export function readPain(pain) {
  if (!isMap(pain)) return null
  const out = {}
  for (const area of PAIN_AREAS) {
    const v = int(pain[area], 0, 10)
    if (v != null) out[area] = v
  }
  return Object.keys(out).length ? out : null
}

/**
 * The running fields of an entry, cleaned, for a run or a walk; {} for any other sport. What
 * activities.js readActivity spreads into the entry it returns.
 */
export function readRunFields(entry, sport) {
  if (!RUN_SPORTS.has(sport) || !isMap(entry)) return {}
  const out = {}
  const segs = Array.isArray(entry.segs) ? entry.segs.slice(0, SEG_MAX).map(readSeg).filter(Boolean) : []
  if (segs.length) out.segs = segs
  const segSec = segs.reduce((n, s) => n + s.sec, 0)
  const sec = int(entry.sec, 1, RUN_SEC_MAX) ?? (segSec > 0 ? segSec : null)
  if (sec != null) out.sec = sec
  if (entry.cont === true && !segs.length) out.cont = true
  if (RUN_TYPES.includes(entry.type)) out.type = entry.type
  const rpe = int(entry.rpe, 1, 10)
  if (rpe != null) out.rpe = rpe
  const pain = readPain(entry.pain)
  if (pain) out.pain = pain
  const cad = int(entry.cad, 40, 260)
  if (cad != null) out.cad = cad
  const elev = int(entry.elev, 0, 10000)
  if (elev != null) out.elev = elev
  const hr = int(entry.hr, 30, 240)
  if (hr != null) out.hr = hr
  const steps = int(entry.steps, 1, 1e6)
  if (steps != null) out.steps = steps
  if (typeof entry.shoe === 'string' && /^[\w-]{1,40}$/.test(entry.shoe)) out.shoe = entry.shoe
  // The interval workout it was run to (lib/run-intervals.js), for the coach's ladder (lib/run-plan.js).
  if (typeof entry.preset === 'string' && /^[\w-]{1,40}$/.test(entry.preset)) out.preset = entry.preset
  return out
}
