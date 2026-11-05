import { EnsembleKind, VoiceType, VOICE_LABELS, type VoiceDefinition } from '../../types/voice'
import { VOICE_COLORS } from '../../utils/colorPalette'

interface NoteInfo {
  pitch: number
}

export interface VoiceStream {
  partId: string
  partName: string
  staff: number
  globalStaff: number
  voice: number
  layers: number[]
  notes: NoteInfo[]
  minPitch: number
  maxPitch: number
  avgPitch: number
}

const PITCH_MAP: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
}

function pitchToMidi(step: string, octave: number, alter = 0): number {
  return (octave + 1) * 12 + (PITCH_MAP[step] ?? 0) + alter
}

const NON_VOCAL_PATTERNS = /piano|organ|keyboard|guitar|strings|orchestra|acomp|accomp|klavier|cello|violin|viola|flute|oboe|clarinet|trumpet|trombone|horn|timpani|harp|bassoon|continuo|basso\s*cont|percussion|drum|bater[ií]a/i

function isVocalPart(name: string): boolean {
  return !NON_VOCAL_PATTERNS.test(name)
}

function isGenericPartName(name: string): boolean {
  const s = name.trim()
  if (!s) return true
  return /^(?:part|voice|staff|voz|parte|track|p|v)[\s._-]*\d+$/i.test(s)
    || /^musicxml\s*part$/i.test(s)
}

type Family = 'soprano' | 'mezzo' | 'alto' | 'tenor' | 'baritone' | 'bass'

const NAME_RULES: { re: RegExp; family: Family }[] = [
  { re: /mezzo/i, family: 'mezzo' },
  { re: /sopran|tiple|cantus|dessus|diskant|superius/i, family: 'soprano' },
  { re: /contralto|\balto\b|altus|\balt\b/i, family: 'alto' },
  { re: /bar[ií]ton/i, family: 'baritone' },
  { re: /\btenor\b|tenore/i, family: 'tenor' },
  { re: /\bbaj[oa]\b|\bbass(?:us|o)?\b/i, family: 'bass' },
]

const FAMILY_CENTER: Record<Family, number> = {
  soprano: 72,
  mezzo: 69,
  alto: 65,
  tenor: 60,
  baritone: 55,
  bass: 48,
}

function nameFamily(name: string): Family | null {
  if (isGenericPartName(name)) return null
  for (const rule of NAME_RULES) {
    if (rule.re.test(name)) return rule.family
  }
  return null
}

function familyToType(family: Family, rank: number): VoiceType {
  const second = rank > 0
  switch (family) {
    case 'soprano': return second ? VoiceType.SOPRANO_2 : VoiceType.SOPRANO_1
    case 'mezzo':
    case 'alto': return second ? VoiceType.CONTRALTO_2 : VoiceType.CONTRALTO_1
    case 'tenor': return second ? VoiceType.TENOR_2 : VoiceType.TENOR_1
    case 'baritone':
    case 'bass': return second ? VoiceType.BAJO_2 : VoiceType.BAJO_1
  }
}

