import { describe, expect, it } from 'vitest'
import { chooseEngine } from './engineStrategy.js'

describe('chooseEngine', () => {
  const both = { audiverisAvailable: true, oemerAvailable: true }

  it('uses Audiveris first for PDF scores and falls back to oemer', () => {
    expect(chooseEngine({ configured: 'auto', inputKind: 'pdf', ...both })).toEqual({
      primary: 'audiveris',
      fallback: 'oemer',
    })
  })

  it('uses oemer first for photos', () => {
    expect(chooseEngine({ configured: 'auto', inputKind: 'image', ...both })).toEqual({
      primary: 'oemer',
      fallback: 'audiveris',
    })
  })

  it('honors an explicit engine and can disable fallback', () => {
    expect(chooseEngine({
      configured: 'audiveris',
      inputKind: 'image',
      allowFallback: false,
      ...both,
    })).toEqual({ primary: 'audiveris', fallback: null })
  })

  it('falls through when the preferred engine is not installed', () => {
    expect(chooseEngine({
      configured: 'auto',
      inputKind: 'pdf',
      audiverisAvailable: false,
      oemerAvailable: true,
    })).toEqual({ primary: 'oemer', fallback: null })
  })
})
