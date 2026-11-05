import { describe, expect, it } from 'vitest'
import { mergeMusicXmlPages } from './musicxmlMerger.js'

const page = (partId: string, measure: string, pitch: string) => `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="${partId}"><part-name>Soprano</part-name></score-part></part-list>
  <part id="${partId}">
    <measure number="${measure}"><note><pitch><step>${pitch}</step><octave>5</octave></pitch><duration>1</duration></note></measure>
  </part>
</score-partwise>`

describe('mergeMusicXmlPages', () => {
  it('appends measures when later pages rename the part id', () => {
    const merged = mergeMusicXmlPages([
      page('P1', '1', 'C'),
      page('V1', '1', 'D'),
    ])
    expect(merged).toContain('<step>C</step>')
    expect(merged).toContain('<step>D</step>')
    expect(merged.match(/<measure /g)?.length).toBe(2)
    expect(merged).toContain('number="2"')
  })
})
