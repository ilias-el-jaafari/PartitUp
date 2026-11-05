import { describe, expect, it } from 'vitest'
import { normalizeChoirRhythm } from './choirRhythm'

function score(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Alto</part-name></score-part></part-list>
  <part id="P1">${inner}</part>
</score-partwise>`
}

function note(step: string, dur: number, type: string, extra = ''): string {
  return `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${dur}</duration><voice>1</voice><type>${type}</type>${extra}</note>`
}

describe('normalizeChoirRhythm', () => {
  it('holds a short 3/4 note to the barline instead of leaving a silent beat', () => {
    const xml = score(`
      <measure number="1">
        <attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
        ${note('G', 4, 'half')}
      </measure>`)
    const out = normalizeChoirRhythm(xml)
    expect(out).toContain('<duration>6</duration>')
    expect(out).toContain('<type>half</type>')
    expect(out).toContain('<dot')
  })

  it('leaves a bar that already fills 3/4 alone', () => {
    const body = [
      note('B', 2, 'quarter'),
      note('A', 1, 'eighth'),
      note('B', 1, 'eighth'),
      note('G', 2, 'quarter'),
    ].join('')
    const xml = score(`<measure number="1"><attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${body}</measure>`)
    const out = normalizeChoirRhythm(xml)
    expect(out.match(/<duration>2<\/duration>/g)?.length).toBe(2)
    expect(out.match(/<duration>1<\/duration>/g)?.length).toBe(2)
    expect(out).not.toContain('<dot')
  })

  it('drops a tie that would keep ringing across a rest', () => {
    const tied = '<tie type="start"/><notations><tied type="start"/></notations>'
    const stop = '<tie type="stop"/><notations><tied type="stop"/></notations>'
    const xml = score(`
      <measure number="1">
        <attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
        ${note('G', 6, 'half', '<dot/>' + tied)}
      </measure>
      <measure number="2">
        <note><rest/><duration>6</duration><voice>1</voice><type>half</type><dot/></note>
      </measure>
      <measure number="3">
        ${note('G', 4, 'half', stop)}
      </measure>`)
    const out = normalizeChoirRhythm(xml)
    expect(out).not.toContain('tie')
    expect(out).not.toContain('tied')
  })

  it('keeps a tie between two notes that meet on the beat', () => {
    const start = '<tie type="start"/><notations><tied type="start"/></notations>'
    const stop = '<tie type="stop"/><notations><tied type="stop"/></notations>'
    const xml = score(`
      <measure number="1">
        <attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
        ${note('D', 6, 'half', '<dot/>' + start)}
      </measure>
      <measure number="2">
        ${note('D', 6, 'half', '<dot/>' + stop)}
      </measure>`)
    const out = normalizeChoirRhythm(xml)
    expect(out).toContain('type="start"')
    expect(out).toContain('type="stop"')
  })
})
