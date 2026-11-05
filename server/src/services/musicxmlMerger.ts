/**
 * Joins one MusicXML document per page into a single score.
 *
 * Audiveris names parts differently on each page and sometimes sees fewer
 * staves on the first page. Using only the first page's part list drops every
 * voice that shows up later. The page with the most parts is the reference;
 * other pages are lined up with it, and a missing voice becomes rests so the
 * bars stay aligned.
 */
import { DOMParser, XMLSerializer, type Document, type Element } from '@xmldom/xmldom'

interface PagePart {
  id: string
  measures: Element[]
  avgPitch: number
}

interface XmlParent {
  readonly childNodes: ArrayLike<{ nodeType: number; localName?: string | null }>
}

function elements(parent: XmlParent, name: string): Element[] {
  const out: Element[] = []
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i]
    if (node?.nodeType === 1 && node.localName === name) out.push(node as unknown as Element)
  }
  return out
}

function first(parent: XmlParent, name: string): Element | null {
  return elements(parent, name)[0] ?? null
}

function text(parent: Element | null, name: string): string {
  if (!parent) return ''
  return (first(parent, name)?.textContent ?? '').trim()
}

function descendants(root: XmlParent, name: string): Element[] {
  const out: Element[] = []
  const walk = (node: XmlParent) => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i]
      if (child?.nodeType !== 1) continue
      const el = child as unknown as Element
      if (el.localName === name) out.push(el)
      walk(el)
    }
  }
  walk(root)
  return out
}

function parsePage(xml: string): { doc: Document; parts: PagePart[] } {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const parts = descendants(doc, 'part')
    .filter((part) => part.getAttribute('id') && part.parentNode && (part.parentNode as Element).localName !== 'part-list')
    .map((part) => {
      const measures = elements(part, 'measure')
      let sum = 0
      let count = 0
      for (const note of measures.flatMap((measure) => elements(measure, 'note'))) {
        if (first(note, 'rest')) continue
        const pitch = first(note, 'pitch')
        if (!pitch) continue
        const step = text(pitch, 'step')
        const octave = parseInt(text(pitch, 'octave') || '4', 10)
        const alter = parseInt(text(pitch, 'alter') || '0', 10)
        const map: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
        sum += (octave + 1) * 12 + (map[step] ?? 0) + alter
        count++
      }
      return {
        id: part.getAttribute('id') ?? '',
        measures,
        avgPitch: count > 0 ? sum / count : 60,
      }
    })
  return { doc, parts }
}

function assignSlots(page: PagePart[], ref: PagePart[]): number[] {
  if (page.length === ref.length) return page.map((_, index) => index)
  const used = new Set<number>()
  const slots = page.map(() => -1)
  const order = page.map((part, index) => ({ index, pitch: part.avgPitch }))
    .sort((a, b) => b.pitch - a.pitch)
  for (const item of order) {
    let best = -1
    let bestDist = Infinity
    ref.forEach((candidate, index) => {
      if (used.has(index)) return
      const dist = Math.abs(item.pitch - candidate.avgPitch)
      if (dist < bestDist) {
        bestDist = dist
        best = index
      }
    })
    if (best >= 0) {
      used.add(best)
      slots[item.index] = best
    }
  }
  return slots
}

function barLength(measure: Element | undefined): { divisions: number; duration: number } {
  const attributes = measure ? first(measure, 'attributes') : null
  const divisions = parseInt(text(attributes, 'divisions') || '1', 10) || 1
  const time = attributes ? first(attributes, 'time') : null
  const beats = parseInt(text(time, 'beats') || '4', 10) || 4
  const beatType = parseInt(text(time, 'beat-type') || '4', 10) || 4
  return { divisions, duration: Math.round(divisions * beats * (4 / beatType)) }
}

function restMeasure(doc: Document, divisions: number, duration: number): Element {
  const measure = doc.createElement('measure')
  const attributes = doc.createElement('attributes')
  const divisionsEl = doc.createElement('divisions')
  divisionsEl.textContent = String(divisions)
  attributes.appendChild(divisionsEl)
  measure.appendChild(attributes)
  const note = doc.createElement('note')
  note.appendChild(doc.createElement('rest'))
  const durationEl = doc.createElement('duration')
  durationEl.textContent = String(duration)
  note.appendChild(durationEl)
  const voice = doc.createElement('voice')
  voice.textContent = '1'
  note.appendChild(voice)
  measure.appendChild(note)
  return measure
}

export function mergeMusicXmlPages(pages: string[]): string {
  if (pages.length === 0) throw new Error('No pages to merge')
  if (pages.length === 1) return pages[0]

  const parsed = pages.map(parsePage)
  let refIndex = 0
  parsed.forEach((page, index) => {
    if (page.parts.length > parsed[refIndex].parts.length) refIndex = index
  })
  const ref = parsed[refIndex]
  if (ref.parts.length === 0) return pages[0]

  const columns: Element[][] = ref.parts.map(() => [])
  for (const page of parsed) {
    const slots = assignSlots(page.parts, ref.parts)
    const width = page.parts.reduce((max, part) => Math.max(max, part.measures.length), 0)
    const { divisions, duration } = barLength(page.parts[0]?.measures[0] ?? ref.parts[0]?.measures[0])
    for (let slot = 0; slot < ref.parts.length; slot++) {
      const local = slots.indexOf(slot)
      if (local >= 0) {
        columns[slot].push(...page.parts[local].measures)
      } else {
        for (let i = 0; i < width; i++) columns[slot].push(restMeasure(ref.doc, divisions, duration))
      }
    }
  }

  const doc = ref.doc
  ref.parts.forEach((part, slot) => {
    const partEl = descendants(doc, 'part').find((candidate) => candidate.getAttribute('id') === part.id)
    if (!partEl) return
    for (const measure of [...elements(partEl, 'measure')]) measure.parentNode?.removeChild(measure)
    columns[slot].forEach((measure, index) => {
      const node = measure.ownerDocument === doc ? measure : doc.importNode(measure, true)
      node.setAttribute('number', String(index + 1))
      partEl.appendChild(node)
    })
  })

  const body = new XMLSerializer().serializeToString(doc)
  const source = pages[refIndex]
  if (source.startsWith('<?xml') && !body.startsWith('<?xml')) {
    const header = source.match(/^<\?xml[^?]*\?>/)?.[0]
    return header ? `${header}\n${body}` : body
  }
  return body
}
