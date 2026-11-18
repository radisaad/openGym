// The running log as a file (v1.4.6): bring a log in from elsewhere (a coach's handover, another
// device, a backup) and take it out again, in one plain JSON shape:
//
//   {
//     "schema": "opengym.running.v1",
//     "profile": { "goal": "…", "notes": "…", "watch": ["hip-r"], "heightCm": 175 },
//     "shoes": [{ "id": "pair1", "name": "Daily trainer", "km0": 0, "max": 600 }],
//     "runs":  [{ "id": "s1", "d": "2026-10-20", "sport": "run", "sec": 1500, "km": 4.2,
//                 "segs": [{ "k": "walk", "sec": 600, "km": 0.8 }], "type": "runwalk", "rpe": 6,
//                 "pain": { "hip-r": 3 }, "cad": 160, "elev": 20, "steps": 4200, "shoe": "pair1",
//                 "title": "…", "note": "…" }]
//   }
//
// Bringing one in only adds: a run or a pair already here (by id, or removed here) is left as it is,
// and the profile fills only what this one has not set. Every field is cleaned the way the app
// cleans its own (lib/activities.js readActivity, lib/shoes.js readShoe), so a file can never put
// anything into the profile the app would not have written itself.
import { readActivity, activitiesOf } from './activities.js'
import { RUN_SPORTS, PAIN_AREAS } from './run-fields.js'
import { readShoe } from './shoes.js'

export const RUN_SCHEMA = 'opengym.running.v1'
export const PROFILE_TEXT_MAX = 4000
const GOAL_MAX = 200
const RUNS_MAX = 5000
const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ID = /^[\w-]{1,40}$/

/**
 * The runner's own notes, what the log and the coach read (`S.runProfile`): a goal in a line,
 * free notes (injuries, what works), and the pain areas every session asks about (`watch`).
 * A plain setting, stamped whole by the sync.
 */
export function readRunProfile(p) {
  if (!isMap(p)) return { goal: '', notes: '', watch: [] }
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const watch = Array.isArray(p.watch) ? [...new Set(p.watch.filter(a => PAIN_AREAS.includes(a)))] : []
  return { goal: text(p.goal, GOAL_MAX), notes: text(p.notes, PROFILE_TEXT_MAX), watch }
}

/** The id a run from a file gets here: its own, kept apart from the app's ids. */
export const importedRunId = id => 'j' + id

/**
 * A file's text read: { ok, profile, heightCm, shoes: [{ id, …shoe }], runs: [{ id, …activity }], skipped }
 * or { ok: false, error } for a file that is not one ('json' or 'schema').
 */
export function parseRunFile(text) {
  let doc
  try { doc = JSON.parse(String(text || '')) } catch { return { ok: false, error: 'json' } }
  if (!isMap(doc) || doc.schema !== RUN_SCHEMA) return { ok: false, error: 'schema' }
  let skipped = 0
  const shoes = []
  for (const s of Array.isArray(doc.shoes) ? doc.shoes : []) {
    const clean = ID.test(String(s?.id || '')) ? readShoe(s) : null
    if (clean) shoes.push({ id: s.id, ...clean }); else skipped++
  }
  const runs = []
  for (const r of (Array.isArray(doc.runs) ? doc.runs : []).slice(0, RUNS_MAX)) {
    const clean = ID.test(String(r?.id || '')) && RUN_SPORTS.has(r?.sport) ? readActivity({ ...r, src: 'import' }) : null
    if (clean) runs.push({ id: r.id, ...clean }); else skipped++
  }
  const h = Number(doc.profile?.heightCm)
  return { ok: true, profile: readRunProfile(doc.profile), heightCm: h >= 100 && h <= 250 ? Math.round(h) : null, shoes, runs, skipped }
}

/**
 * A parsed file into the profile (mutates S): new runs and pairs added, the rest left alone, the
 * profile's empty parts filled. Returns { runs, shoes, profile } with how many came in.
 */
export function applyRunFile(S, parsed, now = Date.now()) {
  const out = { runs: 0, shoes: 0, profile: false }
  if (!parsed?.ok) return out
  const shoes = isMap(S.shoes) ? { ...S.shoes } : {}
  for (const { id, ...s } of parsed.shoes) {
    if (Object.hasOwn(shoes, id)) continue
    shoes[id] = { ...s, _ts: now }
    out.shoes++
  }
  if (out.shoes) S.shoes = shoes
  const acts = isMap(S.activities) ? { ...S.activities } : {}
  for (const { id, ...r } of parsed.runs) {
    // A file this profile wrote itself (runFileOf) carries the ids it has here: those are the same runs.
    const key = importedRunId(id)
    if (Object.hasOwn(acts, id) || Object.hasOwn(acts, key)) continue
    const shoe = r.shoe && Object.hasOwn(shoes, r.shoe) ? r.shoe : undefined
    const { shoe: _drop, ...rest } = r
    acts[key] = { ...rest, ...(shoe ? { shoe } : {}), _ts: now }
    out.runs++
  }
  if (out.runs) S.activities = acts
  const had = readRunProfile(S.runProfile), p = parsed.profile
  const next = { goal: had.goal || p.goal, notes: had.notes || p.notes, watch: [...new Set([...had.watch, ...p.watch])] }
  if (JSON.stringify(next) !== JSON.stringify(had)) { S.runProfile = next; out.profile = true }
  if (parsed.heightCm && !(Number(S.heightCm) > 0)) S.heightCm = parsed.heightCm
  return out
}

/** The profile's running log as a file's object (runs, walks, shoes and the runner's notes). */
export function runFileOf(S) {
  const shoes = isMap(S?.shoes) ? S.shoes : {}
  return {
    schema: RUN_SCHEMA,
    profile: { ...readRunProfile(S?.runProfile), ...(Number(S?.heightCm) > 0 ? { heightCm: Number(S.heightCm) } : {}) },
    shoes: Object.entries(shoes).map(([id, e]) => { const s = readShoe(e); return s ? { id, ...s } : null }).filter(Boolean),
    runs: activitiesOf(S).filter(a => RUN_SPORTS.has(a.sport)).map(({ _ts, src, ...a }) => a),
  }
}
