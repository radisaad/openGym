import { describe, it, expect } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { workoutFromXml, workoutScanner, readHealthExport, findExportXml } from './health-export.js'

const RUN = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="32.6667" durationUnit="min" sourceName="Apple Watch" startDate="2026-11-10 18:02:11 +0100" endDate="2026-11-10 18:34:51 +0100">
  <MetadataEntry key="HKElevationAscended" value="4200 cm"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="x" sum="4.62" unit="km"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="151.4" unit="count/min"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierStepCount" sum="4900" unit="count"/>
 </Workout>`
const WALK_OLD = `<Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="21.1" durationUnit="min" totalDistance="1.81" totalDistanceUnit="km" sourceName="iPhone" startDate="2026-11-06 09:00:00 +0100" endDate="x"/>`
const RIDE = `<Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="60" durationUnit="min" sourceName="x" startDate="2026-11-07 09:00:00 +0100" endDate="x"></Workout>`
const OWN = RUN.replace('Apple Watch', 'RadiGym')

describe('one workout', () => {
  it('reads a run with its distance, climb, heart rate, steps and cadence', () => {
    const w = workoutFromXml(RUN)
    expect(w).toMatchObject({ d: '2026-11-10', sport: 'run', sec: 1960, min: 33, km: 4.62, elev: 42, hr: 151, steps: 4900, cad: 150, src: 'import' })
    expect(w.id).toMatch(/^h/)
  })

  it('reads an older export’s walk, from the element’s own totals', () => {
    expect(workoutFromXml(WALK_OLD)).toMatchObject({ sport: 'walk', km: 1.81, sec: 1266 })
  })

  it('leaves out other sports and the app’s own records', () => {
    expect(workoutFromXml(RIDE)).toBe(null)
    expect(workoutFromXml(OWN)).toBe(null)
  })
})

describe('the scanner', () => {
  it('finds workouts across pieces of any size, skipping everything else', () => {
    const xml = `<HealthData><Record type="HKQuantityTypeIdentifierStepCount" value="10"/>${RUN}<Record x="1"/>${WALK_OLD}${RIDE}</HealthData>`
    for (const size of [1, 7, 50, xml.length]) {
      const scan = workoutScanner()
      const out = []
      for (let i = 0; i < xml.length; i += size) { scan.push(xml.slice(i, i + size)); out.push(...scan.take()) }
      expect(out.map(w => w.sport)).toEqual(['run', 'walk'])
    }
  })
})

// A one-entry zip as Apple writes it: deflated, sizes in the central directory.
function zipOf(name, text) {
  const data = new TextEncoder().encode(text)
  const comp = deflateRawSync(data)
  const nm = new TextEncoder().encode(name)
  const local = new Uint8Array(30 + nm.length)
  const dv = new DataView(local.buffer)
  dv.setUint32(0, 0x04034b50, true); dv.setUint16(8, 8, true); dv.setUint16(26, nm.length, true)
  local.set(nm, 30)
  const cd = new Uint8Array(46 + nm.length)
  const cv = new DataView(cd.buffer)
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 8, true); cv.setUint32(20, comp.length, true); cv.setUint32(24, data.length, true)
  cv.setUint16(28, nm.length, true); cv.setUint32(42, 0, true)
  cd.set(nm, 46)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true)
  ev.setUint32(12, cd.length, true); ev.setUint32(16, local.length + comp.length, true)
  return new Blob([local, comp, cd, eocd])
}

describe('the file', () => {
  it('finds export.xml in the zip and reads its runs and walks', async () => {
    const zip = zipOf('apple_health_export/export.xml', `<HealthData>${RUN}${WALK_OLD}${RIDE}</HealthData>`)
    expect(await findExportXml(zip)).toMatchObject({ method: 8 })
    const seen = []
    const list = await readHealthExport(zip, n => seen.push(n))
    expect(list.map(w => w.sport)).toEqual(['run', 'walk'])
    expect(seen.at(-1)).toBe(2)
  })

  it('reads a bare export.xml too', async () => {
    const list = await readHealthExport(new Blob([`<HealthData>${RUN}</HealthData>`]))
    expect(list).toHaveLength(1)
  })

  it('says so for a zip without an export in it', async () => {
    await expect(readHealthExport(zipOf('other.txt', 'hello'))).rejects.toThrow('noExport')
  })
})