export function parseMusicXmlVoices(xmlString: string): VoiceStream[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/xml')

  const partNames = new Map<string, string>()
  doc.querySelectorAll('score-part').forEach((sp) => {
    const id = sp.getAttribute('id') ?? ''
    const name = sp.querySelector('part-name')?.textContent ?? id
    partNames.set(id, name)
  })

  const streamsMap = new Map<string, VoiceStream>()
  let staffCursor = 0

  doc.querySelectorAll('part').forEach((part) => {
    const partId = part.getAttribute('id') ?? ''
    const partName = partNames.get(partId) ?? partId
    const declared = parseInt(part.querySelector('attributes staves')?.textContent ?? '1', 10)
    let maxStaff = Number.isFinite(declared) && declared > 0 ? declared : 1
    part.querySelectorAll('note staff').forEach((staffEl) => {
      const n = parseInt(staffEl.textContent ?? '1', 10)
      if (n > maxStaff) maxStaff = n
    })
    const offset = staffCursor

    part.querySelectorAll('note').forEach((note) => {
      if (note.querySelector('rest')) return
      const pitch = note.querySelector('pitch')
      if (!pitch) return

      const step = pitch.querySelector('step')?.textContent ?? 'C'
      const octave = parseInt(pitch.querySelector('octave')?.textContent ?? '4', 10)
      const alter = parseInt(pitch.querySelector('alter')?.textContent ?? '0', 10)
      const localStaff = parseInt(note.querySelector('staff')?.textContent ?? '1', 10) || 1
      const voice = parseInt(note.querySelector('voice')?.textContent ?? '1', 10) || 1
      const globalStaff = offset + localStaff
      const midiPitch = pitchToMidi(step, octave, alter)

      const key = `${partId}-${globalStaff}-${voice}`
      if (!streamsMap.has(key)) {
        streamsMap.set(key, {
          partId,
          partName,
          staff: localStaff,
          globalStaff,
          voice,
          layers: [voice],
          notes: [],
          minPitch: midiPitch,
          maxPitch: midiPitch,
          avgPitch: 0,
        })
      }
      const stream = streamsMap.get(key)!
      stream.notes.push({ pitch: midiPitch })
      stream.minPitch = Math.min(stream.minPitch, midiPitch)
      stream.maxPitch = Math.max(stream.maxPitch, midiPitch)
    })

    staffCursor += maxStaff
  })

  const nonEmpty = Array.from(streamsMap.values()).filter((s) => s.notes.length > 0)
  for (const stream of nonEmpty) {
    stream.avgPitch = stream.notes.reduce((sum, n) => sum + n.pitch, 0) / stream.notes.length
  }
  const merged = mergeMinorVoices(nonEmpty)
  for (const stream of merged) {
    stream.avgPitch = stream.notes.reduce((sum, n) => sum + n.pitch, 0) / stream.notes.length
  }
  return merged.sort((a, b) => b.avgPitch - a.avgPitch)
}

// OMR often splits one melodic line into voice 1 (real) and voice 2 (a handful
// of misread noteheads). Merge those into the dominant line. A second voice
// with its own body of notes and a different register is divisi and stays.
function mergeMinorVoices(streams: VoiceStream[]): VoiceStream[] {
  const groups = new Map<string, VoiceStream[]>()
  for (const s of streams) {
    const key = `${s.partId}__${s.globalStaff}`
    const list = groups.get(key) ?? []
    list.push(s)
    groups.set(key, list)
  }

  const result: VoiceStream[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0])
      continue
    }
    group.sort((a, b) => b.notes.length - a.notes.length)
    const dominant = group[0]
    const threshold = Math.max(6, 0.15 * dominant.notes.length)
    result.push(dominant)
    for (let i = 1; i < group.length; i++) {
      const s = group[i]
      const gap = Math.abs(s.avgPitch - dominant.avgPitch)
      if (s.notes.length >= threshold && gap >= 4) {
        result.push(s)
        continue
      }
      if (gap >= 12 && s.notes.length < threshold) {
        // Isolated specks far from the line. Drop them so they don't pull the range.
        continue
      }
      dominant.notes.push(...s.notes)
      dominant.minPitch = Math.min(dominant.minPitch, s.minPitch)
      dominant.maxPitch = Math.max(dominant.maxPitch, s.maxPitch)
      for (const layer of s.layers) {
        if (!dominant.layers.includes(layer)) dominant.layers.push(layer)
      }
    }
  }
  return result.filter((s) => s.notes.length > 0)
}

function classifyByRange(avgPitch: number): Family {
  let best: Family = 'soprano'
  let bestDistance = Infinity
  for (const [name, center] of Object.entries(FAMILY_CENTER) as [Family, number][]) {
    if (name === 'mezzo' || name === 'baritone') continue
    const distance = Math.abs(avgPitch - center)
    if (distance < bestDistance) {
      bestDistance = distance
      best = name
    }
  }
  return best
}

interface Template {
  kind: EnsembleKind
  centers: number[]
  types: VoiceType[]
}

