import { useVoiceStore } from '../../stores/voiceStore'
import { EnsembleKind, VOICE_LABELS, VoiceType } from '../../types/voice'
import { VoiceCard } from './VoiceCard'

const ENSEMBLE_CHOICES: { id: EnsembleKind | 'auto'; label: string }[] = [
  { id: 'auto', label: 'Automático' },
  { id: EnsembleKind.SATB, label: 'SATB' },
  { id: EnsembleKind.SSA, label: 'SSA' },
  { id: EnsembleKind.SSAA, label: 'SSAA' },
  { id: EnsembleKind.TTBB, label: 'TTBB' },
  { id: EnsembleKind.SA, label: 'SA' },
  { id: EnsembleKind.TB, label: 'TB' },
]

export function VoicePanel() {
  const voices = useVoiceStore((s) => s.voices)
  const isIdentified = useVoiceStore((s) => s.isIdentified)
  const needsDisambiguation = useVoiceStore((s) => s.needsDisambiguation)
  const ensemble = useVoiceStore((s) => s.ensemble)
  const soloVoice = useVoiceStore((s) => s.soloVoice)
  const clearSolo = useVoiceStore((s) => s.clearSolo)
  const forceEnsemble = useVoiceStore((s) => s.forceEnsemble)
  const anySolo = voices.some((v) => v.solo)

  if (!isIdentified || voices.length === 0) return null

  return (
    <div className="w-full md:w-72 bg-white border-t md:border-t-0 md:border-l border-gray-200 flex flex-col shrink-0 max-h-[46vh] md:max-h-none">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-800 text-sm">Tu voz en el ensayo</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Elige tu cuerda: suena sola y las demás se atenúan.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {voices.map((voice) => {
            const label = voice.type !== VoiceType.UNASSIGNED ? VOICE_LABELS[voice.type] : voice.label
            return (
              <button
                key={voice.id}
                type="button"
                onClick={() => soloVoice(voice.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  voice.solo ? 'text-white border-transparent' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                }`}
                style={voice.solo ? { backgroundColor: voice.color, borderColor: voice.color } : undefined}
              >
                {label}
              </button>
            )
          })}
          {anySolo && (
            <button
              type="button"
              onClick={clearSolo}
              className="px-2.5 py-1 rounded-full text-xs text-gray-600 border border-gray-200 hover:bg-gray-50"
            >
              Escuchar todas
            </button>
          )}
        </div>
        {needsDisambiguation && (
          <div className="mt-3">
            <p className="text-xs text-amber-800">
              La formación no está clara{ensemble ? ` (parece ${ensemble})` : ''}. Elige el coro si hace falta.
            </p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {ENSEMBLE_CHOICES.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => forceEnsemble(choice.id)}
                  className="px-2 py-0.5 text-[11px] rounded border border-amber-200 text-amber-900 hover:bg-amber-50"
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {voices.map((voice) => (
          <VoiceCard key={voice.id} voice={voice} />
        ))}
      </div>
    </div>
  )
}
