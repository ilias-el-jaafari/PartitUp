import { describe, expect, it } from 'vitest'
import { listNoteOns, midiFromNotes, rewriteMidiChannels } from './midiChannels'

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
})