function templatesFor(count: number): Template[] {
  const S = VoiceType
  if (count === 1) {
    return [{ kind: EnsembleKind.UNISON, centers: [67], types: [S.SOPRANO_1] }]
  }
  if (count === 2) {
    return [
      { kind: EnsembleKind.SA, centers: [72, 65], types: [S.SOPRANO_1, S.CONTRALTO_1] },
      { kind: EnsembleKind.TB, centers: [58, 48], types: [S.TENOR_1, S.BAJO_1] },
    ]
  }
  if (count === 3) {
    return [
      { kind: EnsembleKind.SSA, centers: [74, 69, 64], types: [S.SOPRANO_1, S.SOPRANO_2, S.CONTRALTO_1] },
      { kind: EnsembleKind.SAB, centers: [72, 65, 50], types: [S.SOPRANO_1, S.CONTRALTO_1, S.BAJO_1] },
      { kind: EnsembleKind.TTB, centers: [60, 55, 48], types: [S.TENOR_1, S.TENOR_2, S.BAJO_1] },
    ]
  }
  if (count === 4) {
    return [
      { kind: EnsembleKind.SATB, centers: [72, 65, 57, 50], types: [S.SOPRANO_1, S.CONTRALTO_1, S.TENOR_1, S.BAJO_1] },
      { kind: EnsembleKind.SSAA, centers: [74, 70, 66, 62], types: [S.SOPRANO_1, S.SOPRANO_2, S.CONTRALTO_1, S.CONTRALTO_2] },
      { kind: EnsembleKind.TTBB, centers: [62, 57, 52, 46], types: [S.TENOR_1, S.TENOR_2, S.BAJO_1, S.BAJO_2] },
    ]
  }
  if (count === 5) {
    return [
      { kind: EnsembleKind.SATB, centers: [74, 70, 65, 57, 50], types: [S.SOPRANO_1, S.SOPRANO_2, S.CONTRALTO_1, S.TENOR_1, S.BAJO_1] },
      { kind: EnsembleKind.SSAA, centers: [76, 73, 70, 66, 62], types: [S.SOPRANO_1, S.SOPRANO_2, S.CONTRALTO_1, S.CONTRALTO_2, S.CONTRALTO_2] },
    ]
  }
  if (count === 6) {
    return [
      { kind: EnsembleKind.SATB, centers: [74, 71, 67, 64, 57, 50], types: [S.SOPRANO_1, S.SOPRANO_2, S.CONTRALTO_1, S.CONTRALTO_2, S.TENOR_1, S.BAJO_1] },
      { kind: EnsembleKind.SSAA, centers: [76, 73, 70, 67, 64, 61], types: [S.SOPRANO_1, S.SOPRANO_2, S.CONTRALTO_1, S.CONTRALTO_2, S.CONTRALTO_1, S.CONTRALTO_2] },
    ]
  }
  if (count === 8) {
    return [{
      kind: EnsembleKind.SATB,
      centers: [76, 72, 67, 63, 59, 55, 50, 45],
      types: [S.SOPRANO_1, S.SOPRANO_2, S.CONTRALTO_1, S.CONTRALTO_2, S.TENOR_1, S.TENOR_2, S.BAJO_1, S.BAJO_2],
    }]
  }
  const step = 24 / Math.max(1, count - 1)
  const centers = Array.from({ length: count }, (_, i) => 76 - i * step)
  const types = centers.map((c) => familyToType(classifyByRange(c), 0))
  return [{ kind: EnsembleKind.MIXED, centers, types }]
}

function templateForKind(kind: EnsembleKind, count: number): Template {
  const found = templatesFor(count).find((t) => t.kind === kind)
  if (found) return found
  const fallback = templatesFor(count)[0]
  return { ...fallback, kind }
}

function scoreTemplate(avgs: number[], centers: number[]): number {
  let sum = 0
  for (let i = 0; i < avgs.length; i++) {
    const distance = Math.abs(avgs[i] - centers[i])
    sum += Math.max(0, 1 - distance / 14)
  }
  return sum / avgs.length
}

function assignFromNames(streams: VoiceStream[]): VoiceType[] | null {
  const families = streams.map((s) => nameFamily(s.partName))
  const named = families.filter((f): f is Family => f !== null).length
  const trust = named === streams.length || (named >= 3 && named >= streams.length - 1)
  if (!trust) return null

  const types: VoiceType[] = streams.map(() => VoiceType.UNASSIGNED)
  const groups = new Map<Family, number[]>()
  families.forEach((family, index) => {
    if (!family) return
    const list = groups.get(family) ?? []
    list.push(index)
    groups.set(family, list)
  })
  for (const [family, indices] of groups) {
    indices.sort((a, b) => streams[b].avgPitch - streams[a].avgPitch)
    indices.forEach((streamIndex, rank) => {
      types[streamIndex] = familyToType(family, rank)
    })
  }
  streams.forEach((stream, index) => {
    if (types[index] === VoiceType.UNASSIGNED) {
      types[index] = familyToType(classifyByRange(stream.avgPitch), 0)
    }
  })
  return types
}

