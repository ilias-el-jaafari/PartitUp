// Choir OMR often leaves a 3/4 bar short by one beat (a half note with the
// dot dropped) and lets a tie cross the hole. Playback then hiccups at every
// barline, and the tied pitch keeps ringing through the written rests like a
// pedal. Fill those small holes and drop ties that do not meet the next note.

const TYPE_BY_QUARTERS: { quarters: number; type: string; dots: number }[] = [
  { quarters: 4, type: 'whole', dots: 0 },
  { quarters: 3, type: 'half', dots: 1 },
  { quarters: 2, type: 'half', dots: 0 },
  { quarters: 1.5, type: 'quarter', dots: 1 },
  { quarters: 1, type: 'quarter', dots: 0 },
  { quarters: 0.75, type: 'eighth', dots: 1 },
  { quarters: 0.5, type: 'eighth', dots: 0 },
  { quarters: 0.375, type: '16th', dots: 1 },
  { quarters: 0.25, type: '16th', dots: 0 },
]

interface PlacedNote {
  el: Element
  voice: string
  abs: number
  dur: number
  pitch: string
  hadStart: boolean
  hadStop: boolean
}

function elements(parent: ParentNode, name: string): Element[] {
  const out: Element[] = []
  const nodes = parent.childNodes
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node.nodeType === 1 && (node as Element).localName === name) out.push(node as Element)
  }
  return out
}

function allElements(root: ParentNode, name: string): Element[] {
  const out: Element[] = []
  const walk = (node: ParentNode) => {
    const children = node.childNodes
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (child.nodeType !== 1) continue
      const el = child as Element
      if (el.localName === name) out.push(el)
      walk(el)
    }
  }
  walk(root)
  return out
}

function first(parent: ParentNode, name: string): Element | null {
  return elements(parent, name)[0] ?? null
}

function text(parent: Element, name: string): string | null {
  const el = first(parent, name)
  return el?.textContent ?? null
}

function int(value: string | null): number {
  const n = parseInt(value ?? '', 10)
  return Number.isFinite(n) ? n : 0
}

function setChildText(note: Element, name: string, value: string, doc: Document) {
  let el = first(note, name)
  if (!el) {
    el = doc.createElement(name)
    note.appendChild(el)
  }
  el.textContent = value
}

function writeDuration(note: Element, dur: number, divisions: number, doc: Document) {
  setChildText(note, 'duration', String(dur), doc)
  if (divisions <= 0) return
  const quarters = dur / divisions
  const match = TYPE_BY_QUARTERS.find((item) => Math.abs(item.quarters - quarters) < 1e-6)
  if (!match) return
  setChildText(note, 'type', match.type, doc)
  for (const dot of elements(note, 'dot')) dot.remove()
  const typeEl = first(note, 'type')
  for (let i = 0; i < match.dots; i++) {
    const dot = doc.createElement('dot')
    if (typeEl?.nextSibling) note.insertBefore(dot, typeEl.nextSibling)
    else note.appendChild(dot)
  }
}

function pitchOf(note: Element): string | null {
  const pitch = first(note, 'pitch')
  if (!pitch) return null
  const name = text(pitch, 'step') ?? 'C'
  const alter = text(pitch, 'alter') ?? '0'
  const octave = text(pitch, 'octave') ?? '4'
  return `${name}${alter}:${octave}`
}

function tieFlags(note: Element): { start: boolean; stop: boolean } {
  let start = false
  let stop = false
  for (const el of [...allElements(note, 'tie'), ...allElements(note, 'tied')]) {
    const type = el.getAttribute('type')
    if (type === 'start') start = true
    if (type === 'stop') stop = true
  }
  return { start, stop }
}

interface Slot {
  el: Element
  voice: string
  onset: number
  dur: number
  rest: boolean
}

function readMeasure(measure: Element): Slot[] {
  const slots: Slot[] = []
  let cursor = 0
  let lastOnset = 0
  for (let i = 0; i < measure.childNodes.length; i++) {
    const child = measure.childNodes[i]
    if (child.nodeType !== 1) continue
    const el = child as Element
    if (el.localName === 'backup') {
      cursor -= int(text(el, 'duration'))
    } else if (el.localName === 'forward') {
      cursor += int(text(el, 'duration'))
    } else if (el.localName === 'note') {
      const chord = first(el, 'chord') !== null
      const dur = int(text(el, 'duration'))
      const onset = chord ? lastOnset : cursor
      slots.push({
        el,
        voice: (text(el, 'voice') ?? '1').trim() || '1',
        onset,
        dur,
        rest: first(el, 'rest') !== null || first(el, 'unpitched') !== null,
      })
      if (!chord) {
        lastOnset = cursor
        cursor += dur
      }
    }
  }
  return slots
}

