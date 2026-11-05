import type { VerovioToolkit } from 'verovio/esm'
import { getVerovioToolkit } from './verovioInstance'
import { stripNonVocalParts } from '../musicxml/voiceIdentifier'
import type { SoundingNote } from '../audio/midiChannels'

export interface RenderResult {
  svg: string
  pageCount: number
  /** MIDI of the full score, aligned with `mei` and `sounding`. */
  midi: string
  /** MIDI with non-vocal parts removed, used when channel rewrite cannot match notes. */
  fallbackMidi: string
  mei: string
  sounding: SoundingNote[]
}

let currentToolkit: VerovioToolkit | null = null

function readSoundingNotes(tk: VerovioToolkit): SoundingNote[] {
  const toolkit = tk as unknown as {
    renderToTimemap: () => Array<{ on?: string[]; qstamp?: number }>
    getMIDIValuesForElement: (id: string) => { pitch?: number }
  }
  try {
    const timemap = toolkit.renderToTimemap()
    const notes: SoundingNote[] = []
    for (const entry of timemap) {
      if (typeof entry.qstamp !== 'number') continue
      for (const id of entry.on ?? []) {
        const values = toolkit.getMIDIValuesForElement(id)
        if (typeof values?.pitch !== 'number') continue
        notes.push({ id, qstamp: entry.qstamp, pitch: values.pitch })
      }
    }
    return notes
  } catch {
    return []
  }
}

export async function loadScore(musicXml: string): Promise<RenderResult> {
  const tk = await getVerovioToolkit()
  currentToolkit = tk

  tk.loadData(musicXml)
  const pageCount = tk.getPageCount()
  const svg = tk.renderToSVG(1)
  const mei = (tk as unknown as { getMEI: (o: object) => string }).getMEI({})
  const sounding = readSoundingNotes(tk)
  const midi = tk.renderToMIDI()

  const vocalOnlyXml = stripNonVocalParts(musicXml)
  let fallbackMidi = midi
  if (vocalOnlyXml !== musicXml) {
    tk.loadData(vocalOnlyXml)
    fallbackMidi = tk.renderToMIDI()
    tk.loadData(musicXml)
  }

  return { svg, pageCount, midi, fallbackMidi, mei, sounding }
}

export async function renderPage(page: number): Promise<string> {
  if (!currentToolkit) throw new Error('No score loaded')
  return currentToolkit.renderToSVG(page)
}

export async function getMidi(): Promise<string> {
  if (!currentToolkit) throw new Error('No score loaded')
  return currentToolkit.renderToMIDI()
}

export async function getPageCount(): Promise<number> {
  if (!currentToolkit) throw new Error('No score loaded')
  return currentToolkit.getPageCount()
}

export function getToolkit(): VerovioToolkit | null {
  return currentToolkit
}

// Return the MEI the toolkit currently holds. Verovio assigns each note an
// xml:id that equals the SVG element id, so this MEI is the editable model
// behind the rendered score.
export function getMei(): string {
  if (!currentToolkit) throw new Error('No score loaded')
  return (currentToolkit as unknown as { getMEI: (o: object) => string }).getMEI({})
}

// Load an (edited) MEI string back into the toolkit and re-render the SVG and
// the MIDI so both the score and the audio reflect the edit.
export function renderFromMei(
  mei: string,
  page = 1
): { svg: string; midi: string; fallbackMidi: string; pageCount: number; mei: string; sounding: SoundingNote[] } {
  if (!currentToolkit) throw new Error('No score loaded')
  currentToolkit.loadData(mei)
  const pageCount = currentToolkit.getPageCount()
  const safePage = Math.min(Math.max(page, 1), pageCount || 1)
  const svg = currentToolkit.renderToSVG(safePage)
  const midi = currentToolkit.renderToMIDI()
  const sounding = readSoundingNotes(currentToolkit)
  return { svg, midi, fallbackMidi: midi, pageCount, mei, sounding }
}
