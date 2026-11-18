import { describe, it, expect } from 'vitest'
import { readShoe, shoesOf, withShoe, defaultShoe, shoeWear, activeShoes, SHOE_MAX_KM } from './shoes.js'
import { mergeStates, STAMPED_MAPS } from './sync-merge.js'
import { STAMPED_MAPS as API_STAMPED_MAPS } from '../../../api/sync-stamps.js'

const S = {
  shoes: {
    a: { name: 'Road pair', km0: 20, _ts: 1 },
    b: { name: 'Old pair', max: 500, retired: true, _ts: 1 },
    c: { _ts: 2 },
  },
  activities: {
    r1: { d: '2026-11-01', sport: 'run', min: 30, km: 5, shoe: 'a', src: 'manual', _ts: 1 },
    r2: { d: '2026-11-03', sport: 'walk', min: 40, km: 3, shoe: 'a', src: 'manual', _ts: 1 },
    r3: { d: '2026-11-04', sport: 'run', min: 30, km: 4, shoe: 'b', src: 'manual', _ts: 1 },
  },
}

describe('shoes', () => {
  it('reads a pair and drops a broken one', () => {
    expect(readShoe({ name: '  Pair  ', km0: 12.34, max: 700 })).toEqual({ name: 'Pair', km0: 12.3, max: 700 })
    expect(readShoe({ name: '' })).toBe(null)
    expect(readShoe({ name: 'x', max: 10 })).toEqual({ name: 'x' })
  })

  it('adds the sessions in a pair to what it had', () => {
    const [a, b] = shoesOf(S)
    expect(a).toMatchObject({ id: 'a', km: 28, max: SHOE_MAX_KM, n: 2, last: '2026-11-03', retired: false })
    expect(b).toMatchObject({ id: 'b', km: 4, max: 500, retired: true })
    expect(shoesOf(S)).toHaveLength(2)
  })

  it('starts a new session in the pair last used', () => {
    expect(defaultShoe(S)).toBe('a')
    expect(activeShoes(S).map(s => s.id)).toEqual(['a'])
    expect(defaultShoe({})).toBe(null)
  })

  it('says when a pair is due', () => {
    expect(shoeWear({ km: 100, max: 600 })).toBe('ok')
    expect(shoeWear({ km: 520, max: 600 })).toBe('soon')
    expect(shoeWear({ km: 600, max: 600 })).toBe('due')
  })

  it('removes a pair with a stamped empty entry', () => {
    expect(withShoe(S.shoes, 'a', null, 9).a).toEqual({ _ts: 9 })
  })

  it('syncs per pair, the same on both sides', () => {
    expect(STAMPED_MAPS).toContain('shoes')
    expect(API_STAMPED_MAPS).toEqual(STAMPED_MAPS)
    const base = { _ts: 1, workouts: [], routines: [] }
    const local = { ...base, _ts: 5, shoes: { a: { name: 'Phone pair', _ts: 5 } } }
    const remote = { ...base, _ts: 6, shoes: { b: { name: 'Laptop pair', _ts: 6 } } }
    const merged = mergeStates(local, remote)
    expect(Object.keys(merged.shoes).sort()).toEqual(['a', 'b'])
  })
})
