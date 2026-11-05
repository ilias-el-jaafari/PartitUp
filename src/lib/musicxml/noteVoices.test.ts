import { describe, expect, it } from 'vitest'
import { resolveNoteVoices } from './noteVoices'

const MEI = `<mei><music><body><mdiv><score><section><measure>
  <staff n="1">
    <layer n="1"><note xml:id="s1" pname="c" oct="5"/></layer>
    <layer n="2"><note xml:id="a1" pname="g" oct="4"/></layer>
  </staff>
</measure></section></score></mdiv></body></music></mei>`

describe('resolveNoteVoices', () => {
  it('maps each layer to its voice and lets an override win', () => {
    const map = resolveNoteVoices(MEI, [
      { id: 'soprano', globalStaff: 1, layers: [1] },
      { id: 'alto', globalStaff: 1, layers: [2] },
    ], { s1: 'alto' })
    expect(map.s1).toBe('alto')
    expect(map.a1).toBe('alto')
  })
})
