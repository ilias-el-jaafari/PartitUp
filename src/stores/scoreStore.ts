import { create } from 'zustand'
import { loadScore, renderPage, renderFromMei } from '../lib/verovio/scoreRenderer'
import { detectFileType, type FileInputType } from '../types/score'
import { processImageOMR, prewarmOmrBackend, type OmrProgress } from '../lib/omr/omrClient'
import { transposeNotesDiatonic, deleteNotesToRests, restsToNotes } from '../lib/musicxml/meiNoteEditor'
import { resolveNoteVoices } from '../lib/musicxml/noteVoices'
import { rewriteMidiChannels, type SoundingNote } from '../lib/audio/midiChannels'
import { computeVoiceChannelMap } from '../lib/musicxml/voiceIdentifier'
import { useCorrectionStore, setBeforeVoiceEdit } from './correctionStore'
import { usePlaybackStore } from './playbackStore'
import { useVoiceStore } from './voiceStore'
import { useEditHistory, type EditSnapshot } from './editHistoryStore'
import { requestPracticeRefresh, setPracticeRefresh } from './practiceRefresh'
import { rememberScore } from '../lib/memory/practiceMemory'

interface ScoreState {
  musicXml: string | null
  mei: string | null
  editedMei: string | null
  svgContent: string | null
  rawMidiBase64: string | null
  fallbackMidiBase64: string | null
  sounding: SoundingNote[]
  midiBase64: string | null
  pageCount: number
  currentPage: number
  isLoading: boolean
  error: string | null
  fileName: string | null
  omrMessage: string | null

  loadFile: (file: File) => Promise<void>
  loadMusicXml: (xml: string, name?: string) => Promise<void>
  goToPage: (page: number) => Promise<void>
  nextPage: () => Promise<void>
  prevPage: () => Promise<void>
  nudgeSelectedNotes: (deltaSteps: number) => Promise<void>
  nudgeNoteIds: (ids: string[], deltaSteps: number) => Promise<void>
  deleteSelectedNotes: () => Promise<void>
  deleteNoteIds: (ids: string[]) => Promise<void>
  addNotesFromSelectedRests: () => Promise<void>
  undoEdit: () => Promise<void>
  redoEdit: () => Promise<void>
  refreshPracticeMidi: () => void
  cancelLoad: () => void
  reset: () => void
}

let activeOmr: AbortController | null = null

function extractFifths(musicXml: string | null): number {
  const match = musicXml?.match(/<fifths>\s*(-?\d+)\s*<\/fifths>/)
  return match ? parseInt(match[1], 10) : 0
}

