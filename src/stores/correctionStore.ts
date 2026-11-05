import { create } from 'zustand'
import { requestPracticeRefresh } from './practiceRefresh'

let beforeVoiceEdit: (() => void) | null = null

export function setBeforeVoiceEdit(fn: () => void) {
  beforeVoiceEdit = fn
}

interface CorrectionOp {
  noteIds: string[]
  // previous voice id per note, so undo can restore exactly
  prev: Record<string, string | undefined>
  toVoiceId: string
}

interface CorrectionState {
  selectedNoteIds: Set<string>
  // Manual per-note voice assignment that overrides the staff-based default.
  noteVoiceOverrides: Record<string, string>
  undoStack: CorrectionOp[]
  redoStack: CorrectionOp[]
  isSelecting: boolean
  correctionMode: boolean

  selectNote: (noteId: string, addToSelection: boolean) => void
  selectNotes: (noteIds: string[]) => void
  clearSelection: () => void
  setSelecting: (selecting: boolean) => void
  setCorrectionMode: (enabled: boolean) => void
  reassignSelectedTo: (voiceId: string) => void
  replaceOverrides: (overrides: Record<string, string>, refresh?: boolean) => void
  undo: () => void
  redo: () => void
  reset: () => void
}

export const useCorrectionStore = create<CorrectionState>((set, get) => ({
  selectedNoteIds: new Set<string>(),
  noteVoiceOverrides: {},
  undoStack: [],
  redoStack: [],
  isSelecting: false,
  correctionMode: false,

  selectNote: (noteId: string, addToSelection: boolean) => {
    const current = get().selectedNoteIds
    const next = new Set(addToSelection ? current : [])
    if (next.has(noteId)) {
      next.delete(noteId)
    } else {
      next.add(noteId)
    }
    set({ selectedNoteIds: next })
  },

  selectNotes: (noteIds: string[]) => {
    set({ selectedNoteIds: new Set(noteIds) })
  },

  clearSelection: () => {
    set({ selectedNoteIds: new Set() })
  },

  setSelecting: (selecting: boolean) => {
    set({ isSelecting: selecting })
  },

  setCorrectionMode: (enabled: boolean) => {
    set({ correctionMode: enabled })
  },

  reassignSelectedTo: (voiceId: string) => {
    const { selectedNoteIds, noteVoiceOverrides } = get()
    if (selectedNoteIds.size === 0) return

    beforeVoiceEdit?.()

    const noteIds = Array.from(selectedNoteIds)
    const prev: Record<string, string | undefined> = {}
    const nextOverrides = { ...noteVoiceOverrides }

    for (const id of noteIds) {
      prev[id] = noteVoiceOverrides[id]
      nextOverrides[id] = voiceId
    }

    set((state) => ({
      noteVoiceOverrides: nextOverrides,
      undoStack: [...state.undoStack, { noteIds, prev, toVoiceId: voiceId }],
      redoStack: [],
      selectedNoteIds: new Set(),
    }))
    requestPracticeRefresh()
  },

  replaceOverrides: (overrides, refresh = true) => {
    set({ noteVoiceOverrides: { ...overrides } })
    if (refresh) requestPracticeRefresh()
  },

  undo: () => {
    const { undoStack } = get()
    if (undoStack.length === 0) return
    const op = undoStack[undoStack.length - 1]

    const nextOverrides = { ...get().noteVoiceOverrides }
    for (const id of op.noteIds) {
      const before = op.prev[id]
      if (before === undefined) {
        delete nextOverrides[id]
      } else {
        nextOverrides[id] = before
      }
    }

    set((state) => ({
      noteVoiceOverrides: nextOverrides,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, op],
    }))
    requestPracticeRefresh()
  },

  redo: () => {
    const { redoStack } = get()
    if (redoStack.length === 0) return
    const op = redoStack[redoStack.length - 1]

    const nextOverrides = { ...get().noteVoiceOverrides }
    for (const id of op.noteIds) {
      nextOverrides[id] = op.toVoiceId
    }

    set((state) => ({
      noteVoiceOverrides: nextOverrides,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, op],
    }))
    requestPracticeRefresh()
  },

  reset: () => {
    set({
      selectedNoteIds: new Set(),
      noteVoiceOverrides: {},
      undoStack: [],
      redoStack: [],
      isSelecting: false,
      correctionMode: false,
    })
  },
}))
