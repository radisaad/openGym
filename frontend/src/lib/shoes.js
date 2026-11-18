// Running shoes (v1.4.6): the pairs a profile runs in, and how far each has gone. A run or a walk
// names the pair it was done in (`shoe` on the activity, lib/run-fields.js); a pair's distance is
// what it had when it was added (`km0`, for a pair bought before the log) plus every session in it.
//
//   S.shoes = { '<id>': { name: 'Daily trainer', km0?: 12, max?: 600, retired?: true, _ts }, … }
//
// One stamped entry per pair, like the activities (lib/sync-merge.js STAMPED_MAPS): a removal is a
// stamped empty entry, so it syncs. `max` is when the pair is due for a change, 600 km unless it
// says otherwise: road shoes usually go somewhere between 500 and 800 km, and the foam goes before
// the sole shows it.
import { activitiesOf } from './activities.js'

export const SHOE_MAX_KM = 600
export const SHOE_NAME_MAX = 60
const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)

/** One stored pair read back, or null for a cleared or broken one. */
export function readShoe(entry) {
  if (!isMap(entry)) return null
  const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, SHOE_NAME_MAX) : ''
  if (!name) return null
  const km0 = Number(entry.km0), max = Number(entry.max)
  return {
    name,
    ...(km0 > 0 && km0 < 10000 ? { km0: Math.round(km0 * 10) / 10 } : {}),
    ...(max >= 50 && max <= 5000 ? { max: Math.round(max) } : {}),
    ...(entry.retired === true ? { retired: true } : {}),
  }
}

/** Every pair with its distance: [{ id, name, km, max, left, share, n, retired }], in use first, then by distance. */
export function shoesOf(S) {
  const map = isMap(S?.shoes) ? S.shoes : {}
  const used = new Map()
  for (const a of activitiesOf(S)) {
    if (!a.shoe) continue
    const u = used.get(a.shoe) || { km: 0, n: 0, last: null }
    u.km += a.km || 0; u.n++; if (!u.last || a.d > u.last) u.last = a.d
    used.set(a.shoe, u)
  }
  const out = []
  for (const [id, e] of Object.entries(map)) {
    const s = readShoe(e)
    if (!s) continue
    const u = used.get(id) || { km: 0, n: 0, last: null }
    const km = Math.round(((s.km0 || 0) + u.km) * 10) / 10
    const max = s.max || SHOE_MAX_KM
    out.push({ id, name: s.name, km, max, left: Math.max(0, Math.round((max - km) * 10) / 10), share: Math.min(1, km / max), n: u.n, last: u.last, retired: !!s.retired, km0: s.km0 || 0 })
  }
  return out.sort((a, b) => (a.retired - b.retired) || b.km - a.km || (a.name < b.name ? -1 : 1))
}

/** The pairs still in use. */
export const activeShoes = S => shoesOf(S).filter(s => !s.retired)

/** The pair a new session starts with: the one the last session used if still in use, else the most worn one in use. */
export function defaultShoe(S) {
  const active = activeShoes(S)
  if (!active.length) return null
  const last = activitiesOf(S).find(a => a.shoe)
  return active.find(s => s.id === last?.shoe)?.id || active[0].id
}

/** S.shoes with `id` set to `shoe`, stamped `now`; null clears it with a stamped empty entry. */
export function withShoe(map, id, shoe, now = Date.now()) {
  const clean = shoe ? readShoe(shoe) : null
  return { ...(isMap(map) ? map : {}), [id]: clean ? { ...clean, _ts: now } : { _ts: now } }
}

/** 'ok', 'soon' (under 100 km to go) or 'due' for a pair from shoesOf. */
export const shoeWear = s => (s.km >= s.max ? 'due' : s.max - s.km <= 100 ? 'soon' : 'ok')
