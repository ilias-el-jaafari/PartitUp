// Generic cleanup between OMR MusicXML and MIDI, for any choir score:
// a stuck damper pedal holds every note through the rests, a printed
// metronome must win over the default 120, and a keyboard staff must not
// replace the sung parts.

const ACCOMPANIMENT_NAME = /piano|organ|keyboard|guitar|harp|continuo|accomp|acomp|klavier/i

function elements(parent: ParentNode, name: string): Element[] {
  const out: Element[] = []
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i]
    if (node.nodeType === 1 && (node as Element).localName === name) out.push(node as Element)
  }
  return out
}

function all(root: ParentNode, name: string): Element[] {
  const out: Element[] = []
  const walk = (node: ParentNode) => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i]
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

function textOf(el: Element | null): string {
  return (el?.textContent ?? '').trim()
}

function sungLyrics(part: Element): number {
  let count = 0
  for (const lyric of all(part, 'lyric')) {
    const raw = all(lyric, 'text').map((node) => node.textContent ?? '').join('')
    if (/[\p{L}]{2,}/u.test(raw)) count++
  }
  return count
}

function clefSign(part: Element): string {
  const clef = all(part, 'clef')[0]
  return textOf(clef ? first(clef, 'sign') : null).toUpperCase()
}

function partName(doc: ParentNode, id: string): string {
  for (const scorePart of all(doc, 'score-part')) {
    if (scorePart.getAttribute('id') === id) return textOf(first(scorePart, 'part-name'))
  }
  return ''
}

function removePart(doc: ParentNode, part: Element) {
  const id = part.getAttribute('id')
  part.parentNode?.removeChild(part)
  if (!id) return
  for (const scorePart of all(doc, 'score-part')) {
    if (scorePart.getAttribute('id') === id) scorePart.parentNode?.removeChild(scorePart)
  }
}

export function stripDamperPedal(doc: ParentNode) {
  for (const pedal of all(doc, 'pedal')) pedal.parentNode?.removeChild(pedal)
  for (const sound of all(doc, 'sound')) {
    if (!sound.hasAttribute('damper-pedal')) continue
    sound.removeAttribute('damper-pedal')
    if (sound.attributes.length === 0) sound.parentNode?.removeChild(sound)
  }
}

function beatUnitQuarters(unit: string, dotted: boolean): number {
  const quarters: Record<string, number> = { longa: 16, long: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 }
  const value = quarters[unit] ?? 1
  return dotted ? value * 1.5 : value
}

function make(doc: Document, name: string): Element {
  return doc.createElementNS(doc.documentElement?.namespaceURI ?? null, name)
}

// MusicXML sound@tempo is quarters per minute. A printed "quarter = 96"
// must become tempo 96, not the player default of 120, and later junk
// tempos must not yank the beat around.
export function applyMetronome(doc: Document) {
  let bpm: number | null = null
  const metronome = all(doc, 'metronome')[0]
  if (metronome) {
    const unit = textOf(first(metronome, 'beat-unit')) || 'quarter'
    const perMinute = parseInt(textOf(first(metronome, 'per-minute')), 10)
    const dotted = first(metronome, 'beat-unit-dot') !== null
    if (Number.isFinite(perMinute) && perMinute > 0) {
      const quarters = beatUnitQuarters(unit, dotted)
      bpm = Math.round(perMinute * quarters)
    }
  }
  const soundTempos = all(doc, 'sound').filter((sound) => sound.hasAttribute('tempo'))
  if (bpm === null) {
    const firstTempo = parseFloat(soundTempos[0]?.getAttribute('tempo') ?? '')
    if (Number.isFinite(firstTempo) && firstTempo >= 30 && firstTempo <= 240) bpm = firstTempo
  }
  if (bpm === null) return
  for (const sound of soundTempos) {
    sound.removeAttribute('tempo')
    if (sound.attributes.length === 0) sound.parentNode?.removeChild(sound)
  }
  const direction = metronome?.parentNode?.parentNode
  const host = direction && (direction as Element).localName === 'direction' ? direction as Element : null
  const sound = make(doc, 'sound')
  sound.setAttribute('tempo', String(bpm))
  if (host) {
    host.appendChild(sound)
    return
  }
  const measure = all(doc, 'measure')[0]
  if (!measure) return
  const wrapper = make(doc, 'direction')
  wrapper.appendChild(sound)
  const anchor = elements(measure, 'note')[0]
  if (anchor) measure.insertBefore(wrapper, anchor)
  else measure.appendChild(wrapper)
}

function staffNumber(note: Element): number {
  const raw = parseInt(textOf(first(note, 'staff')), 10)
  return Number.isFinite(raw) && raw > 0 ? raw : 1
}

