// Post-processing for choral OMR (Audiveris and oemer).
//
// Each SATB voice is a single melodic line. The engines regularly invent:
//   1. A second simultaneous pitch (<chord/> or a tiny extra <voice>).
//   2. Garbage lyric syllables (lone consonants, stray punctuation).
//   3. Chord-symbol <harmony> blocks that are not the sung text.
//   4. A nearly empty extra part (a speck read as its own staff).
//
// Set OMR_COLLAPSE_CHORDS=0 to keep real polyphony (chords and divisi).
// Set OMR_STRIP_HARMONY=0 to keep chord symbols.

import { DOMParser, XMLSerializer, type Document, type Element } from '@xmldom/xmldom'

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y', 'á', 'é', 'í', 'ó', 'ú', 'ü'])

export function isGarbageLyricText(raw: string): boolean {
  const s = raw.replace(/\s+/g, ' ').trim()
  if (s.length === 0) return true
  if (!/[\p{L}\p{N}]/u.test(s)) return true
  if (s.length === 1 && !VOWELS.has(s.toLowerCase()) && !/\d/.test(s)) return true
  return false
}

function flag(name: string, defaultOn: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined) return defaultOn
  return raw !== '0' && raw.toLowerCase() !== 'false'
}

function localElements(root: Document | Element, name: string): Element[] {
  const out: Element[] = []
  const all = root.getElementsByTagName('*')
  for (let i = 0; i < all.length; i++) {
    const el = all[i]
    if (el?.localName === name) out.push(el)
  }
  return out
}

function elementChildren(el: Element): Element[] {
  const out: Element[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i]
    if (child?.nodeType === 1) out.push(child as Element)
  }
  return out
}

function directChildren(el: Element, name: string): Element[] {
  return elementChildren(el).filter((c) => c.localName === name)
}

function childText(el: Element, name: string): string | null {
  for (const child of elementChildren(el)) {
    if (child.localName === name) return child.textContent ?? ''
  }
  return null
}

function hasDirect(el: Element, name: string): boolean {
  return elementChildren(el).some((c) => c.localName === name)
}

function removeEl(el: Element) {
  el.parentNode?.removeChild(el)
}

interface NoteEvent {
  note: Element
  voice: string
  staff: string
  onset: number
  pitched: boolean
}

function noteVoice(note: Element): string {
  return (childText(note, 'voice') ?? '1').trim() || '1'
}

function noteStaff(note: Element): string {
  return (childText(note, 'staff') ?? '1').trim() || '1'
}

function setVoice(note: Element, voice: string, doc: Document) {
  for (const child of elementChildren(note)) {
    if (child.localName === 'voice') {
      child.textContent = voice
      return
    }
  }
  const el = doc.createElement('voice')
  el.textContent = voice
  const pitch = elementChildren(note).find((c) => c.localName === 'pitch' || c.localName === 'rest' || c.localName === 'unpitched')
  if (pitch?.nextSibling) note.insertBefore(el, pitch.nextSibling)
  else note.appendChild(el)
}

function collectPartEvents(part: Element): NoteEvent[] {
  const events: NoteEvent[] = []
  let absolute = 0

  for (const measure of directChildren(part, 'measure')) {
    let cursor = absolute
    let lastOnset = absolute
    for (const child of elementChildren(measure)) {
      if (child.localName === 'backup') {
        cursor -= parseInt(childText(child, 'duration') ?? '0', 10) || 0
      } else if (child.localName === 'forward') {
        cursor += parseInt(childText(child, 'duration') ?? '0', 10) || 0
      } else if (child.localName === 'note') {
        const dur = parseInt(childText(child, 'duration') ?? '0', 10) || 0
        const chord = hasDirect(child, 'chord')
        const onset = chord ? lastOnset : cursor
        const pitched = !hasDirect(child, 'rest') && !hasDirect(child, 'unpitched')
        events.push({ note: child, voice: noteVoice(child), staff: noteStaff(child), onset, pitched })
        if (!chord) {
          lastOnset = cursor
          cursor += dur
        }
      }
    }
    absolute = Math.max(absolute, cursor)
  }
  return events
}

function collapseChords(doc: Document) {
  const notes = localElements(doc, 'note')
  for (const note of notes) {
    if (hasDirect(note, 'chord')) removeEl(note)
  }
}

function stripGarbageLyrics(doc: Document) {
  for (const lyric of localElements(doc, 'lyric')) {
    const text = localElements(lyric, 'text').map((t) => t.textContent ?? '').join('')
    if (isGarbageLyricText(text)) removeEl(lyric)
  }
}

function stripHarmony(doc: Document) {
  for (const el of localElements(doc, 'harmony')) removeEl(el)
}

