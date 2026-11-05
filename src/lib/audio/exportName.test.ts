import { describe, expect, it } from 'vitest'
import { buildWavFilename } from './exportName'

describe('buildWavFilename', () => {
  it('includes the score, the sung voice and the date', () => {
    const name = buildWavFilename('Ave María.pdf', 'Soprano 1', new Date('2026-11-05T12:00:00Z'))
    expect(name).toBe('Ave-Maria-Soprano-1-2026-11-05.wav')
  })

  it('uses tutti when nobody is solo', () => {
    const name = buildWavFilename(null, null, new Date('2026-01-02T00:00:00Z'))
    expect(name).toBe('ensayo-tutti-2026-01-02.wav')
  })
})
