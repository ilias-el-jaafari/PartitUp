import { describe, expect, it } from 'vitest'
import { cleanupMusicXml, isGarbageLyricText } from './musicxmlCleanup.js'

function satbWithNoise(): string {
  const voice1 = Array.from({ length: 8 }, (_, i) => `
    <note>
      <pitch><step>C</step><octave>5</octave></pitch>
      <duration>1</duration><voice>1</voice><type>quarter</type>
      <lyric number="1"><syllabic>single</syllabic><text>a</text></lyric>
      <lyric number="2"><text>m</text></lyric>
    </note>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Soprano</part-name></score-part>
    <score-part id="P2"><part-name>Alto</part-name></score-part>
    <score-part id="P9"><part-name>Speck</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>
      ${voice1}
      <note>
        <chord/>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>1</duration><voice>1</voice>
      </note>
      <backup><duration>8</duration></backup>
      <note>
        <pitch><step>G</step><octave>5</octave></pitch>
        <duration>1</duration><voice>2</voice>
      </note>
      <forward><duration>8</duration></forward>
      <note>
        <pitch><step>D</step><octave>5</octave></pitch>
        <duration>1</duration><voice>2</voice>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      ${Array.from({ length: 20 }, () => `<note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>`).join('')}
    </measure>
  </part>
  <part id="P9">
    <measure number="1">
      <note><pitch><step>C</step><octave>6</octave></pitch><duration>1</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`
}

describe('isGarbageLyricText', () => {
  it('drops specks and keeps real syllables, including a lone vowel', () => {
    expect(isGarbageLyricText('m')).toBe(true)
    expect(isGarbageLyricText("'")).toBe(true)
    expect(isGarbageLyricText('')).toBe(true)
    expect(isGarbageLyricText('a')).toBe(false)
    expect(isGarbageLyricText('amá')).toBe(false)
  })
})

describe('cleanupMusicXml', () => {
  it('removes chords, junk lyrics, harmony, tiny parts, and spurious extra voices', () => {
    const out = cleanupMusicXml(satbWithNoise())
    expect(out).not.toContain('<harmony>')
    expect(out).not.toContain('<chord')
    expect(out).not.toContain('>m</text>')
    expect(out).toContain('>a</text>')
    expect(out).not.toContain('id="P9"')
    expect(out).not.toContain('<step>G</step>')
    expect(out).toContain('<step>D</step>')
    expect(out).not.toContain('<voice>2</voice>')
  })

  it('leaves an already clean MusicXML part structure in place', () => {
    const xml = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Soprano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice>
      <lyric><text>luz</text></lyric></note>
  </measure></part>
</score-partwise>`
    const out = cleanupMusicXml(xml)
    expect(out).toContain('id="P1"')
    expect(out).toContain('<step>C</step>')
    expect(out).toContain('luz')
  })
})
