import { describe, it, expect } from 'vitest'
import { brandWith, NAME } from './brand.js'

describe('the app name', () => {
  it('is RadiGym', () => {
    expect(NAME).toBe('RadiGym')
  })

  it('replaces the upstream name in a sentence, every time it appears', () => {
    expect(brandWith('openGym could not start. Reload openGym.', NAME)).toBe('RadiGym could not start. Reload RadiGym.')
  })

  it('leaves links and other spellings alone', () => {
    expect(brandWith('See opengym.ch', NAME)).toBe('See opengym.ch')
    expect(brandWith(undefined, NAME)).toBe(undefined)
  })
})