function maxStaff(part: Element): number {
  let max = 1
  for (const staves of all(part, 'staves')) {
    const n = parseInt(textOf(staves), 10)
    if (n > max) max = n
  }
  for (const note of elementsDeepNotes(part)) {
    if (staffNumber(note) > max) max = staffNumber(note)
  }
  return max
}

function elementsDeepNotes(part: Element): Element[] {
  return all(part, 'note')
}

function retargetStaffMarkup(root: Element, staff: number) {
  for (const clef of all(root, 'clef')) {
    const n = parseInt(clef.getAttribute('number') ?? '1', 10) || 1
    if (n !== staff) clef.parentNode?.removeChild(clef)
    else clef.removeAttribute('number')
  }
  for (const staves of all(root, 'staves')) {
    staves.textContent = '1'
  }
  for (const note of all(root, 'note')) {
    const staffEl = first(note, 'staff')
    if (staffEl) staffEl.parentNode?.removeChild(staffEl)
  }
}

// One part with several staves hides the other choir voices behind a single
// name. Each staff becomes its own part; timing is kept by turning the other
// staves' notes into forward skips.
export function splitStaves(doc: Document) {
  const parts = all(doc, 'part').filter((part) => part.getAttribute('id'))
  for (const part of [...parts]) {
    const staves = maxStaff(part)
    if (staves <= 1) continue
    const id = part.getAttribute('id') ?? 'P'
    const list = all(doc, 'part-list')[0]
    const scorePart = all(doc, 'score-part').find((sp) => sp.getAttribute('id') === id)
    for (let staff = 2; staff <= staves; staff++) {
      const clone = part.cloneNode(true) as Element
      const newId = `${id}-s${staff}`
      clone.setAttribute('id', newId)
      projectToStaff(clone, staff, doc)
      part.parentNode?.insertBefore(clone, part.nextSibling)
      if (scorePart && list) {
        const copy = scorePart.cloneNode(true) as Element
        copy.setAttribute('id', newId)
        const name = first(copy, 'part-name')
        if (name && !name.textContent?.includes(`(${staff})`)) name.textContent = `${name.textContent ?? ''} ${staff}`.trim()
        list.insertBefore(copy, scorePart.nextSibling)
      }
    }
    projectToStaff(part, 1, doc)
  }
}

function projectToStaff(part: Element, staff: number, doc: Document) {
  for (const measure of elements(part, 'measure')) {
    for (const note of [...elements(measure, 'note')]) {
      if (staffNumber(note) === staff) {
        const staffEl = first(note, 'staff')
        staffEl?.parentNode?.removeChild(staffEl)
        continue
      }
      if (first(note, 'chord')) {
        note.parentNode?.removeChild(note)
        continue
      }
      const dur = textOf(first(note, 'duration')) || '0'
      const forward = make(doc, 'forward')
      const duration = make(doc, 'duration')
      duration.textContent = dur
      forward.appendChild(duration)
      note.parentNode?.replaceChild(forward, note)
    }
    retargetStaffMarkup(measure, staff)
  }
}

export function dropAccompaniment(doc: ParentNode) {
  const parts = all(doc, 'part').filter((part) => part.getAttribute('id'))
  if (parts.length <= 1) return
  const info = parts.map((part) => ({
    part,
    name: partName(doc, part.getAttribute('id') ?? ''),
    lyrics: sungLyrics(part),
    clef: clefSign(part),
  }))
  const drop = new Set<Element>()
  for (const entry of info) {
    if (entry.lyrics >= 1) continue
    if (ACCOMPANIMENT_NAME.test(entry.name)) drop.add(entry.part)
  }
  const instrumental = info.filter((entry) => entry.lyrics < 1 && !drop.has(entry.part))
  const sung = info.some((entry) => entry.lyrics >= 1)
  if (sung) {
    const trebles = instrumental.filter((entry) => entry.clef === 'G')
    const basses = instrumental.filter((entry) => entry.clef === 'F')
    if (trebles.length > 0 && basses.length > 0) {
      for (const entry of [...trebles, ...basses]) drop.add(entry.part)
    }
  }
  if (drop.size === 0 || drop.size >= parts.length) return
  for (const part of drop) removePart(doc, part)
}

export function prepareChoirScore(xml: string): string {
  if (!xml.includes('<score-partwise') && !xml.includes('<score-timewise')) return xml
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (all(doc, 'parsererror').length > 0) return xml
  stripDamperPedal(doc)
  splitStaves(doc)
  dropAccompaniment(doc)
  applyMetronome(doc)
  const body = new XMLSerializer().serializeToString(doc)
  if (xml.startsWith('<?xml') && !body.startsWith('<?xml')) {
    const header = xml.match(/^<\?xml[^?]*\?>/)?.[0]
    return header ? `${header}\n${body}` : body
  }
  return body
}
