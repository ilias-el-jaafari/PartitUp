import { describe, expect, it } from 'vitest'
import { prepareChoirScore } from './prepareChoirScore'

function score(parts: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>${parts}</part-list>
  ${body}
</score-partwise>`
}

describe('prepareChoirScore', () => {
  it('releases a damper pedal that was never lifted', () => {
    const xml = score(
      '<score-part id="P1"><part-name>Soprano</part-name></score-part>',
      `<part id="P1"><measure number="1">
        <direction><direction-type><pedal type="start"/></direction-type><sound damper-pedal="yes"/></direction>
        <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice></note>
      </measure></part>`,
    )
    const out = prepareChoirScore(xml)
    expect(out).not.toContain('pedal')
    expect(out).not.toContain('damper-pedal')
    expect(out).toContain('<step>C</step>')
  })

  it('uses the printed metronome instead of leaving the tempo unset', () => {
    const xml = score(
      '<score-part id="P1"><part-name>Soprano</part-name></score-part>',
      `<part id="P1"><measure number="1">
        <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>96</per-minute></metronome></direction-type></direction>
        <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration></note>
      </measure></part>`,
    )
    expect(prepareChoirScore(xml)).toContain('tempo="96"')
  })

  it('keeps soprano and alto and drops a piano staff that has no lyrics', () => {
    const xml = score(
      `<score-part id="P1"><part-name>Piano</part-name></score-part>`,
      `<part id="P1">
        <measure number="1">
          <attributes>
            <divisions>1</divisions>
            <staves>3</staves>
            <clef number="1"><sign>G</sign><line>2</line></clef>
            <clef number="2"><sign>G</sign><line>2</line></clef>
            <clef number="3"><sign>F</sign><line>4</line></clef>
          </attributes>
          <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><staff>1</staff><lyric><text>Voix</text></lyric></note>
          <backup><duration>1</duration></backup>
          <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><staff>2</staff><lyric><text>Voix</text></lyric></note>
          <backup><duration>1</duration></backup>
          <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><staff>3</staff></note>
        </measure>
      </part>`,
    )
    const out = prepareChoirScore(xml)
    expect(out.match(/<part /g)?.length).toBe(2)
    expect(out).toContain('<step>C</step>')
    expect(out).toContain('<step>G</step>')
    expect(out).not.toContain('<octave>3</octave>')
  })
})
