// Apple Health's export (Health app → your picture → Export All Health Data) into the running log
// (v1.4.6, RadiGym): every run, walk and hike in it, with distance, time, climb, heart rate, steps
// and cadence when the export has them.
//
// The export is a zip (export.zip, often hundreds of MB, deflated) holding
// apple_health_export/export.xml; the xml alone works too. Nothing is ever read whole: the entry
// is found through the zip's central directory, inflated as a stream (DecompressionStream,
// 'deflate-raw') and scanned piece by piece for <Workout> elements, so a 2 GB export costs a few
// megabytes of memory. Everything else in it (heart rate samples, steps by the minute) is skipped.
//
// A workout here looks like (iOS 16 and later; older exports put the totals on the element):
//   <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="32.6" durationUnit="min"
//            sourceName="Apple Watch" startDate="2026-11-10 18:02:11 +0100" endDate="…">
//     <MetadataEntry key="HKElevationAscended" value="4200 cm"/>
//     <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="4.62" unit="km"/>
//     <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="151" unit="count/min"/>
//     <WorkoutStatistics type="HKQuantityTypeIdentifierStepCount" sum="5120" unit="count"/>
//   </Workout>
import { readActivity } from './activities.js'
import { hashId } from './weigh-ins.js'

const KIND = { Running: 'run', Walking: 'walk', Hiking: 'walk' }
const UNIT_MIN = { min: 1, s: 1 / 60, sec: 1 / 60, hr: 60, h: 60 }
const UNIT_KM = { km: 1, m: 0.001, mi: 1.609344, ft: 0.0003048, yd: 0.0009144 }
const UNIT_M = { cm: 0.01, m: 1, ft: 0.3048, km: 1000 }
const MIN_SEC = 120

