import { describe, expect, it } from 'vitest'
import { VoiceType } from '../../types/voice'
import { analyzeVoices, stripNonVocalParts } from './voiceIdentifier'

function line(step: string, octave: number, count: number, voice = 1): string {
  return Array.from({ length: count }, () =>
    `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>1</duration><voice>${voice}</voice></note>`
  ).join('')
}

function score(parts: { id: string; name: string; body: string }[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    ${parts.map((p) => `<score-part id="${p.id}"><part-name>${p.name}</part-name></score-part>`).join('')}
  </part-list>
  ${parts.map((p) => `<part id="${p.id}"><measure number="1">${p.body}</measure></part>`).join('')}
</score-partwise>`
}

describe('analyzeVoices', () => {
  it('trusts SATB part names even when the tenor is written in treble', () => {
    const xml = score([
      { id: 'P1', name: 'Soprano', body: line('C', 5, 8) },
      { id: 'P2', name: 'Alto', body: line('G', 4, 8) },
      { id: 'P3', name: 'Tenor', body: line('D', 5, 8) },
      { id: 'P4', name: 'Bass', body: line('G', 3, 8) },
    ])
    const analysis = analyzeVoices(xml)
    const tenor = analysis.voices.find((v) => v.label === 'Tenor')
    expect(tenor?.type).toBe(VoiceType.TENOR_1)
    expect(analysis.ensemble).toBe('SATB')
    expect(analysis.needsDisambiguation).toBe(false)
    expect(analysis.voices.map((v) => v.type)).toEqual([
      VoiceType.TENOR_1,
      VoiceType.SOPRANO_1,
      VoiceType.CONTRALTO_1,
      VoiceType.BAJO_1,
    ])
  })

  it('reads an unnamed high trio as SSA, not SAB', () => {
    const xml = score([
      { id: 'P1', name: 'Part-1', body: line('D', 5, 8) },
      { id: 'P2', name: 'Part-2', body: line('A', 4, 8) },
      { id: 'P3', name: 'Part-3', body: line('F', 4, 8) },
    ])
    const analysis = analyzeVoices(xml)
    expect(analysis.ensemble).toBe('SSA')
    expect(analysis.voices.map((v) => v.type)).toEqual([
      VoiceType.SOPRANO_1,
      VoiceType.SOPRANO_2,
      VoiceType.CONTRALTO_1,
    ])
  })

  it('reads a low quartet as TTBB', () => {
    const xml = score([
      { id: 'P1', name: 'Part-1', body: line('C', 4, 8) },
      { id: 'P2', name: 'Part-2', body: line('G', 3, 8) },
      { id: 'P3', name: 'Part-3', body: line('E', 3, 8) },
      { id: 'P4', name: 'Part-4', body: line('C', 3, 8) },
    ])
    const analysis = analyzeVoices(xml)
    expect(analysis.ensemble).toBe('TTBB')
    expect(analysis.voices.map((v) => v.type)).toEqual([
      VoiceType.TENOR_1,
      VoiceType.TENOR_2,
      VoiceType.BAJO_1,
      VoiceType.BAJO_2,
    ])
  })

  it('merges a handful of misread notes into the real voice', () => {
    const xml = score([
      { id: 'P1', name: 'Soprano', body: line('C', 5, 20, 1) + line('E', 5, 2, 2) },
      { id: 'P2', name: 'Alto', body: line('G', 4, 20) },
      { id: 'P3', name: 'Tenor', body: line('E', 3, 20) },
      { id: 'P4', name: 'Bass', body: line('C', 3, 20) },
    ])
    const analysis = analyzeVoices(xml)
    expect(analysis.voices).toHaveLength(4)
    expect(analysis.voices.find((v) => v.partIds.includes('P1'))?.layers).toContain(2)
  })

  it('keeps real divisi when both layers have a full line', () => {
    const xml = score([
      { id: 'P1', name: 'Soprano', body: line('C', 5, 16, 1) + line('G', 4, 16, 2) },
    ])
    const analysis = analyzeVoices(xml)
    expect(analysis.voices).toHaveLength(2)
    expect(analysis.voices.map((v) => v.globalStaff)).toEqual([1, 1])
  })
})

describe('stripNonVocalParts', () => {
  it('drops the piano and leaves the sung parts', () => {
    const xml = score([
      { id: 'P1', name: 'Soprano', body: line('C', 5, 4) },
      { id: 'P2', name: 'Piano', body: line('C', 3, 4) },
    ])
    const stripped = stripNonVocalParts(xml)
    expect(stripped).toContain('Soprano')
    expect(stripped).not.toContain('Piano')
  })

  it('returns the original string when every part is vocal', () => {
    const xml = score([{ id: 'P1', name: 'Soprano', body: line('C', 5, 2) }])
    expect(stripNonVocalParts(xml)).toBe(xml)
  })
})
