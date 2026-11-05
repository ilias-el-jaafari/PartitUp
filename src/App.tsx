import { useEffect } from 'react'
import { Header } from './components/layout/Header'
import { UploadZone } from './components/upload/UploadZone'
import { ScoreViewer } from './components/score/ScoreViewer'
import { VoicePanel } from './components/voices/VoicePanel'
import { PlaybackControls } from './components/audio/PlaybackControls'
import { useScoreStore } from './stores/scoreStore'
import { useVoiceStore } from './stores/voiceStore'
import { usePlaybackStore } from './stores/playbackStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { prewarmOmrBackend } from './lib/omr/omrClient'
import { getPreferences } from './lib/memory/practiceMemory'

export default function App() {
  const svgContent = useScoreStore((s) => s.svgContent)
  const musicXml = useScoreStore((s) => s.musicXml)
  const identifyFromMusicXml = useVoiceStore((s) => s.identifyFromMusicXml)
  const resetVoices = useVoiceStore((s) => s.reset)
  const isIdentified = useVoiceStore((s) => s.isIdentified)

  useKeyboardShortcuts()

  useEffect(() => {
    prewarmOmrBackend()
    void getPreferences().then((prefs) => {
      if (prefs && prefs.tempo > 0 && prefs.tempo !== 1) {
        usePlaybackStore.getState().setTempo(prefs.tempo)
      }
    })
  }, [])

  useEffect(() => {
    if (musicXml) {
      identifyFromMusicXml(musicXml)
    } else {
      resetVoices()
    }
  }, [musicXml, identifyFromMusicXml, resetVoices])

  useEffect(() => {
    if (!musicXml || !isIdentified) return
    let cancelled = false
    void getPreferences().then((prefs) => {
      if (cancelled || !prefs?.preferredVoiceType) return
      const state = useVoiceStore.getState()
      if (state.voices.some((voice) => voice.solo)) return
      const match = state.voices.find((voice) => voice.type === prefs.preferredVoiceType)
      if (match) state.soloVoice(match.id)
    })
    return () => {
      cancelled = true
    }
  }, [musicXml, isIdentified])

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {svgContent ? (
        <>
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
            <ScoreViewer />
            <VoicePanel />
          </div>
          <PlaybackControls />
        </>
      ) : (
        <main className="flex-1 flex">
          <UploadZone />
        </main>
      )}
    </div>
  )
}