function stripGarbageWords(doc: Document) {
  for (const words of localElements(doc, 'words')) {
    if (!isGarbageLyricText(words.textContent ?? '')) continue
    const direction = words.parentNode?.parentNode
    if (direction && (direction as Element).localName === 'direction') removeEl(direction as Element)
    else removeEl(words)
  }
}

function noteIsSung(note: Element): boolean {
  for (const lyric of elementChildren(note).filter((child) => child.localName === 'lyric')) {
    const raw = elementChildren(lyric)
      .filter((child) => child.localName === 'text')
      .map((child) => child.textContent ?? '')
      .join('')
    if (/[\p{L}]{2,}/u.test(raw)) return true
  }
  return false
}

function mergeMinorVoices(doc: Document) {
  const parts = localElements(doc, 'part').filter((p) => p.parentNode && (p.parentNode as Element).localName !== 'part-list')
  for (const part of parts) {
    const events = collectPartEvents(part).filter((e) => e.pitched)
    const byStaff = new Map<string, NoteEvent[]>()
    for (const ev of events) {
      const list = byStaff.get(ev.staff) ?? []
      list.push(ev)
      byStaff.set(ev.staff, list)
    }
    for (const group of byStaff.values()) {
      const counts = new Map<string, number>()
      for (const ev of group) counts.set(ev.voice, (counts.get(ev.voice) ?? 0) + 1)
      if (counts.size <= 1) continue
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
      const [dominantVoice, dominantCount] = ranked[0]
      const threshold = Math.max(4, Math.floor(0.12 * dominantCount))
      const keep = new Set(ranked.filter(([, n]) => n >= threshold).map(([v]) => v))
      if (keep.size === 0) keep.add(dominantVoice)
      // Two sung lines on one staff (SA, divisi) must not be folded into one.
      for (const [voice, count] of ranked) {
        if (count < 2) continue
        const sung = group.some((event) => event.voice === voice && noteIsSung(event.note))
        if (sung) keep.add(voice)
      }
      const keptOnsets = new Set(group.filter((e) => keep.has(e.voice)).map((e) => e.onset))
      for (const ev of group) {
        if (keep.has(ev.voice)) continue
        if (keptOnsets.has(ev.onset)) removeEl(ev.note)
        else setVoice(ev.note, dominantVoice, doc)
      }
    }
  }
}

function dropTinyParts(doc: Document) {
  const scoreParts = localElements(doc, 'score-part')
  const parts = localElements(doc, 'part').filter((p) => p.hasAttribute('id'))
  const counts = parts.map((part) => ({
    id: part.getAttribute('id') ?? '',
    part,
    pitched: collectPartEvents(part).filter((e) => e.pitched).length,
  }))
  const largest = counts.reduce((m, c) => Math.max(m, c.pitched), 0)
  if (largest < 16 || counts.length < 2) return
  for (const c of counts) {
    if (c.pitched >= 4) continue
    if (c.pitched > largest * 0.05) continue
    if (collectPartEvents(c.part).some((event) => event.pitched && noteIsSung(event.note))) continue
    removeEl(c.part)
    const sp = scoreParts.find((s) => s.getAttribute('id') === c.id)
    if (sp) removeEl(sp)
  }
}

function stripDamperPedal(doc: Document) {
  for (const pedal of localElements(doc, 'pedal')) removeEl(pedal)
  for (const sound of localElements(doc, 'sound')) {
    if (!sound.hasAttribute('damper-pedal')) continue
    sound.removeAttribute('damper-pedal')
    if (sound.attributes.length === 0) removeEl(sound)
  }
}

export function cleanupMusicXml(xml: string): string {
  const monophonic = flag('OMR_COLLAPSE_CHORDS', true)
  const stripHarm = flag('OMR_STRIP_HARMONY', true)

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xml, 'text/xml')
  } catch {
    return xml
  }
  if (localElements(doc, 'parsererror').length > 0) return xml
  if (localElements(doc, 'score-partwise').length === 0 && localElements(doc, 'score-timewise').length === 0) {
    return xml
  }

  if (monophonic) collapseChords(doc)
  stripGarbageLyrics(doc)
  if (stripHarm) stripHarmony(doc)
  stripGarbageWords(doc)
  if (monophonic) {
    mergeMinorVoices(doc)
    dropTinyParts(doc)
  }
  stripDamperPedal(doc)

  const body = new XMLSerializer().serializeToString(doc)
  if (xml.startsWith('<?xml') && !body.startsWith('<?xml')) {
    const header = xml.match(/^<\?xml[^?]*\?>/)?.[0]
    return header ? `${header}\n${body}` : body
  }
  return body
}
