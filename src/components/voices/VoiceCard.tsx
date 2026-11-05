import { useState } from 'react'
import { Volume2, VolumeX, Headphones } from 'lucide-react'
import type { VoiceDefinition } from '../../types/voice'
import { VoiceType, VOICE_LABELS } from '../../types/voice'
import { useVoiceStore } from '../../stores/voiceStore'

const ASSIGNABLE_TYPES: VoiceType[] = [
  VoiceType.SOPRANO_1,
  VoiceType.SOPRANO_2,
  VoiceType.CONTRALTO_1,
  VoiceType.CONTRALTO_2,
  VoiceType.TENOR_1,
  VoiceType.TENOR_2,
  VoiceType.BAJO_1,
  VoiceType.BAJO_2,
]

interface VoiceCardProps {
  voice: VoiceDefinition
}

export function VoiceCard({ voice }: VoiceCardProps) {
  const toggleMute = useVoiceStore((s) => s.toggleMute)
  const toggleSolo = useVoiceStore((s) => s.toggleSolo)
  const setVolume = useVoiceStore((s) => s.setVolume)
  const changeVoiceType = useVoiceStore((s) => s.changeVoiceType)
  const uncertain = voice.confidence < 0.75
  const [showType, setShowType] = useState(uncertain)

  return (
    <div
      className={`rounded-lg p-3 transition-all border-l-4 ${
        voice.solo
          ? 'bg-blue-50'
          : voice.muted
            ? 'opacity-50 bg-gray-50'
            : 'bg-gray-50 hover:bg-gray-100'
      }`}
      style={{
        borderLeftColor: voice.solo ? '#3b82f6' : voice.muted ? '#d1d5db' : voice.color,
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: voice.color }}
        />
        <span className="text-xs text-gray-500 flex-1 truncate" title={voice.label}>
          {voice.label}
          {voice.noteCount > 0 && (
            <span className="ml-1 text-[10px] text-gray-400">({voice.noteCount})</span>
          )}
        </span>

        <button
          onClick={() => toggleSolo(voice.id)}
          className={`p-1.5 rounded transition-colors ${
            voice.solo
              ? 'bg-blue-500 text-white'
              : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
          }`}
          title={voice.solo ? 'Desactivar solo' : 'Escuchar solo esta voz'}
        >
          <Headphones className="w-4 h-4" />
        </button>

        <button
          onClick={() => toggleMute(voice.id)}
          className={`p-1.5 rounded transition-colors ${
            voice.muted
              ? 'bg-red-100 text-red-600'
              : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
          }`}
          title={voice.muted ? 'Activar voz' : 'Silenciar voz'}
        >
          {voice.muted ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>
      </div>

      {showType ? (
        <select
          value={voice.type}
          onChange={(e) => changeVoiceType(voice.id, e.target.value as VoiceType)}
          className="w-full text-sm font-medium rounded border border-gray-200 px-2 py-1 mb-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          style={{ borderLeftColor: voice.color, borderLeftWidth: 3 }}
        >
          {ASSIGNABLE_TYPES.map((t) => (
            <option key={t} value={t}>{VOICE_LABELS[t]}</option>
          ))}
          <option value={VoiceType.UNASSIGNED}>Sin asignar</option>
        </select>
      ) : (
        <button
          type="button"
          onClick={() => setShowType(true)}
          className="text-[11px] text-gray-400 hover:text-gray-600 mb-2"
        >
          Cambiar cuerda
        </button>
      )}

      <input
        type="range"
        min="0"
        max="100"
        value={Math.round(voice.volume * 100)}
        onChange={(e) => setVolume(voice.id, parseInt(e.target.value, 10) / 100)}
        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        style={{ accentColor: voice.color }}
      />
    </div>
  )
}
