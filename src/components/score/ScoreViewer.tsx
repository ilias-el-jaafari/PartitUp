import { useRef, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import { useScoreStore } from '../../stores/scoreStore'
import { NoteInteraction } from './NoteInteraction'
import { CorrectionToolbar } from './CorrectionToolbar'
import { VoiceHighlighter } from './VoiceHighlighter'

export function ScoreViewer() {
  const svgContent = useScoreStore((s) => s.svgContent)
  const currentPage = useScoreStore((s) => s.currentPage)
  const pageCount = useScoreStore((s) => s.pageCount)
  const nextPage = useScoreStore((s) => s.nextPage)
  const prevPage = useScoreStore((s) => s.prevPage)
  const scoreContainerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(100)

  useEffect(() => {
    if (scrollRef.current && svgContent) {
      scrollRef.current.scrollTop = 0
    }
  }, [svgContent])

  if (!svgContent) return null

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden min-w-0 min-h-0">
      <CorrectionToolbar />

      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={prevPage}
            disabled={currentPage <= 1}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm text-gray-600 min-w-[80px] text-center">
            Página {currentPage} de {pageCount}
          </span>
          <button
            onClick={nextPage}
            disabled={currentPage >= pageCount}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom((z) => Math.max(50, z - 10))}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600 min-w-[40px] text-center">
            {zoom}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(200, z + 10))}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-6">
        <div
          ref={scoreContainerRef}
          className="score-container mx-auto bg-white shadow-sm rounded-lg p-4"
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>

      <NoteInteraction containerRef={scoreContainerRef} />
      <VoiceHighlighter containerRef={scoreContainerRef} />
    </div>
  )
}