function nameContradictsPitch(family: Family, avgPitch: number): boolean {
  const center = FAMILY_CENTER[family]
  let distance = Math.abs(avgPitch - center)
  if (family === 'tenor') distance = Math.min(distance, Math.abs(avgPitch - (center + 12)))
  return distance > 16
}

function ensembleFromTypes(types: VoiceType[]): EnsembleKind {
  const has = (t: VoiceType) => types.includes(t)
  const high = types.every((t) => t === VoiceType.SOPRANO_1 || t === VoiceType.SOPRANO_2 || t === VoiceType.CONTRALTO_1 || t === VoiceType.CONTRALTO_2)
  const low = types.every((t) => t === VoiceType.TENOR_1 || t === VoiceType.TENOR_2 || t === VoiceType.BAJO_1 || t === VoiceType.BAJO_2)
  if (types.length === 1) return EnsembleKind.UNISON
  if (types.length === 4 && has(VoiceType.SOPRANO_1) && has(VoiceType.TENOR_1) && has(VoiceType.BAJO_1)) return EnsembleKind.SATB
  if (high && types.length >= 4) return EnsembleKind.SSAA
  if (high && types.length === 3) return EnsembleKind.SSA
  if (high) return EnsembleKind.SA
  if (low && types.length >= 4) return EnsembleKind.TTBB
  if (low && types.length === 3) return EnsembleKind.TTB
  if (low) return EnsembleKind.TB
  if (types.length === 3 && has(VoiceType.BAJO_1)) return EnsembleKind.SAB
  return EnsembleKind.MIXED
}

const MIDI_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]

export interface VoiceAnalysis {
  voices: VoiceDefinition[]
  ensemble: EnsembleKind
  confidence: number
  needsDisambiguation: boolean
}

export interface IdentifyOptions {
  ensemble?: EnsembleKind | 'auto'
}

export function analyzeVoices(musicXml: string, options: IdentifyOptions = {}): VoiceAnalysis {
  const allStreams = parseMusicXmlVoices(musicXml)
  const vocalStreams = allStreams.filter((s) => isVocalPart(s.partName))
  let streams = (vocalStreams.length > 0 ? vocalStreams : allStreams)
    .filter((s) => s.avgPitch >= 34 && s.avgPitch <= 96)

  if (streams.length > 1) {
    const largest = streams.reduce((m, s) => Math.max(m, s.notes.length), 0)
    if (largest >= 12) {
      streams = streams.filter((s) => s.notes.length >= 3 || s.notes.length >= largest * 0.08)
    }
  }

  if (streams.length === 0) {
    return {
      voices: [{
        id: 'voice-0',
        type: VoiceType.UNASSIGNED,
        label: 'Sin voces detectadas',
        color: VOICE_COLORS[VoiceType.UNASSIGNED],
        midiChannel: 0,
        midiProgram: 52,
        visible: true,
        muted: false,
        solo: false,
        volume: 0.8,
        partIds: [],
        noteCount: 0,
        confidence: 0,
        globalStaff: 0,
        layers: [],
      }],
      ensemble: EnsembleKind.UNISON,
      confidence: 0,
      needsDisambiguation: false,
    }
  }

  const forced = options.ensemble && options.ensemble !== 'auto' ? options.ensemble : null
  const avgs = streams.map((s) => s.avgPitch)
  const candidates = templatesFor(streams.length)
    .map((template) => ({ template, score: scoreTemplate(avgs, template.centers) }))
    .sort((a, b) => b.score - a.score)
  const best = candidates[0]
  const second = candidates[1]
  const chosen = forced ? templateForKind(forced, streams.length) : best.template
  const namedTypes = forced ? null : assignFromNames(streams)
  const types = namedTypes ?? chosen.types

  let confidence = namedTypes ? 0.92 : best.score
  if (namedTypes) {
    const contradiction = streams.some((stream) => {
      const family = nameFamily(stream.partName)
      return family ? nameContradictsPitch(family, stream.avgPitch) : false
    })
    if (contradiction) confidence = 0.55
  }
  const median = [...streams].sort((a, b) => a.notes.length - b.notes.length)[Math.floor(streams.length / 2)].notes.length
  if (streams.some((s) => s.notes.length < median * 0.25)) confidence *= 0.9

  const ambiguous = !forced && !namedTypes && second !== undefined && best.score - second.score < 0.08
  const needsDisambiguation = !forced && (ambiguous || confidence < 0.62)
  const ensemble = namedTypes ? ensembleFromTypes(types) : chosen.kind

  const voices = streams.map((stream, i) => {
    const type = types[i] ?? VoiceType.UNASSIGNED
    const partLabel = !isGenericPartName(stream.partName) && stream.partName !== stream.partId
      ? stream.partName.trim()
      : ''
    const rangeWidth = stream.maxPitch - stream.minPitch
    const voiceConfidence = Math.max(0, Math.min(1, confidence - (rangeWidth > 28 ? 0.15 : 0)))
    return {
      id: `voice-${i}`,
      type,
      label: partLabel || VOICE_LABELS[type],
      color: VOICE_COLORS[type] ?? '#95a5a6',
      midiChannel: MIDI_CHANNELS[i % MIDI_CHANNELS.length],
      midiProgram: 52,
      visible: true,
      muted: false,
      solo: false,
      volume: 0.8,
      partIds: [stream.partId],
      noteCount: stream.notes.length,
      confidence: voiceConfidence,
      globalStaff: stream.globalStaff,
      layers: [...stream.layers],
    }
  })

  const seen = new Map<string, number>()
  for (const voice of voices) {
    const n = (seen.get(voice.label) ?? 0) + 1
    seen.set(voice.label, n)
  }
  for (const [label, count] of seen) {
    if (count < 2) continue
    for (const voice of voices) {
      if (voice.label === label) voice.label = `${label} (${VOICE_LABELS[voice.type]})`
    }
  }

  return {
    voices,
    ensemble,
    confidence: Math.max(0, Math.min(1, confidence)),
    needsDisambiguation,
  }
}

