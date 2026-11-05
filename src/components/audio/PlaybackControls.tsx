import { useEffect, useRef, useCallback } from 'react'
import { Play, Pause, Square, Download, Loader2, Minus, Plus } from 'lucide-react'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useScoreStore } from '../../stores/scoreStore'
import { useVoiceStore } from '../../stores/voiceStore'
import { buildWavFilename } from '../../lib/audio/exportName'
import { resumeAudioContext } from '../../lib/audio/synthesizer'
import { VOICE_LABELS, VoiceType } from '../../types/voice'

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function PlaybackControls() {
  const midiBase64 = useScoreStore((s) => s.midiBase64)
  const fileName = useScoreStore((s) => s.fileName)
  const voices = useVoiceStore((s) => s.voices)
  const {
    isPlaying, isReady, isLoading, currentTime, duration, tempo, error,
    isExporting, exportProgress,
    initAndLoad, reloadMidi, play, pause, stop, setTempo, seek, updateTime, exportWav,
  } = usePlaybackStore()
  const animRef = useRef<number>(0)

  const loadedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!midiBase64) {
      loadedRef.current = null
      return
    }
    if (loadedRef.current === null) {
      loadedRef.current = midiBase64
      void initAndLoad(midiBase64)
      return
    }
    if (loadedRef.current !== midiBase64) {
      loadedRef.current = midiBase64
      void reloadMidi(midiBase64)
    }
  }, [midiBase64, initAndLoad, reloadMidi])

  const tick = useCallback(() => {
    updateTime()
    animRef.current = requestAnimationFrame(tick)
  }, [updateTime])

  useEffect(() => {
    if (isPlaying) {
      animRef.current = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(animRef.current)
    }
    return () => cancelAnimationFrame(animRef.current)
  }, [isPlaying, tick])

  const handleExport = async () => {
    if (!midiBase64) return
    const blob = await exportWav(midiBase64)
    if (blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const solo = voices.find((voice) => voice.solo)
      const voiceLabel = solo
        ? (solo.type !== VoiceType.UNASSIGNED ? VOICE_LABELS[solo.type] : solo.label)
        : null
      a.download = buildWavFilename(fileName, voiceLabel)
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  if (!midiBase64) return null

  return (
    <div className="bg-white border-t border-gray-200 px-3 sm:px-4 py-3 flex items-center gap-3 sm:gap-4 shrink-0 flex-wrap">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Cargando audio...</span>
        </div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : (
        <>
          <div className="flex items-center gap-1">
            <button
              onClick={stop}
              disabled={!isReady}
              className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
              title="Detener"
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                // Resume in this turn, before play() awaits. Otherwise Safari
                // keeps the audio device suspended and the choir is silent.
                resumeAudioContext()
                if (isPlaying) pause()
                else void play()
              }}
              disabled={!isReady}
              className="p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-30 transition-colors"
              title={isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600 min-w-[140px] flex-1">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              disabled={!isReady || duration <= 0}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="flex-1 h-1.5 accent-blue-500 cursor-pointer disabled:cursor-default"
              aria-label="Posición del ensayo"
            />
            <span>{formatTime(duration)}</span>
          </div>

          <div className="flex items-center gap-1 text-sm text-gray-600">
            <button
              onClick={() => setTempo(Math.max(0.25, tempo - 0.25))}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="min-w-[40px] text-center">{tempo}x</span>
            <button
              onClick={() => setTempo(Math.min(2, tempo + 0.25))}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <div className="ml-auto">
            <button
              onClick={handleExport}
              disabled={!isReady || isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-30 transition-colors"
              title="Descargar audio WAV"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{Math.round(exportProgress * 100)}%</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Descargar WAV</span>
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
