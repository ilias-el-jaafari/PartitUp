import { useEffect } from 'react'
import { useCorrectionStore } from '../stores/correctionStore'
import { useScoreStore } from '../stores/scoreStore'

export function useKeyboardShortcuts() {
  const clearSelection = useCorrectionStore((s) => s.clearSelection)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      const score = useScoreStore.getState()
      const correction = useCorrectionStore.getState()
      const hasSelection = correction.selectedNoteIds.size > 0

      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault()
        void score.undoEdit()
        return
      }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault()
        void score.redoEdit()
        return
      }
      if (e.key === 'Escape') {
        clearSelection()
        return
      }

      if (!correction.correctionMode || !hasSelection) return
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        score.nudgeSelectedNotes(e.shiftKey ? 7 : 1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        score.nudgeSelectedNotes(e.shiftKey ? -7 : -1)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        score.deleteSelectedNotes()
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        score.addNotesFromSelectedRests()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clearSelection])
}