export function identifyVoices(musicXml: string, options?: IdentifyOptions): VoiceDefinition[] {
  return analyzeVoices(musicXml, options).voices
}

export function computeVoiceChannelMap(
  musicXml: string,
  voices: VoiceDefinition[]
): Record<string, number> {
  const strippedXml = stripNonVocalParts(musicXml)
  const parser = new DOMParser()
  const doc = parser.parseFromString(strippedXml, 'text/xml')

  const partOrder: string[] = []
  doc.querySelectorAll('part').forEach((part) => {
    partOrder.push(part.getAttribute('id') ?? '')
  })

  const channelMap: Record<string, number> = {}
  for (const voice of voices) {
    for (const partId of voice.partIds) {
      const partIndex = partOrder.indexOf(partId)
      if (partIndex >= 0) {
        channelMap[voice.id] = MIDI_CHANNELS[partIndex % MIDI_CHANNELS.length]
        break
      }
    }
    if (channelMap[voice.id] === undefined) channelMap[voice.id] = voice.midiChannel
  }
  return channelMap
}

export function stripNonVocalParts(musicXml: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(musicXml, 'text/xml')

  const nonVocalIds: string[] = []
  let totalParts = 0

  doc.querySelectorAll('score-part').forEach((sp) => {
    totalParts++
    const id = sp.getAttribute('id') ?? ''
    const name = sp.querySelector('part-name')?.textContent?.trim() ?? ''
    if (NON_VOCAL_PATTERNS.test(name)) nonVocalIds.push(id)
  })

  if (nonVocalIds.length === 0 || nonVocalIds.length === totalParts) return musicXml

  for (const id of nonVocalIds) {
    doc.querySelector(`score-part[id="${id}"]`)?.remove()
    doc.querySelector(`part[id="${id}"]`)?.remove()
  }

  return new XMLSerializer().serializeToString(doc)
}

export function computeStaffVoiceMap(
  musicXml: string,
  voices: VoiceDefinition[]
): Record<number, string> {
  const byStaff = new Map<number, string[]>()
  for (const voice of voices) {
    if (!voice.globalStaff) continue
    const list = byStaff.get(voice.globalStaff) ?? []
    list.push(voice.id)
    byStaff.set(voice.globalStaff, list)
  }
  const staffVoiceMap: Record<number, string> = {}
  for (const [staff, ids] of byStaff) {
    if (ids.length === 1) staffVoiceMap[staff] = ids[0]
  }
  // Divisi staves are colored note-by-note. An empty map with no score is not an error.
  if (Object.keys(staffVoiceMap).length === 0 && musicXml.trim() === '') return {}
  return staffVoiceMap
}
