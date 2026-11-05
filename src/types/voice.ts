export const EnsembleKind = {
  SATB: 'SATB',
  SSA: 'SSA',
  SSAA: 'SSAA',
  TTBB: 'TTBB',
  SA: 'SA',
  TB: 'TB',
  SAB: 'SAB',
  TTB: 'TTB',
  MIXED: 'MIXED',
  UNISON: 'UNISON',
} as const

export type EnsembleKind = (typeof EnsembleKind)[keyof typeof EnsembleKind]

export const VoiceType = {
  SOPRANO_1: 'S1',
  SOPRANO_2: 'S2',
  CONTRALTO_1: 'A1',
  CONTRALTO_2: 'A2',
  TENOR_1: 'T1',
  TENOR_2: 'T2',
  BAJO_1: 'B1',
  BAJO_2: 'B2',
  UNASSIGNED: 'UNASSIGNED',
} as const

export type VoiceType = (typeof VoiceType)[keyof typeof VoiceType]

export interface VoiceDefinition {
  id: string
  type: VoiceType
  label: string
  color: string
  midiChannel: number
  midiProgram: number
  visible: boolean
  muted: boolean
  solo: boolean
  volume: number
  partIds: string[]
  noteCount: number
  /** 0–1. Low values are a hint to check the assignment, not a blocker. */
  confidence: number
  /** Verovio / MusicXML staff number (1-based) this voice is read from. */
  globalStaff: number
  /** MusicXML voice numbers on that staff that belong to this line. */
  layers: number[]
}

export interface VoiceAssignment {
  noteId: string
  voiceId: string
  originalVoiceId: string
  isUserCorrected: boolean
}

export const VOICE_LABELS: Record<VoiceType, string> = {
  [VoiceType.SOPRANO_1]: 'Soprano 1',
  [VoiceType.SOPRANO_2]: 'Soprano 2',
  [VoiceType.CONTRALTO_1]: 'Contralto 1',
  [VoiceType.CONTRALTO_2]: 'Contralto 2',
  [VoiceType.TENOR_1]: 'Tenor 1',
  [VoiceType.TENOR_2]: 'Tenor 2',
  [VoiceType.BAJO_1]: 'Bajo 1',
  [VoiceType.BAJO_2]: 'Bajo 2',
  [VoiceType.UNASSIGNED]: 'Sin asignar',
}
