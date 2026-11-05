export interface SoundingNote {
  id: string
  qstamp: number
  pitch: number
}

export interface ChannelRewrite {
  midiBase64: string
  /** voice id → MIDI channel actually used in the returned file. */
  channelMap: Record<string, number>
  rewritten: boolean
}

interface PracticeNote {
  tick: number
  pitch: number
  channel: number
}

interface RawEvent {
  tick: number
  data: number[]
  note?: { kind: 'on' | 'off'; channel: number; pitch: number; pair: number }
}

function encodeVlq(value: number): number[] {
  let n = Math.max(0, value)
  const bytes = [n & 0x7f]
  n >>= 7
  while (n > 0) {
    bytes.push((n & 0x7f) | 0x80)
    n >>= 7
  }
  return bytes.reverse()
}

function decodeMidi(base64: string): { ppq: number; tracks: RawEvent[][] } | null {
  let bytes: Uint8Array
  try {
    const binary = atob(base64)
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  } catch {
    return null
  }
  if (bytes.length < 14) return null
  const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (header !== 'MThd') return null
  const ppq = (bytes[12] << 8) | bytes[13]
  if (ppq <= 0 || ppq >= 0x8000) return null

  const tracks: RawEvent[][] = []
  let pos = 14
  let pair = 0
  while (pos + 8 <= bytes.length) {
    const type = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3])
    const len = (bytes[pos + 4] << 24) | (bytes[pos + 5] << 16) | (bytes[pos + 6] << 8) | bytes[pos + 7]
    pos += 8
    if (pos + len > bytes.length) return null
    const data = bytes.subarray(pos, pos + len)
    pos += len
    if (type !== 'MTrk') continue
    const events: RawEvent[] = []
    let p = 0
    let tick = 0
    let running = 0
    const open: Record<string, number[]> = {}
    const readVlq = () => {
      let v = 0
      while (p < data.length) {
        const c = data[p++]
        v = (v << 7) | (c & 0x7f)
        if ((c & 0x80) === 0) break
      }
      return v
    }
    while (p < data.length) {
      tick += readVlq()
      if (p >= data.length) break
      let status = data[p]
      if (status < 0x80) {
        status = running
      } else {
        p++
        if (status < 0xf0) running = status
      }
      if (status === 0xff) {
        if (p >= data.length) break
        const meta = data[p++]
        const l = readVlq()
        const slice = [0xff, meta, ...encodeVlq(l), ...data.subarray(p, p + l)]
        p += l
        events.push({ tick, data: slice })
        continue
      }
      if (status === 0xf0 || status === 0xf7) {
        const l = readVlq()
        const slice = [status, ...encodeVlq(l), ...data.subarray(p, p + l)]
        p += l
        events.push({ tick, data: slice })
        continue
      }
      const kind = status & 0xf0
      const channel = status & 0x0f
      const needed = kind === 0xc0 || kind === 0xd0 ? 1 : 2
      if (p + needed > data.length) break
      const payload = Array.from(data.subarray(p, p + needed))
      p += needed
      const event: RawEvent = { tick, data: [status, ...payload] }
      if ((kind === 0x90 || kind === 0x80) && needed === 2) {
        const pitch = payload[0]
        const vel = payload[1]
        const isOn = kind === 0x90 && vel > 0
        const key = `${channel}:${pitch}`
        if (isOn) {
          pair += 1
          event.note = { kind: 'on', channel, pitch, pair }
          const stack = open[key] ?? []
          stack.push(pair)
          open[key] = stack
        } else {
          const stack = open[key]
          const matched = stack && stack.length > 0 ? stack.pop()! : ++pair
          event.note = { kind: 'off', channel, pitch, pair: matched }
        }
      }
      events.push(event)
    }
    tracks.push(events)
  }
  return { ppq, tracks }
}

function encodeMidi(ppq: number, tracks: RawEvent[][]): string {
  const chunks: number[] = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, (tracks.length >> 8) & 0xff, tracks.length & 0xff, (ppq >> 8) & 0xff, ppq & 0xff]
  for (const events of tracks) {
    const body: number[] = []
    let last = 0
    const kept = events.filter((event) => event.data.length > 0)
    for (const event of kept) {
      body.push(...encodeVlq(event.tick - last))
      body.push(...event.data)
      last = event.tick
    }
    chunks.push(0x4d, 0x54, 0x72, 0x6b, (body.length >>> 24) & 0xff, (body.length >>> 16) & 0xff, (body.length >>> 8) & 0xff, body.length & 0xff, ...body)
  }
  const bytes = new Uint8Array(chunks)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function retarget(event: RawEvent, channel: number) {
  if (!event.note) return
  event.note.channel = channel
  event.data[0] = (event.data[0] & 0xf0) | (channel & 0x0f)
}