function captureSnapshot(state: ScoreState): EditSnapshot {
  return {
    mei: state.editedMei ?? state.mei ?? '',
    overrides: { ...useCorrectionStore.getState().noteVoiceOverrides },
  }
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

function emptyScore(): Pick<ScoreState,
  'musicXml' | 'mei' | 'editedMei' | 'svgContent' | 'rawMidiBase64' | 'fallbackMidiBase64' |
  'sounding' | 'midiBase64' | 'pageCount' | 'currentPage' | 'isLoading' | 'error' | 'fileName' | 'omrMessage'
> {
  return {
    musicXml: null,
    mei: null,
    editedMei: null,
    svgContent: null,
    rawMidiBase64: null,
    fallbackMidiBase64: null,
    sounding: [],
    midiBase64: null,
    pageCount: 0,
    currentPage: 1,
    isLoading: false,
    error: null,
    fileName: null,
    omrMessage: null,
  }
}

export const useScoreStore = create<ScoreState>((set, get) => ({
  ...emptyScore(),

  loadFile: async (file: File) => {
    activeOmr?.abort()
    const controller = new AbortController()
    activeOmr = controller
    usePlaybackStore.getState().stop()
    useVoiceStore.getState().reset()
    useCorrectionStore.getState().reset()
    useEditHistory.getState().reset()
    set({
      isLoading: true,
      error: null,
      fileName: file.name,
      omrMessage: null,
      svgContent: null,
      musicXml: null,
      mei: null,
      editedMei: null,
      midiBase64: null,
    })
    try {
      const fileType: FileInputType = detectFileType(file)
      let xml: string
      if (fileType === 'musicxml') {
        xml = await readFileAsText(file)
      } else if (fileType === 'image' || fileType === 'pdf') {
        set({ omrMessage: 'Despertando el servidor…' })
        prewarmOmrBackend()
        const result = await processImageOMR(file, {
          signal: controller.signal,
          onProgress: (progress: OmrProgress) => {
            if (activeOmr === controller) set({ omrMessage: progress.message })
          },
        })
        if (result.status === 'error' || !result.musicXml) {
          throw new Error(result.message || 'Error procesando la partitura')
        }
        xml = result.musicXml
      } else {
        throw new Error('Los archivos MIDI no traen la partitura. Sube MusicXML, una imagen o un PDF.')
      }
      if (controller.signal.aborted) return
      await get().loadMusicXml(xml, file.name)
    } catch (err) {
      if (controller.signal.aborted) {
        set({ isLoading: false, omrMessage: null, error: null })
        return
      }
      set({
        isLoading: false,
        omrMessage: null,
        error: err instanceof Error ? err.message : 'Error desconocido',
      })
    } finally {
      if (activeOmr === controller) activeOmr = null
    }
  },

  loadMusicXml: async (xml: string, name?: string) => {
    set({ isLoading: true, error: null, omrMessage: 'Preparando la partitura…' })
    try {
      const result = await loadScore(xml)
      const fileName = name ?? get().fileName
      set({
        musicXml: xml,
        mei: result.mei,
        editedMei: null,
        svgContent: result.svg,
        rawMidiBase64: result.midi,
        fallbackMidiBase64: result.fallbackMidi,
        sounding: result.sounding,
        midiBase64: null,
        pageCount: result.pageCount,
        currentPage: 1,
        isLoading: false,
        omrMessage: null,
        fileName,
      })
      const tempo = usePlaybackStore.getState().tempo
      void rememberScore({ fileName: fileName ?? 'partitura', musicXml: xml, tempo })
    } catch (err) {
      set({
        isLoading: false,
        omrMessage: null,
        error: err instanceof Error ? err.message : 'Error cargando la partitura',
      })
    }
  },

  goToPage: async (page: number) => {
    const { pageCount } = get()
    if (page < 1 || page > pageCount) return
    const svg = await renderPage(page)
    set({ svgContent: svg, currentPage: page })
  },

  nextPage: async () => {
    const { currentPage, pageCount } = get()
    if (currentPage < pageCount) await get().goToPage(currentPage + 1)
  },

  prevPage: async () => {
    const { currentPage } = get()
    if (currentPage > 1) await get().goToPage(currentPage - 1)
  },

  nudgeSelectedNotes: async (deltaSteps: number) => {
    const ids = Array.from(useCorrectionStore.getState().selectedNoteIds)
    await get().nudgeNoteIds(ids, deltaSteps)
  },

  nudgeNoteIds: async (ids, deltaSteps) => {
    await applyEdit(get, set, ids, (mei, noteIds) =>
      transposeNotesDiatonic(mei, noteIds, deltaSteps, extractFifths(get().musicXml))
    )
  },

  deleteSelectedNotes: async () => {
    const ids = Array.from(useCorrectionStore.getState().selectedNoteIds)
    await get().deleteNoteIds(ids)
  },

  deleteNoteIds: async (ids) => {
    await applyEdit(get, set, ids, (mei, noteIds) => deleteNotesToRests(mei, noteIds))
  },

  addNotesFromSelectedRests: async () => {
    const ids = Array.from(useCorrectionStore.getState().selectedNoteIds)
    await applyEdit(get, set, ids, (mei, noteIds) => restsToNotes(mei, noteIds, extractFifths(get().musicXml)))
  },

  undoEdit: async () => {
    const current = captureSnapshot(get())
    const prev = useEditHistory.getState().undo(current)
    if (!prev) return
    await restoreSnapshot(get, set, prev)
  },

  redoEdit: async () => {
    const current = captureSnapshot(get())
    const next = useEditHistory.getState().redo(current)
    if (!next) return
    await restoreSnapshot(get, set, next)
  },

  refreshPracticeMidi: () => {
    const state = get()
    if (!state.rawMidiBase64) return
    const voices = useVoiceStore.getState().voices.filter((v) => v.partIds.length > 0 || v.globalStaff > 0)
    const mei = state.editedMei ?? state.mei ?? ''
    if (voices.length === 0 || !mei) {
      const fallback = state.fallbackMidiBase64 ?? state.rawMidiBase64
      if (fallback !== state.midiBase64) set({ midiBase64: fallback })
      return
    }
    const overrides = useCorrectionStore.getState().noteVoiceOverrides
    const noteVoices = resolveNoteVoices(mei, voices, overrides)
    const voiceChannels = Object.fromEntries(voices.map((v) => [v.id, v.midiChannel]))
    const fallbackMap = state.musicXml ? computeVoiceChannelMap(state.musicXml, voices) : voiceChannels
    const built = rewriteMidiChannels({
      midiBase64: state.rawMidiBase64,
      notes: state.sounding,
      noteVoices,
      voiceChannels,
      fallbackMidiBase64: state.fallbackMidiBase64 ?? state.rawMidiBase64,
      fallbackChannelMap: fallbackMap,
    })
    useVoiceStore.getState().setChannelMap(built.channelMap)
    if (built.midiBase64 !== get().midiBase64) set({ midiBase64: built.midiBase64 })
  },

  cancelLoad: () => {
    activeOmr?.abort()
    set({ isLoading: false, omrMessage: null })
  },

  reset: () => {
    activeOmr?.abort()
    usePlaybackStore.getState().reset()
    useVoiceStore.getState().reset()
    useCorrectionStore.getState().reset()
    useEditHistory.getState().reset()
    set(emptyScore())
  },
}))

setPracticeRefresh(() => {
  useScoreStore.getState().refreshPracticeMidi()
})

setBeforeVoiceEdit(() => {
  const state = useScoreStore.getState()
  if (!state.mei && !state.editedMei) return
  useEditHistory.getState().push(captureSnapshot(state))
})

async function restoreSnapshot(
  get: () => ScoreState,
  set: (partial: Partial<ScoreState>) => void,
  snapshot: EditSnapshot
) {
  useCorrectionStore.getState().replaceOverrides(snapshot.overrides, false)
  if (!snapshot.mei) return
  const rendered = renderFromMei(snapshot.mei, get().currentPage)
  const editedMei = snapshot.mei === get().mei ? null : snapshot.mei
  set({
    editedMei,
    svgContent: rendered.svg,
    rawMidiBase64: rendered.midi,
    fallbackMidiBase64: rendered.fallbackMidi,
    sounding: rendered.sounding,
    pageCount: rendered.pageCount,
  })
  requestPracticeRefresh()
}

async function applyEdit(
  get: () => ScoreState,
  set: (partial: Partial<ScoreState>) => void,
  ids: string[],
  edit: (mei: string, ids: string[]) => string
): Promise<void> {
  if (ids.length === 0) return
  try {
    const baseMei = get().editedMei ?? get().mei
    if (!baseMei) return
    const newMei = edit(baseMei, ids)
    if (newMei === baseMei) return
    useEditHistory.getState().push(captureSnapshot(get()))
    const rendered = renderFromMei(newMei, get().currentPage)
    set({
      editedMei: newMei,
      svgContent: rendered.svg,
      rawMidiBase64: rendered.midi,
      fallbackMidiBase64: rendered.fallbackMidi,
      sounding: rendered.sounding,
      pageCount: rendered.pageCount,
    })
    requestPracticeRefresh()
  } catch (err) {
    set({ error: err instanceof Error ? err.message : 'Error editando la nota' })
  }
}
