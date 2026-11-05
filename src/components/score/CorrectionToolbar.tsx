import { useMemo, useState } from 'react'
import { Undo2, Redo2, MousePointer2, X, ArrowUp, ArrowDown, Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { useCorrectionStore } from '../../stores/correctionStore'
import { useVoiceStore } from '../../stores/voiceStore'
import { useScoreStore } from '../../stores/scoreStore'
import { useEditHistory } from '../../stores/editHistoryStore'
import { VOICE_LABELS, VoiceType } from '../../types/voice'
import { findSuspectNotes } from '../../lib/musicxml/suspectNotes'

export function CorrectionToolbar() {
  const selectedNoteIds = useCorrectionStore((s) => s.selectedNoteIds)
  const clearSelection = useCorrectionStore((s) => s.clearSelection)
  const reassignSelectedTo = useCorrectionStore((s) => s.reassignSelectedTo)
  const correctionMode = useCorrectionStore((s) => s.correctionMode)
  const setCorrectionMode = useCorrectionStore((s) => s.setCorrectionMode)
  const voices = useVoiceStore((s) => s.voices)
  const nudgeSelectedNotes = useScoreStore((s) => s.nudgeSelectedNotes)
  const nudgeNoteIds = useScoreStore((s) => s.nudgeNoteIds)
  const deleteSelectedNotes = useScoreStore((s) => s.deleteSelectedNotes)
  const deleteNoteIds = useScoreStore((s) => s.deleteNoteIds)
  const addNotesFromSelectedRests = useScoreStore((s) => s.addNotesFromSelectedRests)
  const undoEdit = useScoreStore((s) => s.undoEdit)
  const redoEdit = useScoreStore((s) => s.redoEdit)
  const mei = useScoreStore((s) => s.editedMei ?? s.mei)
  const past = useEditHistory((s) => s.past.length)
  const future = useEditHistory((s) => s.future.length)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const suspects = useMemo(() => {
    if (!mei) return []
    return findSuspectNotes(mei).filter((note) => !dismissed.has(note.id))
  }, [mei, dismissed])

  const hasSelection = selectedNoteIds.size > 0

  return (
    <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2 flex flex-col gap-2 shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setCorrectionMode(!correctionMode)}
          className="text-xs text-gray-500 hover:text-gray-800 underline-offset-2 hover:underline"
        >
          {correctionMode ? 'Ocultar corrección manual' : 'Corregir notas (solo si hace falta)'}
        </button>
        {suspects.length > 0 && (
          <span className="text-xs text-amber-800">
            {suspects.length} nota{suspects.length > 1 ? 's' : ''} dudosa{suspects.length > 1 ? 's' : ''}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => { void undoEdit() }}
            disabled={past === 0}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
            title="Deshacer (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => { void redoEdit() }}
            disabled={future === 0}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
            title="Rehacer (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {suspects.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-600">{suspects[0].reason}</span>
          <button
            type="button"
            className="px-2 py-1 rounded bg-amber-100 text-amber-900 hover:bg-amber-200"
            onClick={() => {
              const note = suspects[0]
              if (note.steps === null) void deleteNoteIds([note.id])
              else void nudgeNoteIds([note.id], note.steps)
            }}
          >
            Aplicar
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
            onClick={() => setDismissed((prev) => new Set(prev).add(suspects[0].id))}
          >
            Ignorar
          </button>
        </div>
      )}

      {correctionMode && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-sm text-gray-500">
            <MousePointer2 className="w-4 h-4" />
            <span>Selecciona una nota solo para un caso excepcional</span>
          </div>
          {hasSelection && (
            <>
              <span className="text-sm text-blue-600 font-medium">
                {selectedNoteIds.size} nota{selectedNoteIds.size > 1 ? 's' : ''}
              </span>
              <button type="button" onClick={() => { void nudgeSelectedNotes(1) }} className="p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-100" title="Subir un tono">
                <ArrowUp className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => { void nudgeSelectedNotes(-1) }} className="p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-100" title="Bajar un tono">
                <ArrowDown className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => { void deleteSelectedNotes() }} className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600" title="Borrar nota">
                <Trash2 className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => { void addNotesFromSelectedRests() }} className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-green-50 hover:text-green-600" title="Convertir silencio en nota">
                <Plus className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs text-gray-500">Asignar a:</span>
                {voices.map((voice) => {
                  const label = voice.type !== VoiceType.UNASSIGNED ? VOICE_LABELS[voice.type] : voice.label
                  return (
                    <button
                      key={voice.id}
                      type="button"
                      onClick={() => reassignSelectedTo(voice.id)}
                      className="px-2 py-1 text-xs rounded border transition-colors hover:opacity-80"
                      style={{ borderColor: voice.color, color: voice.color, backgroundColor: `${voice.color}10` }}
                      title={`Asignar a ${label}`}
                    >
                      {voice.type !== VoiceType.UNASSIGNED ? voice.type : voice.label}
                    </button>
                  )
                })}
              </div>
              <button type="button" onClick={clearSelection} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Limpiar selección">
                <X className="w-4 h-4" />
              </button>
            </>
          )}
          <span className="sr-only">{correctionMode ? <ChevronUp /> : <ChevronDown />}</span>
        </div>
      )}
    </div>
  )
}
