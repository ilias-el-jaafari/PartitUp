import { describe, expect, it } from 'vitest'
import { findSuspectNotes } from './suspectNotes'

function layer(notes: string): string {
  return `<mei><music><body><mdiv><score><section><measure>
    <staff n="1"><layer n="1">${notes}</layer></staff>
  </measure></section></score></mdiv></body></music></mei>`
}

describe('findSuspectNotes', () => {
  it('flags an isolated octave jump and suggests bringing it back', () => {
    const mei = layer(`
      <note xml:id="a" pname="c" oct="5"/>
      <note xml:id="b" pname="c" oct="6"/>
      <note xml:id="c" pname="c" oct="5"/>
    `)
    const suspects = findSuspectNotes(mei)
    expect(suspects).toHaveLength(1)
    expect(suspects[0].id).toBe('b')
    expect(suspects[0].steps).toBe(-7)
  })

  it('ignores a real leap that does not return', () => {
    const mei = layer(`
      <note xml:id="a" pname="c" oct="4"/>
      <note xml:id="b" pname="c" oct="5"/>
      <note xml:id="c" pname="d" oct="5"/>
    `)
    expect(findSuspectNotes(mei)).toEqual([])
  })
})