const attr = (tag, name) => { const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null }
const dateOf = s => Date.parse(String(s || '').replace(' ', 'T').replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2'))

/**
 * One <Workout …>…</Workout> (or self-closed) element as a run or a walk to import, or null for
 * another sport, one under two minutes, or RadiGym's own.
 */
export function workoutFromXml(xml) {
  const open = /<Workout\s[^>]*>/.exec(xml)?.[0]
  if (!open) return null
  const type = String(attr(open, 'workoutActivityType') || '').replace(/^HKWorkoutActivityType/, '')
  const sport = KIND[type]
  if (!sport) return null
  if (/opengym|radigym/i.test(attr(open, 'sourceName') || '')) return null
  const start = dateOf(attr(open, 'startDate'))
  if (!Number.isFinite(start)) return null
  const dur = Number(attr(open, 'duration'))
  const sec = Number.isFinite(dur) ? Math.round(dur * 60 * (UNIT_MIN[attr(open, 'durationUnit') || 'min'] ?? 1)) : NaN
  if (!(sec >= MIN_SEC)) return null
  // Distance: the element's own total (older exports), else the statistics.
  let km = Number(attr(open, 'totalDistance')) * (UNIT_KM[attr(open, 'totalDistanceUnit') || 'km'] ?? 0)
  let hr = null, steps = null, elev = null
  for (const m of xml.matchAll(/<WorkoutStatistics\s[^>]*>/g)) {
    const tag = m[0]
    const t = attr(tag, 'type') || ''
    if (/DistanceWalkingRunning$/.test(t) && !(km > 0)) km = Number(attr(tag, 'sum')) * (UNIT_KM[attr(tag, 'unit')] ?? 0)
    else if (/HeartRate$/.test(t)) hr = Math.round(Number(attr(tag, 'average')))
    else if (/StepCount$/.test(t)) steps = Math.round(Number(attr(tag, 'sum')))
  }
  const elevTag = /<MetadataEntry\s[^>]*key="HKElevationAscended"[^>]*>/.exec(xml)?.[0]
  if (elevTag) {
    const [n, u] = String(attr(elevTag, 'value') || '').split(/\s+/)
    const v = Number(n) * (UNIT_M[u] ?? 0)
    if (v >= 0) elev = Math.round(v)
  }
  const cad = steps > 0 ? Math.round(steps / (sec / 60)) : null
  const d = String(attr(open, 'startDate') || '').slice(0, 10)
  const a = readActivity({ d, sport, sec, min: Math.max(1, Math.round(sec / 60)), at: start, km: km > 0 ? km : 0, hr, steps, cad, elev, title: sport === 'run' ? 'Run' : type === 'Hiking' ? 'Hike' : 'Walk', src: 'ah' })
  return a ? { id: 'h' + hashId(`${start}|${sport}|${Math.round(sec / 60)}`), ...a, src: 'import' } : null
}

/**
 * The scanner: feed it the xml in pieces of any size (`push`), get the workouts found so far
 * (`take`). Keeps only the unfinished tail between pieces.
 */
export function workoutScanner() {
  let buf = ''
  const found = []
  return {
    push(text) {
      buf += text
      for (;;) {
        const s = buf.indexOf('<Workout ')
        if (s < 0) { buf = buf.slice(-16); return }
        const openEnd = buf.indexOf('>', s)
        if (openEnd < 0) { buf = buf.slice(s); return }
        let end
        if (buf[openEnd - 1] === '/') end = openEnd + 1
        else {
          const close = buf.indexOf('</Workout>', openEnd)
          if (close < 0) { buf = buf.slice(s); return }
          end = close + '</Workout>'.length
        }
        const w = workoutFromXml(buf.slice(s, end))
        if (w) found.push(w)
        buf = buf.slice(end)
      }
    },
    take() { return found.splice(0) },
  }
}

/* ------------------------------------------------------------------ the file ---- */

const u16 = (b, o) => b[o] | (b[o + 1] << 8)
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
const bytesOf = async blob => new Uint8Array(await blob.arrayBuffer())

/** Where export.xml sits in the zip: { start, size, method }, or null. Reads the central directory only. */
export async function findExportXml(file) {
  const tailLen = Math.min(file.size, 65557)
  const tail = await bytesOf(file.slice(file.size - tailLen))
  let eocd = -1
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) return null
  const cdSize = u32(tail, eocd + 12), cdOff = u32(tail, eocd + 16)
  if (cdOff === 0xffffffff) throw new Error('zip64')
  const cd = await bytesOf(file.slice(cdOff, cdOff + cdSize))
  for (let p = 0; p + 46 <= cd.length && u32(cd, p) === 0x02014b50;) {
    const method = u16(cd, p + 10), comp = u32(cd, p + 20), nameLen = u16(cd, p + 28), extraLen = u16(cd, p + 30), commLen = u16(cd, p + 32)
    const local = u32(cd, p + 42)
    const name = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nameLen))
    if (/(^|\/)export\.xml$/.test(name) && !/__MACOSX/.test(name)) {
      if (comp === 0xffffffff || local === 0xffffffff) throw new Error('zip64')
      const lh = await bytesOf(file.slice(local, local + 30))
      const start = local + 30 + u16(lh, 26) + u16(lh, 28)
      return { start, size: comp, method }
    }
    p += 46 + nameLen + extraLen + commLen
  }
  return null
}

/** The export's xml as a text stream, from export.zip or export.xml. */
export async function exportTextStream(file) {
  const head = await bytesOf(file.slice(0, 4))
  if (u32(head, 0) !== 0x04034b50) return file.stream().pipeThrough(new TextDecoderStream())
  const at = await findExportXml(file)
  if (!at) throw new Error('noExport')
  const raw = file.slice(at.start, at.start + at.size).stream()
  if (at.method === 0) return raw.pipeThrough(new TextDecoderStream())
  if (at.method !== 8 || typeof DecompressionStream !== 'function') throw new Error('unsupported')
  return raw.pipeThrough(new DecompressionStream('deflate-raw')).pipeThrough(new TextDecoderStream())
}

/**
 * Every run and walk in an Apple Health export file. `onProgress(found)` is told as they come.
 * Resolves with the list; rejects with 'zip64', 'noExport' or 'unsupported' for a file it cannot read.
 */
export async function readHealthExport(file, onProgress = () => {}) {
  const stream = await exportTextStream(file)
  const scan = workoutScanner()
  const all = []
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    scan.push(value)
    const got = scan.take()
    if (got.length) { all.push(...got); onProgress(all.length) }
  }
  return all
}