function fitVoiceToBar(slots: Slot[], voice: string, bar: number, divisions: number, doc: Document) {
  const mine = slots.filter((slot) => slot.voice === voice && slot.dur > 0)
  if (mine.length === 0 || bar <= 0) return
  const end = mine.reduce((max, slot) => Math.max(max, slot.onset + slot.dur), 0)
  const delta = bar - end
  const edge = mine.filter((slot) => slot.onset + slot.dur === end)
  // A half note alone in 3/4 is one beat short: the augmentation dot was
  // missed. Adding it fills the bar. Anything else (a real short note, or a
  // note that runs past the bar) is left as written.
  const droppedDot = delta > 0 && edge.length > 0 && edge.every((slot) => !slot.rest && slot.dur === delta * 2)
  if (!droppedDot) return
  for (const slot of edge) {
    const next = slot.dur + delta
    slot.dur = next
    writeDuration(slot.el, next, divisions, doc)
  }
}

function removeTieType(note: Element, type: 'start' | 'stop') {
  for (const el of [...allElements(note, 'tie'), ...allElements(note, 'tied')]) {
    if (el.getAttribute('type') === type) el.remove()
  }
}

function retie(placed: PlacedNote[]) {
  const byVoice = new Map<string, PlacedNote[]>()
  for (const note of placed) {
    const list = byVoice.get(note.voice) ?? []
    list.push(note)
    byVoice.set(note.voice, list)
  }
  for (const list of byVoice.values()) {
    list.sort((a, b) => a.abs - b.abs)
    for (const note of list) {
      if (!note.hadStart) continue
      const next = list.find((other) => other !== note && other.hadStop && other.pitch === note.pitch && other.abs === note.abs + note.dur)
      if (!next) {
        removeTieType(note.el, 'start')
        note.hadStart = false
      }
    }
    for (const note of list) {
      if (!note.hadStop) continue
      const prev = list.find((other) => other !== note && other.hadStart && other.pitch === note.pitch && other.abs + other.dur === note.abs)
      if (!prev) removeTieType(note.el, 'stop')
    }
  }
}

export function normalizeChoirRhythm(xml: string): string {
  if (!xml.includes('<score-partwise') && !xml.includes('<score-timewise')) return xml
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (allElements(doc, 'parsererror').length > 0) return xml

  const parts = allElements(doc, 'part').filter((part) => part.getAttribute('id'))
  for (const part of parts) {
    let divisions = 1
    let beats = 4
    let beatType = 4
    let origin = 0
    const placed: PlacedNote[] = []

    for (const measure of elements(part, 'measure')) {
      for (const attributes of elements(measure, 'attributes')) {
        const nextDivisions = int(text(attributes, 'divisions'))
        if (nextDivisions > 0) divisions = nextDivisions
        const time = first(attributes, 'time')
        if (time) {
          const nextBeats = int(text(time, 'beats'))
          const nextType = int(text(time, 'beat-type'))
          if (nextBeats > 0) beats = nextBeats
          if (nextType > 0) beatType = nextType
        }
      }
      const bar = divisions * (4 / beatType) * beats
      const slots = readMeasure(measure)
      const voices = [...new Set(slots.map((slot) => slot.voice))]
      for (const voice of voices) fitVoiceToBar(slots, voice, bar, divisions, doc)

      for (const slot of slots) {
        if (slot.rest || slot.dur <= 0) continue
        const pitch = pitchOf(slot.el)
        if (!pitch) continue
        const flags = tieFlags(slot.el)
        placed.push({
          el: slot.el,
          voice: slot.voice,
          abs: origin + slot.onset,
          dur: slot.dur,
          pitch,
          hadStart: flags.start,
          hadStop: flags.stop,
        })
      }
      origin += bar
    }
    retie(placed)
  }

  const body = new XMLSerializer().serializeToString(doc)
  if (xml.startsWith('<?xml') && !body.startsWith('<?xml')) {
    const header = xml.match(/^<\?xml[^?]*\?>/)?.[0]
    return header ? `${header}\n${body}` : body
  }
  return body
}