// Move each sounding note onto its voice channel so solo/mute and reassignment
// affect the audio, including two voices that Verovio put on one staff channel.
// If too few notes match, the original MIDI is returned unchanged.
export function rewriteMidiChannels(args: {
  midiBase64: string
  notes: SoundingNote[]
  noteVoices: Record<string, string>
  voiceChannels: Record<string, number>
  fallbackMidiBase64: string
  fallbackChannelMap: Record<string, number>
}): ChannelRewrite {
  const decoded = decodeMidi(args.midiBase64)
  if (!decoded) {
    return { midiBase64: args.fallbackMidiBase64, channelMap: args.fallbackChannelMap, rewritten: false }
  }

  const practice: PracticeNote[] = []
  for (const note of args.notes) {
    const voiceId = args.noteVoices[note.id]
    if (!voiceId) continue
    const channel = args.voiceChannels[voiceId]
    if (channel === undefined) continue
    practice.push({
      tick: Math.round(note.qstamp * decoded.ppq),
      pitch: note.pitch,
      channel,
    })
  }
  if (practice.length === 0) {
    return { midiBase64: args.fallbackMidiBase64, channelMap: args.fallbackChannelMap, rewritten: false }
  }

  const ons: RawEvent[] = []
  for (const track of decoded.tracks) {
    for (const event of track) {
      if (event.note?.kind === 'on') ons.push(event)
    }
  }
  ons.sort((a, b) => a.tick - b.tick || a.note!.pitch - b.note!.pitch)
  const used = new Set<RawEvent>()
  let matched = 0
  const tolerance = Math.max(2, Math.round(decoded.ppq / 64))
  for (const wanted of practice) {
    let best: RawEvent | null = null
    let bestDist = Infinity
    for (const event of ons) {
      if (used.has(event) || event.note!.pitch !== wanted.pitch) continue
      const dist = Math.abs(event.tick - wanted.tick)
      if (dist < bestDist && dist <= tolerance) {
        best = event
        bestDist = dist
      }
    }
    if (!best?.note) continue
    used.add(best)
    matched++
    const pair = best.note.pair
    const from = best.note.channel
    for (const track of decoded.tracks) {
      for (const event of track) {
        if (event.note && event.note.pair === pair && event.note.channel === from && event.note.pitch === wanted.pitch) {
          retarget(event, wanted.channel)
        }
      }
    }
  }

  if (matched / practice.length < 0.6) {
    return { midiBase64: args.fallbackMidiBase64, channelMap: args.fallbackChannelMap, rewritten: false }
  }

  // Notes that did not match a voice stay on their own channel. Silencing them
  // used to hide a whole choir part whenever matching missed it.

  return {
    midiBase64: encodeMidi(decoded.ppq, decoded.tracks),
    channelMap: { ...args.voiceChannels },
    rewritten: true,
  }
}

export function midiFromNotes(
  ppq: number,
  notes: { tick: number; pitch: number; channel: number; duration: number }[]
): string {
  const events: RawEvent[] = [
    { tick: 0, data: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] },
  ]
  notes.forEach((note, index) => {
    const pair = index + 1
    events.push({
      tick: note.tick,
      data: [0x90 | (note.channel & 0x0f), note.pitch, 90],
      note: { kind: 'on', channel: note.channel, pitch: note.pitch, pair },
    })
    events.push({
      tick: note.tick + note.duration,
      data: [0x80 | (note.channel & 0x0f), note.pitch, 0],
      note: { kind: 'off', channel: note.channel, pitch: note.pitch, pair },
    })
  })
  events.push({ tick: events[events.length - 1]?.tick ?? 0, data: [0xff, 0x2f, 0x00] })
  events.sort((a, b) => a.tick - b.tick)
  return encodeMidi(ppq, [events])
}

const SUSTAIN_CONTROLLERS = new Set([64, 66])

// A stuck damper pedal (CC 64/66 with no release) makes every note ring
// through the written rests. Choir scores never need that pedal.
export function withoutSustainPedal(midiBase64: string): string {
  const decoded = decodeMidi(midiBase64)
  if (!decoded) return midiBase64
  let removed = false
  for (const track of decoded.tracks) {
    for (let i = track.length - 1; i >= 0; i--) {
      const data = track[i].data
      const status = data[0] ?? 0
      if ((status & 0xf0) === 0xb0 && SUSTAIN_CONTROLLERS.has(data[1] ?? -1)) {
        track.splice(i, 1)
        removed = true
      }
    }
  }
  return removed ? encodeMidi(decoded.ppq, decoded.tracks) : midiBase64
}

export function listNoteOns(midiBase64: string): { tick: number; pitch: number; channel: number }[] {
  const decoded = decodeMidi(midiBase64)
  if (!decoded) return []
  const ons: { tick: number; pitch: number; channel: number }[] = []
  for (const track of decoded.tracks) {
    for (const event of track) {
      if (event.note?.kind === 'on') {
        ons.push({ tick: event.tick, pitch: event.note.pitch, channel: event.note.channel })
      }
    }
  }
  return ons
}
