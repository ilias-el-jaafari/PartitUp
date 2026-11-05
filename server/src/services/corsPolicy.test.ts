import { describe, expect, it } from 'vitest'
import { isOriginAllowed } from './corsPolicy.js'

describe('isOriginAllowed', () => {
  it('allows the production app, local dev, and same-origin requests', () => {
    expect(isOriginAllowed(undefined)).toBe(true)
    expect(isOriginAllowed('https://partit-up.vercel.app')).toBe(true)
    expect(isOriginAllowed('http://localhost:5173')).toBe(true)
  })

  it('allows Vercel previews of this project only', () => {
    expect(isOriginAllowed('https://partit-up-git-feature-user.vercel.app')).toBe(true)
    expect(isOriginAllowed('https://evil.vercel.app')).toBe(false)
    expect(isOriginAllowed('https://example.com')).toBe(false)
  })
})
