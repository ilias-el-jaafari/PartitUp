import type { VoiceDefinition } from '../../types/voice'

const XML_NS = 'http://www.w3.org/XML/1998/namespace'

interface Pitch {
  step: string
  oct: string
  alter: number | null
}

interface Token {
  id: string | null
  onset: number
  quarters: number
  dur: string
  dots: number
  layer: number
  pitches: Pitch[]
  staff: number
}

interface StaffInfo {
  n: number
  label: string
  clefShape: string
  clefLine: string
  fifths: number
  beats: string
  beatType: string
  tokens: Token[]
}

function xmlId(el: Element): string | null {
  return el.getAttributeNS(XML_NS, 'id') ?? el.getAttribute('xml:id') ?? el.getAttribute('id')
}

function local(el: Element): string {
  return el.localName || el.tagName
}

const QUARTERS: Record<string, number> = {
  maxima: 32,
  long: 16,
  breve: 8,
  '1': 4,
  '2': 2,
  '4': 1,
  '8': 0.5,
  '16': 0.25,
  '32': 0.125,
  '64': 0.0625,
}

const TYPE_NAME: Record<string, string> = {
  maxima: 'maxima',
  long: 'long',
  breve: 'breve',
  '1': 'whole',
  '2': 'half',
  '4': 'quarter',
  '8': 'eighth',
  '16': '16th',
  '32': '32nd',
  '64': '64th',
}

function quartersOf(dur: string, dots: number): number {
  const base = QUARTERS[dur] ?? 1
  let total = base
  let extra = base / 2
  for (let i = 0; i < dots; i++) {
    total += extra
    extra /= 2
  }
  return total
}

function fifthsFromSig(sig: string | null): number {
  if (!sig || sig === '0') return 0
  const match = sig.match(/^(\d+)([fs])$/)
  if (!match) return 0
  const n = parseInt(match[1], 10)
  return match[2] === 'f' ? -n : n
}

function alterFromAccid(value: string | null): number | null {
  if (!value) return null
  switch (value) {
    case 's':
    case '1s': return 1
    case 'f':
    case '1f': return -1
    case 'ss':
    case 'x':
    case '2s': return 2
    case 'ff':
    case '2f': return -2
    case 'n': return 0
    default: return null
  }
}

function children(el: Element): Element[] {
  const out: Element[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i]
    if (child.nodeType === 1) out.push(child as Element)
  }
  return out
}

function findStaves(doc: Document): Map<number, StaffInfo> {
  const staves = new Map<number, StaffInfo>()
  const visit = (el: Element) => {
    if (local(el) === 'staffDef') {
      const n = parseInt(el.getAttribute('n') ?? '1', 10) || 1
      const clef = children(el).find((c) => local(c) === 'clef')
      const key = children(el).find((c) => local(c) === 'keySig')
      const meter = children(el).find((c) => local(c) === 'meterSig')
      const label = children(el).find((c) => local(c) === 'label')
      staves.set(n, {
        n,
        label: label?.textContent?.trim() || `Voz ${n}`,
        clefShape: clef?.getAttribute('shape') ?? 'G',
        clefLine: clef?.getAttribute('line') ?? '2',
        fifths: fifthsFromSig(key?.getAttribute('sig') ?? null),
        beats: meter?.getAttribute('count') ?? '4',
        beatType: meter?.getAttribute('unit') ?? '4',
        tokens: [],
      })
    }
    children(el).forEach(visit)
  }
  visit(doc.documentElement)
  return staves
}

function pitchOf(note: Element): Pitch {
  const accid = note.getAttribute('accid') ?? note.getAttribute('accid.ges')
  return {
    step: (note.getAttribute('pname') ?? 'c').toUpperCase(),
    oct: note.getAttribute('oct') ?? '4',
    alter: alterFromAccid(accid),
  }
}

