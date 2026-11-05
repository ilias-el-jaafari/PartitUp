import { describe, expect, it } from 'vitest'
import { deleteNotesToRests, restsToNotes, transposeNotesDiatonic } from './meiNoteEditor'

const MEI = `<?xml version="1.0"?>
<mei>
  <music><body><mdiv><score>
    <section><measure>
      <staff n="1"><layer n="1">
        <note xml:id="n1" dur="4" oct="5" pname="c"/>
        <note xml:id="n2" dur="4" oct="4" pname="b"/>
        <rest xml:id="r1" dur="4"/>
      </layer></staff>
    </measure></section>
  </score></mdiv></body></music>
</mei>`

function attr(xml: string, id: string, name: string): string | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const el = Array.from(doc.getElementsByTagName('*')).find((node) => node.getAttribute('xml:id') === id)
  return el?.getAttribute(name) ?? null
}

describe('mei note editor', () => {
  it('moves a note up one diatonic step and spells the flat in one flat', () => {
    const next = transposeNotesDiatonic(MEI, ['n2'], 1, -1)
    expect(attr(next, 'n2', 'pname')).toBe('c')
    expect(attr(next, 'n2', 'oct')).toBe('5')
  })

  it('wraps C up to D and C down across the octave', () => {
    const up = transposeNotesDiatonic(MEI, ['n1'], 1, 0)
    expect(attr(up, 'n1', 'pname')).toBe('d')
    expect(attr(up, 'n1', 'oct')).toBe('5')
    const down = transposeNotesDiatonic(MEI, ['n1'], -1, 0)
    expect(attr(down, 'n1', 'pname')).toBe('b')
    expect(attr(down, 'n1', 'oct')).toBe('4')
  })

  it('turns a note into a rest and a rest into a nearby note', () => {
    const removed = deleteNotesToRests(MEI, ['n1'])
    expect(removed).not.toContain('xml:id="n1"')
    expect(removed).toContain('<rest')
    const added = restsToNotes(MEI, ['r1'], 0)
    expect(added).toContain('<note')
    expect(added).not.toContain('xml:id="r1"')
  })
})
