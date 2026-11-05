import { useState, useCallback, useRef, useEffect } from 'react'
import { Upload, FileMusic, Image, FileText, Loader2, X } from 'lucide-react'
import { useScoreStore } from '../../stores/scoreStore'
import { listRecentScores, type SavedScore } from '../../lib/memory/practiceMemory'

const ACCEPTED_EXTENSIONS = [
  '.xml', '.musicxml', '.mxl',
  '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff', '.tif',
  '.pdf',
]

function relativeTime(savedAt: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - savedAt) / 60000))
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  return `hace ${days} días`
}

export function UploadZone() {
  const [isDragOver, setIsDragOver] = useState(false)
  const [recent, setRecent] = useState<SavedScore[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const loadFile = useScoreStore((s) => s.loadFile)
  const loadMusicXml = useScoreStore((s) => s.loadMusicXml)
  const cancelLoad = useScoreStore((s) => s.cancelLoad)
  const isLoading = useScoreStore((s) => s.isLoading)
  const error = useScoreStore((s) => s.error)
  const omrMessage = useScoreStore((s) => s.omrMessage)

  useEffect(() => {
    void listRecentScores().then(setRecent)
  }, [])

  const handleFile = useCallback((file: File) => {
    void loadFile(file)
  }, [loadFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  return (
    <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
      <div className="w-full max-w-2xl flex flex-col gap-4">
        <div
          className={`
            border-2 border-dashed rounded-2xl p-8 sm:p-12
            flex flex-col items-center justify-center gap-6
            transition-all duration-200
            ${isLoading ? '' : 'cursor-pointer'}
            ${isDragOver
              ? 'border-blue-500 bg-blue-50 scale-[1.02]'
              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50'
            }
          `}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => { if (!isLoading) fileInputRef.current?.click() }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
            className="hidden"
          />

          {isLoading ? (
            <>
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
              <div className="text-center">
                <p className="text-lg text-gray-700">{omrMessage || 'Preparando el ensayo…'}</p>
                <p className="text-sm text-gray-500 mt-2">
                  Las partituras largas se leen página a página. Puedes cancelar y seguir con un MusicXML si lo tienes.
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  cancelLoad()
                }}
                className="flex items-center gap-1.5 text-sm text-gray-600 px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
                Cancelar
              </button>
            </>
          ) : (
            <>
              <Upload className="w-16 h-16 text-gray-400" />
              <div className="text-center">
                <p className="text-lg font-medium text-gray-800">
                  Sube la partitura del ensayo
                </p>
                <p className="text-sm text-gray-500 mt-2 max-w-md">
                  Foto, PDF o MusicXML. Identificamos las voces y dejas sonando la tuya para practicar.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-500">
                <div className="flex items-center gap-1.5">
                  <FileMusic className="w-4 h-4" />
                  <span>MusicXML</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Image className="w-4 h-4" />
                  <span>PNG, JPG</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  <span>PDF</span>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm max-w-md text-center">
              {error}
            </div>
          )}
        </div>

        {recent.length > 0 && !isLoading && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h2 className="text-sm font-medium text-gray-700">Continuar ensayo</h2>
            <ul className="mt-2 divide-y divide-gray-100">
              {recent.map((score) => (
                <li key={score.id}>
                  <button
                    type="button"
                    className="w-full text-left py-2 flex items-baseline justify-between gap-3 hover:text-blue-700"
                    onClick={() => { void loadMusicXml(score.musicXml, score.fileName) }}
                  >
                    <span className="truncate text-sm">{score.fileName}</span>
                    <span className="text-xs text-gray-400 shrink-0">{relativeTime(score.savedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