function collectTokens(doc: Document, staves: Map<number, StaffInfo>) {
  const measures = [] as Element[]
  const walk = (el: Element) => {
    if (local(el) === 'measure') measures.push(el)
    else children(el).forEach(walk)
  }
  walk(doc.documentElement)

  let measureStart = 0
  for (const measure of measures) {
    let measureEnd = measureStart
    for (const staffEl of children(measure).filter((c) => local(c) === 'staff')) {
      const staffN = parseInt(staffEl.getAttribute('n') ?? '1', 10) || 1
      const info = staves.get(staffN) ?? {
        n: staffN,
        label: `Voz ${staffN}`,
        clefShape: 'G',
        clefLine: '2',
        fifths: 0,
        beats: '4',
        beatType: '4',
        tokens: [],
      }
      staves.set(staffN, info)
      for (const layer of children(staffEl).filter((c) => local(c) === 'layer')) {
        const layerN = parseInt(layer.getAttribute('n') ?? '1', 10) || 1
        let cursor = measureStart
        const take = (el: Element, chord: boolean) => {
          if (el.getAttribute('grace')) return
          const dur = el.getAttribute('dur') ?? '4'
          const dots = parseInt(el.getAttribute('dots') ?? '0', 10) || 0
          const q = quartersOf(dur, dots)
          const onset = chord ? cursor - q : cursor
          if (local(el) === 'rest' || el.getAttribute('pname') === null && local(el) !== 'chord') {
            if (local(el) === 'rest') {
              info.tokens.push({ id: xmlId(el), onset, quarters: q, dur, dots, layer: layerN, pitches: [], staff: staffN })
              if (!chord) cursor += q
            }
            return
          }
          if (local(el) === 'note') {
            info.tokens.push({
              id: xmlId(el),
              onset,
              quarters: q,
              dur,
              dots,
              layer: layerN,
              pitches: [pitchOf(el)],
              staff: staffN,
            })
            if (!chord) cursor += q
          }
        }
        for (const el of children(layer)) {
          if (local(el) === 'chord') {
            const notes = children(el).filter((n) => local(n) === 'note')
            notes.forEach((note, index) => take(note, index > 0))
            const dur = el.getAttribute('dur') ?? notes[0]?.getAttribute('dur') ?? '4'
            const dots = parseInt(el.getAttribute('dots') ?? '0', 10) || 0
            if (notes.length > 1) {
              // The first note already advanced; extra notes were marked chord via take(..., true)
              // but their duration came from the note, which may be missing. Rebuild the chord token.
              const firstId = xmlId(notes[0])
              const token = [...info.tokens].reverse().find((t) => t.id === firstId)
              if (token) {
                token.pitches = notes.map(pitchOf)
                token.quarters = quartersOf(dur, dots)
                token.dur = dur
                token.dots = dots
              }
            }
          } else {
            take(el, false)
          }
        }
        measureEnd = Math.max(measureEnd, cursor)
      }
    }
    measureStart = measureEnd
  }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function emitNote(token: Token, pitch: Pitch | null, chord: boolean, divisions: number): string {
  const duration = Math.max(1, Math.round(token.quarters * divisions))
  const type = TYPE_NAME[token.dur] ?? 'quarter'
  const dots = Array.from({ length: token.dots }, () => '<dot/>').join('')
  if (!pitch) {
    return `<note><rest/>${chord ? '<chord/>' : ''}<duration>${duration}</duration><voice>${token.layer}</voice><type>${type}</type>${dots}</note>`
  }
  const alter = pitch.alter === null ? '' : `<alter>${pitch.alter}</alter>`
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${pitch.step}</step>${alter}<octave>${pitch.oct}</octave></pitch><duration>${duration}</duration><voice>${token.layer}</voice><type>${type}</type>${dots}</note>`
}

function relocate(staves: Map<number, StaffInfo>, overrides: Record<string, string>, voices: VoiceDefinition[]) {
  if (Object.keys(overrides).length === 0) return
  const byId = new Map(voices.map((v) => [v.id, v]))
  for (const staff of staves.values()) {
    for (const token of [...staff.tokens]) {
      if (!token.id || !overrides[token.id]) continue
      const destVoice = byId.get(overrides[token.id])
      if (!destVoice?.globalStaff || destVoice.globalStaff === token.staff) {
        if (destVoice?.layers[0]) token.layer = destVoice.layers[0]
        continue
      }
      const dest = staves.get(destVoice.globalStaff)
      if (!dest) continue
      const clone: Token = { ...token, staff: dest.n, layer: destVoice.layers[0] ?? 1, pitches: token.pitches.map((p) => ({ ...p })) }
      const same = dest.tokens.find((t) => t.onset === token.onset && t.quarters === token.quarters && t.pitches.length > 0)
      if (same) same.pitches.push(...clone.pitches)
      else dest.tokens.push(clone)
      token.pitches = []
    }
  }
}

export function meiToMusicXml(
  mei: string,
  options: { title?: string; overrides?: Record<string, string>; voices?: VoiceDefinition[] } = {}
): string {
  const doc = new DOMParser().parseFromString(mei, 'application/xml')
  const staves = findStaves(doc)
  collectTokens(doc, staves)
  relocate(staves, options.overrides ?? {}, options.voices ?? [])

  const ordered = [...staves.values()].sort((a, b) => a.n - b.n)
  let divisions = 4
  for (const staff of ordered) {
    for (const token of staff.tokens) {
      while (Math.abs(token.quarters * divisions - Math.round(token.quarters * divisions)) > 1e-6 && divisions < 64) {
        divisions *= 2
      }
    }
  }

  const partList = ordered.map((staff, i) => {
    const id = `P${i + 1}`
    return `<score-part id="${id}"><part-name>${escapeXml(staff.label)}</part-name></score-part>`
  }).join('')

  const parts = ordered.map((staff, i) => {
    const id = `P${i + 1}`
    const tokens = [...staff.tokens].sort((a, b) => a.onset - b.onset || a.layer - b.layer)
    const body = tokens.map((token) => {
      if (token.pitches.length === 0) return emitNote(token, null, false, divisions)
      return token.pitches.map((pitch, index) => emitNote(token, pitch, index > 0, divisions)).join('')
    }).join('')
    const attributes = `<attributes><divisions>${divisions}</divisions><key><fifths>${staff.fifths}</fifths></key><time><beats>${staff.beats}</beats><beat-type>${staff.beatType}</beat-type></time><clef><sign>${staff.clefShape}</sign><line>${staff.clefLine}</line></clef></attributes>`
    return `<part id="${id}"><measure number="1">${attributes}${body}</measure></part>`
  }).join('')

  const title = options.title ? `<work><work-title>${escapeXml(options.title)}</work-title></work>` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0">${title}<part-list>${partList}</part-list>${parts}</score-partwise>`
}

export function musicXmlForDownload(args: {
  originalXml: string | null
  originalMei: string | null
  editedMei: string | null
  overrides: Record<string, string>
  voices: VoiceDefinition[]
  title?: string
}): string | null {
  const { originalXml, originalMei, editedMei, overrides, voices, title } = args
  const meiChanged = Boolean(editedMei && originalMei && editedMei !== originalMei)
  const voiceChanged = Object.keys(overrides).length > 0
  if (!meiChanged && !voiceChanged) return originalXml
  const source = editedMei || originalMei
  if (!source) return originalXml
  try {
    return meiToMusicXml(source, { title, overrides, voices })
  } catch {
    return originalXml
  }
}
