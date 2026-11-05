import { describe, expect, it } from 'vitest'
import { allowHit } from './rateLimit.js'

describe('allowHit', () => {
  it('blocks once the window is full and allows again after it slides', () => {
    const store = new Map()
    expect(allowHit(store, 'a', 2, 1_000, 0)).toBe(true)
    expect(allowHit(store, 'a', 2, 1_000, 10)).toBe(true)
    expect(allowHit(store, 'a', 2, 1_000, 20)).toBe(false)
    expect(allowHit(store, 'a', 2, 1_000, 1_010)).toBe(true)
  })
})
