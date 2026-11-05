import { Music, Download } from 'lucide-react'
import { useScoreStore } from '../../stores/scoreStore'
import { useCorrectionStore } from '../../stores/correctionStore'
import { useVoiceStore } from '../../stores/voiceStore'
import { musicXmlForDownload } from '../../lib/musicxml/meiToMusicXml'

export function Header() {
  const fileName = useScoreStore((s) => s.fileName)
  const musicXml = useScoreStore((s) => s.musicXml)
  const mei = useScoreStore((s) => s.mei)
  const editedMei = useScoreStore((s) => s.editedMei)
  const reset = useScoreStore((s) => s.reset)
  const overrides = useCorrectionStore((s) => s.noteVoiceOverrides)
  const voices = useVoiceStore((s) => s.voices)

  const downloadMusicXml = () => {
    const xml = musicXmlForDownload({
      originalXml: musicXml,
      originalMei: mei,
      editedMei,
      overrides,
      voices,
      title: fileName ?? undefined,
    })
    if (!xml) return
    const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const base = (fileName ?? 'ensayo').replace(/\.[^.]+$/, '')
    a.href = url
    a.download = `${base}.musicxml`
    a.click()
    URL.revokeObjectURL(url)
  }

  const corrected = Boolean(editedMei) || Object.keys(overrides).length > 0

  return (
    <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <Music className="w-7 h-7 text-blue-600 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 leading-none">PartitUp</h1>
          <p className="text-[11px] text-gray-500 mt-0.5">Ensayo coral</p>
        </div>
        {fileName && (
          <span className="text-sm text-gray-500 truncate hidden sm:inline">— {fileName}</span>
        )}
      </div>
      {fileName && (
        <div className="flex items-center gap-2 shrink-0">
          {musicXml && (
            <button
              onClick={downloadMusicXml}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600 px-3 py-1 rounded hover:bg-blue-50 transition-colors"
              title={corrected ? 'Descargar MusicXML con tus correcciones' : 'Descargar MusicXML'}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">MusicXML</span>
            </button>
          )}
          <button
            onClick={reset}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 rounded hover:bg-gray-100 transition-colors"
          >
            Nueva partitura
          </button>
        </div>
      )}
    </header>
  )
}
