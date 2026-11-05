import { create } from 'zustand'
import {
  initAudioEngine,
  loadMidiData,
  play as audioPlay,
  pause as audioPause,
  stop as audioStop,
  setPlaybackRate,
  getCurrentTime,
  getDuration,
  isPaused,
  renderToWav,
  applyVoiceSettings,
  seekTo,
} from '../lib/audio/synthesizer'
import { savePreferences } from '../lib/memory/practiceMemory'
import { useVoiceStore } from './voiceStore'

interface PlaybackState {
  isPlaying: boolean
  isReady: boolean
  isLoading: boolean
  currentTime: number
  duration: number
  tempo: number
  error: string | null
  isExporting: boolean
  exportProgress: number

  initAndLoad: (midiBase64: string) => Promise<void>
  reloadMidi: (midiBase64: string) => Promise<void>
  play: () => Promise<void>
  pause: () => void
  stop: () => void
  setTempo: (tempo: number) => void
  seek: (seconds: number) => void
  updateTime: () => void
  exportWav: (midiBase64: string) => Promise<Blob | null>
  reset: () => void
}

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  isPlaying: false,
  isReady: false,
  isLoading: false,
  currentTime: 0,
  duration: 0,
  tempo: 1.0,
  error: null,
  isExporting: false,
  exportProgress: 0,

  initAndLoad: async (midiBase64: string) => {
    set({ isLoading: true, error: null })
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tiempo de espera agotado cargando audio. Recarga la página e inténtalo de nuevo.')), 60_000)
      )
      await Promise.race([
        (async () => {
          await initAudioEngine()
          await loadMidiData(midiBase64)
        })(),
        timeout,
      ])

      const voiceState = useVoiceStore.getState()
      applyVoiceSettings(voiceState.voices, voiceState.channelMap)
      setPlaybackRate(get().tempo)

      set({
        isLoading: false,
        isReady: true,
        duration: getDuration(),
      })
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Error inicializando audio',
      })
    }
  },

  reloadMidi: async (midiBase64: string) => {
    // Swap in freshly edited MIDI without the full loading UI, keeping the
    // current voice mute/solo/volume settings.
    try {
      audioStop()
      await loadMidiData(midiBase64)
      const voiceState = useVoiceStore.getState()
      applyVoiceSettings(voiceState.voices, voiceState.channelMap)
      setPlaybackRate(get().tempo)
      set({ isPlaying: false, currentTime: 0, duration: getDuration() })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Error recargando audio' })
    }
  },

  play: async () => {
    try {
      await audioPlay()
      set({ isPlaying: true })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Error de reproducción' })
    }
  },

  pause: () => {
    audioPause()
    set({ isPlaying: false })
  },

  stop: () => {
    audioStop()
    set({ isPlaying: false, currentTime: 0 })
  },

  setTempo: (tempo: number) => {
    const next = Math.max(0.25, Math.min(2, tempo))
    setPlaybackRate(next)
    set({ tempo: next })
    void savePreferences({ tempo: next })
  },

  seek: (seconds: number) => {
    seekTo(seconds)
    set({ currentTime: seconds })
  },

  updateTime: () => {
    const time = getCurrentTime()
    const paused = isPaused()
    set({
      currentTime: time,
      isPlaying: !paused,
    })
  },

  exportWav: async (midiBase64: string) => {
    set({ isExporting: true, exportProgress: 0 })
    try {
      const blob = await renderToWav(midiBase64, (progress) => {
        set({ exportProgress: progress })
      })
      set({ isExporting: false, exportProgress: 1 })
      return blob
    } catch (err) {
      set({
        isExporting: false,
        error: err instanceof Error ? err.message : 'Error exportando audio',
      })
      return null
    }
  },

  reset: () => {
    audioStop()
    set({
      isPlaying: false,
      isReady: false,
      isLoading: false,
      currentTime: 0,
      duration: 0,
      tempo: 1.0,
      error: null,
      isExporting: false,
      exportProgress: 0,
    })
  },
}))
