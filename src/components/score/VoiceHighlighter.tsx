import { useEffect, useMemo, useRef } from 'react'
import { useVoiceStore } from '../../stores/voiceStore'
import { useCorrectionStore } from '../../stores/correctionStore'
import { useScoreStore } from '../../stores/scoreStore'
import { resolveNoteVoices } from '../../lib/musicxml/noteVoices'

interface VoiceHighlighterProps {
  containerRef: React.RefObject<HTMLDivElement | null>
}

// Escape a Verovio note id for use in a CSS attribute selector.
function cssEscapeId(id: string): string {
  return id.replace(/["\\]/g, '\\$&')
}

export function VoiceHighlighter({ containerRef }: VoiceHighlighterProps) {
  const voices = useVoiceStore((s) => s.voices)
  const staffVoiceMap = useVoiceStore((s) => s.staffVoiceMap)
  const noteVoiceOverrides = useCorrectionStore((s) => s.noteVoiceOverrides)
  const mei = useScoreStore((s) => s.editedMei ?? s.mei)
  const prevStylesRef = useRef<HTMLStyleElement | null>(null)
  const noteVoices = useMemo(
    () => (mei ? resolveNoteVoices(mei, voices, noteVoiceOverrides) : {}),
    [mei, voices, noteVoiceOverrides]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container || voices.length === 0) return

    if (prevStylesRef.current) {
      prevStylesRef.current.remove()
    }

    const svg = container.querySelector('svg')
    if (!svg) return

    const voiceById = new Map(voices.map((v) => [v.id, v]))
    const hasSolo = voices.some((v) => v.solo)

    const styleEl = document.createElement('style')
    let css = ''

    for (const [staffN, voiceId] of Object.entries(staffVoiceMap)) {
      const voice = voiceById.get(voiceId)
      if (!voice) continue

      const dimmed = hasSolo && !voice.solo
      const color = dimmed || voice.muted ? '#ccc' : voice.color
      const opacity = dimmed ? 0.15 : voice.muted ? 0.3 : 1

      css += `.score-container svg .staff[data-n="${staffN}"] .note,
.score-container svg .staff[data-n="${staffN}"] .beam,
.score-container svg .staff[data-n="${staffN}"] .stem {
  fill: ${color} !important;
  stroke: ${color} !important;
  opacity: ${opacity};
}
`
    }

    // Dim staves not mapped to any voice (e.g., piano)
    const allStaffs = svg.querySelectorAll('.staff[data-n]')
    allStaffs.forEach((staff) => {
      const n = staff.getAttribute('data-n')
      if (n && !(n in staffVoiceMap)) {
        css += `.score-container svg .staff[data-n="${n}"] .note,
.score-container svg .staff[data-n="${n}"] .beam,
.score-container svg .staff[data-n="${n}"] .stem {
  fill: #d0d0d0 !important;
  stroke: #d0d0d0 !important;
  opacity: 0.4;
}
`
      }
    })

    // Divisi (two voices on one staff) and manual reassignment are colored per note,
    // because a staff-wide color would paint both lines the same.
    const staffVoices = new Set(Object.values(staffVoiceMap))
    for (const [noteId, voiceId] of Object.entries(noteVoices)) {
      const overridden = noteVoiceOverrides[noteId] === voiceId
      if (!overridden && staffVoices.has(voiceId)) continue
      const voice = voiceById.get(voiceId)
      if (!voice) continue

      const dimmed = hasSolo && !voice.solo
      const color = dimmed || voice.muted ? '#ccc' : voice.color
      const opacity = dimmed ? 0.15 : voice.muted ? 0.3 : 1
      const sel = `.score-container svg [id="${cssEscapeId(noteId)}"]`

      css += `${sel}, ${sel} .note, ${sel} .notehead, ${sel} .stem, ${sel} .beam {
  fill: ${color} !important;
  stroke: ${color} !important;
  opacity: ${opacity};
}
`
    }

    styleEl.textContent = css
    document.head.appendChild(styleEl)
    prevStylesRef.current = styleEl

    return () => {
      styleEl.remove()
    }
  }, [voices, staffVoiceMap, noteVoiceOverrides, noteVoices, containerRef])

  return null
}
