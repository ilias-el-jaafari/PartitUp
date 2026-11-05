import { create } from 'zustand'

export interface EditSnapshot {
  mei: string
  overrides: Record<string, string>
}

interface EditHistoryState {
  past: EditSnapshot[]
  future: EditSnapshot[]
  push: (snapshot: EditSnapshot) => void
  undo: (current: EditSnapshot) => EditSnapshot | null
  redo: (current: EditSnapshot) => EditSnapshot | null
  reset: () => void
}

export const useEditHistory = create<EditHistoryState>((set, get) => ({
  past: [],
  future: [],

  push: (snapshot) => {
    set((state) => ({ past: [...state.past, snapshot], future: [] }))
  },

  undo: (current) => {
    const { past } = get()
    if (past.length === 0) return null
    const prev = past[past.length - 1]
    set({ past: past.slice(0, -1), future: [...get().future, current] })
    return prev
  },

  redo: (current) => {
    const { future } = get()
    if (future.length === 0) return null
    const next = future[future.length - 1]
    set({ future: future.slice(0, -1), past: [...get().past, current] })
    return next
  },

  reset: () => set({ past: [], future: [] }),
}))
