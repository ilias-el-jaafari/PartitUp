import { describe, expect, it } from 'vitest'
import { listNoteOns, midiFromNotes, rewriteMidiChannels, withoutSustainPedal } from './midiChannels'

describe('rewriteMidiChannels', () => {
  it('moves a note onto the voice channel so solo can separate divisi', () => {
    const midi = midiFromNotes(480, [
      { tick: 0, pitch: 60, channel: 0, duration: 480 },
      { tick: 0, pitch: 72, channel: 0, duration: 480 },
    ])
    const result = rewriteMidiChannels({
      midiBase64: midi,
      notes: [
        { id: 'low', qstamp: 0, pitch: 60 },
        { id: 'high', qstamp: 0, pitch: 72 },
      ],
      noteVoices: { low: 'alto', high: 'soprano' },
      voiceChannels: { alto: 1, soprano: 0 },
      fallbackMidiBase64: midi,
      fallbackChannelMap: { alto: 0, soprano: 0 },
    })
    expect(result.rewritten).toBe(true)
    const ons = listNoteOns(result.midiBase64)
    expect(ons.find((n) => n.pitch === 60)?.channel).toBe(1)
    expect(ons.find((n) => n.pitch === 72)?.channel).toBe(0)
  })

  it('keeps the fallback MIDI when almost nothing matches', () => {
    const midi = midiFromNotes(480, [{ tick: 0, pitch: 60, channel: 0, duration: 480 }])
    const fallback = midiFromNotes(480, [{ tick: 0, pitch: 40, channel: 3, duration: 120 }])
    const result = rewriteMidiChannels({
      midiBase64: midi,
      notes: [
        { id: 'a', qstamp: 4, pitch: 80 },
        { id: 'b', qstamp: 8, pitch: 81 },
      ],
      noteVoices: { a: 's', b: 's' },
      voiceChannels: { s: 2 },
      fallbackMidiBase64: fallback,
      fallbackChannelMap: { s: 3 },
    })
    expect(result.rewritten).toBe(false)
    expect(result.midiBase64).toBe(fallback)
    expect(result.channelMap).toEqual({ s: 3 })
  })

  it('leaves an unmatched choir note audible instead of parking it on the drum channel', () => {
    const midi = midiFromNotes(480, [
      { tick: 0, pitch: 60, channel: 0, duration: 480 },
      { tick: 0, pitch: 48, channel: 2, duration: 480 },
    ])
    const result = rewriteMidiChannels({
      midiBase64: midi,
      notes: [{ id: 'n', qstamp: 0, pitch: 60 }],
      noteVoices: { n: 's' },
      voiceChannels: { s: 1 },
      fallbackMidiBase64: midi,
      fallbackChannelMap: { s: 0 },
    })
    const ons = listNoteOns(result.midiBase64)
    expect(ons.find((n) => n.pitch === 60)?.channel).toBe(1)
    expect(ons.find((n) => n.pitch === 48)?.channel).toBe(2)
  })

  it('removes a stuck sustain pedal', () => {
    const body = [0x00, 0xb0, 64, 127, 0x00, 0x90, 60, 90, 0x83, 0x60, 0x80, 60, 0x00, 0x00, 0xff, 0x2f, 0x00]
    const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0]
    const trackHead = [0x4d, 0x54, 0x72, 0x6b, (body.length >>> 24) & 0xff, (body.length >>> 16) & 0xff, (body.length >>> 8) & 0xff, body.length & 0xff]
    const bytes = new Uint8Array([...header, ...trackHead, ...body])
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const midi = btoa(binary)
    const cleaned = atob(withoutSustainPedal(midi))
    expect(cleaned.includes(String.fromCharCode(0xb0, 64, 127))).toBe(false)
    expect(listNoteOns(withoutSustainPedal(midi)).map((note) => note.pitch)).toEqual([60])
  })
})
