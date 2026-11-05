import { describe, expect, it } from 'vitest'
import { meiToMusicXml, musicXmlForDownload } from './meiToMusicXml'

const MEI = `<?xml version="1.0"?>
<mei>
  <music><body><mdiv><score>
    <scoreDef><staffGrp>
      <staffDef n="1">
        <label>Soprano</label>
        <clef shape="G" line="2"/>
        <keySig sig="0"/>
        <meterSig count="4" unit="4"/>
      </staffDef>
    </staffGrp></scoreDef>
    <section><measure>
      <staff n="1"><layer n="1">
        <note xml:id="n1" dur="4" oct="5" pname="d"/>
        <rest xml:id="r1" dur="4"/>
      </layer></staff>
    </measure></section>
  </score></mdiv></body></music>
</mei>`

describe('musicXml export', () => {
  it('keeps the original MusicXML when nothing was edited', () => {
    const original = '<score-partwise version="4.0"></score-partwise>'
    expect(musicXmlForDownload({
      originalXml: original,
      originalMei: MEI,
      editedMei: null,
      overrides: {},
      voices: [],
    })).toBe(original)
  })

  it('exports the corrected pitch and the rest', () => {
    const xml = meiToMusicXml(MEI, { title: 'Ensayo' })
    expect(xml).toContain('<step>D</step>')
    expect(xml).toContain('<octave>5</octave>')
    expect(xml).toContain('<rest/>')
    expect(xml).toContain('Soprano')
    expect(xml).toContain('Ensayo')
  })

  it('uses the edited MEI instead of the original file', () => {
    const edited = MEI.replace('pname="d"', 'pname="e"')
    const xml = musicXmlForDownload({
      originalXml: '<score-partwise><note><step>D</step></note></score-partwise>',
      originalMei: MEI,
      editedMei: edited,
      overrides: {},
      voices: [],
    })
    expect(xml).toContain('<step>E</step>')
    expect(xml).not.toContain('<step>D</step>')
  })
})
