import { create } from 'zustand'
import type { VoiceDefinition } from '../types/voice'
import { type EnsembleKind, type VoiceType } from '../types/voice'
import { VOICE_COLORS } from '../utils/colorPalette'
import { analyzeVoices, computeStaffVoiceMap, computeVoiceChannelMap, type IdentifyOptions } from '../lib/musicxml/voiceIdentifier'
import { applyVoiceSettings } from '../lib/audio/synthesizer'
import { requestPracticeRefresh } from './practiceRefresh'
import { savePreferences } from '../lib/memory/practiceMemory'

interface VoiceState {
  voices: VoiceDefinition[]
  isIdentified: boolean
  staffVoiceMap: Record<number, string>
  channelMap: Record<string, number>
  ensemble: EnsembleKind | null
  confidence: number
  needsDisambiguation: boolean
  sourceXml: string | null

  identifyFromMusicXml: (xml: string, options?: IdentifyOptions) => void
  forceEnsemble: (ensemble: EnsembleKind | 'auto') => void
  changeVoiceType: (voiceId: string, newType: VoiceType) => void
  toggleMute: (voiceId: string) => void
  toggleSolo: (voiceId: string) => void
  soloVoice: (voiceId: string) => void
  clearSolo: () => void
  setVolume: (voiceId: string, volume: number) => void
  setVoiceLabel: (voiceId: string, label: string) => void
  setChannelMap: (channelMap: Record<string, number>) => void
  syncToAudio: () => void
  reset: () => void
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  voices: [],
  isIdentified: false,
  staffVoiceMap: {},
  channelMap: {},
  ensemble: null,
  confidence: 0,
  needsDisambiguation: false,
  sourceXml: null,

  identifyFromMusicXml: (xml: string, options?: IdentifyOptions) => {
    const previousSolo = options?.ensemble ? get().voices.find((v) => v.solo)?.type : undefined
    const analysis = analyzeVoices(xml, options)
    let voices = analysis.voices
    if (previousSolo) {
      const match = voices.some((v) => v.type === previousSolo)
      if (match) {
        voices = voices.map((v) => (
          v.type === previousSolo
            ? { ...v, solo: true, muted: false }
            : { ...v, solo: false, muted: true }
        ))
      }
    }
    const staffVoiceMap = computeStaffVoiceMap(xml, voices)
    const channelMap = computeVoiceChannelMap(xml, voices)
    set({
      voices,
      isIdentified: true,
      staffVoiceMap,
      channelMap,
      ensemble: analysis.ensemble,
      confidence: analysis.confidence,
      needsDisambiguation: analysis.needsDisambiguation,
      sourceXml: xml,
    })
    requestPracticeRefresh()
  },

  forceEnsemble: (ensemble) => {
    const xml = get().sourceXml
    if (!xml) return
    get().identifyFromMusicXml(xml, { ensemble })
  },

  changeVoiceType: (voiceId: string, newType: VoiceType) => {
    set({
      voices: get().voices.map((v) =>
        v.id === voiceId
          ? { ...v, type: newType, color: VOICE_COLORS[newType] ?? '#95a5a6' }
          : v
      ),
    })
  },

  toggleMute: (voiceId: string) => {
    const newVoices = get().voices.map((v) =>
      v.id === voiceId ? { ...v, muted: !v.muted, solo: false } : v
    )
    set({ voices: newVoices })
    applyVoiceSettings(newVoices, get().channelMap)
  },

  toggleSolo: (voiceId: string) => {
    const voice = get().voices.find((v) => v.id === voiceId)
    if (!voice) return

    const newSolo = !voice.solo
    const newVoices = get().voices.map((v) =>
      v.id === voiceId
        ? { ...v, solo: newSolo, muted: false }
        : { ...v, solo: false, muted: newSolo }
    )
    set({ voices: newVoices })
    applyVoiceSettings(newVoices, get().channelMap)
    if (newSolo) void savePreferences({ preferredVoiceType: voice.type })
  },

  soloVoice: (voiceId: string) => {
    const voice = get().voices.find((v) => v.id === voiceId)
    if (!voice) return
    if (voice.solo && get().voices.every((v) => v.id === voiceId || !v.solo)) return
    const newVoices = get().voices.map((v) =>
      v.id === voiceId
        ? { ...v, solo: true, muted: false }
        : { ...v, solo: false, muted: true }
    )
    set({ voices: newVoices })
    applyVoiceSettings(newVoices, get().channelMap)
    void savePreferences({ preferredVoiceType: voice.type })
  },

  clearSolo: () => {
    const newVoices = get().voices.map((v) => ({ ...v, solo: false, muted: false }))
    set({ voices: newVoices })
    applyVoiceSettings(newVoices, get().channelMap)
  },

  setVolume: (voiceId: string, volume: number) => {
    const newVoices = get().voices.map((v) =>
      v.id === voiceId ? { ...v, volume: Math.max(0, Math.min(1, volume)) } : v
    )
    set({ voices: newVoices })
    applyVoiceSettings(newVoices, get().channelMap)
  },

  setVoiceLabel: (voiceId: string, label: string) => {
    set({
      voices: get().voices.map((v) =>
        v.id === voiceId ? { ...v, label } : v
      ),
    })
  },

  setChannelMap: (channelMap) => {
    set({ channelMap })
    applyVoiceSettings(get().voices, channelMap)
  },

  syncToAudio: () => {
    applyVoiceSettings(get().voices, get().channelMap)
  },

  reset: () => {
    set({
      voices: [],
      isIdentified: false,
      staffVoiceMap: {},
      channelMap: {},
      ensemble: null,
      confidence: 0,
      needsDisambiguation: false,
      sourceXml: null,
    })
  },
}))
