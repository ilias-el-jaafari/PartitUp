import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import { mergeMusicXmlPages } from './musicxmlMerger.js'
import { preprocessImage } from './imagePreprocess.js'
import { runOemer } from './oemer.js'
import { chooseEngine, type OmrEngineName } from './engineStrategy.js'
import { execFileCancelable } from './execFile.js'

const AUDIVERIS_CMD = process.env.AUDIVERIS_CMD || 'audiveris'
const USE_XVFB = process.env.USE_XVFB === '1'

export interface OmrProgress {
  stage: 'preprocess' | 'rasterize' | 'recognize' | 'cleanup'
  page?: number
  pageCount?: number
  message: string
}

export interface OmrRunOptions {
  onProgress?: (progress: OmrProgress) => void
  signal?: AbortSignal
  inputKind?: 'pdf' | 'image'
}

let audiverisAvailable: boolean | null = null
async function isAudiverisAvailable(): Promise<boolean> {
  if (audiverisAvailable !== null) return audiverisAvailable
  if (process.env.AUDIVERIS_AVAILABLE === '0') return (audiverisAvailable = false)
  if (process.env.AUDIVERIS_AVAILABLE === '1') return (audiverisAvailable = true)
  if (AUDIVERIS_CMD.startsWith('/')) {
    audiverisAvailable = await fs.access(AUDIVERIS_CMD).then(() => true).catch(() => false)
    return audiverisAvailable
  }
  return (audiverisAvailable = true)
}

let oemerAvailable: boolean | null = null
async function isOemerAvailable(): Promise<boolean> {
  if (oemerAvailable !== null) return oemerAvailable
  const cmd = process.env.OEMER_CMD || 'oemer'
  if (cmd.startsWith('/')) {
    oemerAvailable = await fs.access(cmd).then(() => true).catch(() => false)
    return oemerAvailable
  }
  return (oemerAvailable = true)
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    const err = new Error('Reconocimiento cancelado')
    err.name = 'AbortError'
    throw err
  }
}

async function runNamed(
  engine: OmrEngineName,
  filePath: string,
  signal?: AbortSignal
): Promise<string | null> {
  if (engine === 'audiveris') return processOneFile(filePath, signal)
  return runOemer(filePath, signal)
}

async function runEngine(
  filePath: string,
  inputKind: 'pdf' | 'image',
  signal?: AbortSignal
): Promise<string | null> {
  throwIfCancelled(signal)
  const configured = (process.env.OMR_ENGINE || 'auto').toLowerCase()
  const choice = chooseEngine({
    configured,
    inputKind,
    audiverisAvailable: await isAudiverisAvailable(),
    oemerAvailable: await isOemerAvailable(),
    allowFallback: (process.env.OMR_FALLBACK ?? '1') !== '0',
  })

  if (!choice.primary) {
    throw new Error('No hay ningún motor OMR disponible. Revisa OMR_ENGINE, Audiveris y oemer.')
  }

  console.log('[omr] engine=%s primary=%s fallback=%s kind=%s', configured, choice.primary, choice.fallback ?? 'none', inputKind)
  const primary = await runNamed(choice.primary, filePath, signal)
  throwIfCancelled(signal)
  if (primary) return primary
  if (!choice.fallback) return null
  console.warn('[omr] %s produced no result, trying %s', choice.primary, choice.fallback)
  return runNamed(choice.fallback, filePath, signal)
}

function buildCommand(args: string[]): { cmd: string; args: string[] } {
  if (USE_XVFB) {
    return { cmd: 'xvfb-run', args: ['-a', AUDIVERIS_CMD, ...args] }
  }
  return { cmd: AUDIVERIS_CMD, args }
}

async function processOneFile(inputPath: string, signal?: AbortSignal): Promise<string | null> {
  const outputDir = path.join(os.tmpdir(), `audiveris-output-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  await fs.mkdir(outputDir, { recursive: true })

  try {
    const { cmd, args } = buildCommand([
      '-constant', 'org.audiveris.omr.sheet.BookManager.useCompression=false',
      '-batch',
      '-export',
      '-output', outputDir,
      inputPath,
    ])

    try {
      const result = await execFileCancelable(cmd, args, { timeout: 180_000, signal })
      if (result.cancelled) return null
    } catch (execErr: unknown) {
      const killed = (execErr as { killed?: boolean }).killed
      const cancelled = (execErr as { cancelled?: boolean }).cancelled
      const stderr = (execErr as { stderr?: string }).stderr ?? ''
      const stdout = (execErr as { stdout?: string }).stdout ?? ''
      console.error('[audiveris] page failed for', inputPath, 'killed=', killed, 'cancelled=', cancelled)
      console.error('[audiveris] stderr tail:', stderr.slice(-2000))
      console.error('[audiveris] stdout tail:', stdout.slice(-2000))

      if (killed || cancelled) return null

      const files = await fs.readdir(outputDir, { recursive: true })
      const hasOutput = files.some(
        (f) => typeof f === 'string' && (f.endsWith('.xml') || f.endsWith('.mxl') || f.endsWith('.musicxml'))
      )
      if (!hasOutput) return null
    }

    const files = (await fs.readdir(outputDir, { recursive: true }))
      .filter((f): f is string => typeof f === 'string')

    const xmlFiles = files.filter((f) => f.endsWith('.xml') || f.endsWith('.musicxml'))
    if (xmlFiles.length > 0) {
      const largest = await pickLargestFile(outputDir, xmlFiles)
      return await fs.readFile(path.join(outputDir, largest), 'utf-8')
    }

    const mxlFiles = files.filter((f) => f.endsWith('.mxl'))
    if (mxlFiles.length > 0) {
      const largest = await pickLargestFile(outputDir, mxlFiles)
      return await extractMxl(path.join(outputDir, largest))
    }

    return null
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function extractPdfPages(pdfPath: string): Promise<string[]> {
  const outputDir = path.join(os.tmpdir(), `pdf-pages-${Date.now()}`)
  await fs.mkdir(outputDir, { recursive: true })

  const dpi = process.env.PDF_DPI ?? '500'
  await execFileCancelable('pdftoppm', [
    '-png', '-r', dpi,
    pdfPath,
    path.join(outputDir, 'page'),
  ], { timeout: 180_000 })

  const files = await fs.readdir(outputDir)
  return files
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => path.join(outputDir, f))
}

export async function processWithOmr(
  inputPath: string,
  isPdf: boolean,
  opts: OmrRunOptions = {}
): Promise<string> {
  const { onProgress, signal } = opts
  const inputKind = opts.inputKind ?? (isPdf ? 'pdf' : 'image')

  if (!isPdf) {
    onProgress?.({
      stage: 'recognize',
      page: 1,
      pageCount: 1,
      message: 'Reconociendo la partitura…',
    })
    const result = await runEngine(inputPath, inputKind, signal)
    if (result) return result
    throw new Error('No se pudo procesar la imagen. Verifica que sea una partitura musical legible.')
  }

  onProgress?.({ stage: 'rasterize', message: 'Preparando las páginas del PDF…' })
  let pageFiles: string[] = []
  try {
    pageFiles = await extractPdfPages(inputPath)
  } catch {
    throw new Error('No se pudieron extraer páginas del PDF.')
  }

  if (pageFiles.length === 0) {
    throw new Error('El PDF no contiene páginas válidas.')
  }

  console.log('[omr] PDF has %d pages, processing each separately', pageFiles.length)

  const results: string[] = []
  try {
    for (let i = 0; i < pageFiles.length; i++) {
      throwIfCancelled(signal)
      onProgress?.({
        stage: 'recognize',
        page: i + 1,
        pageCount: pageFiles.length,
        message: `Leyendo página ${i + 1} de ${pageFiles.length}…`,
      })

      let pagePath = pageFiles[i]
      let preprocessed: string | null = null
      try {
        onProgress?.({
          stage: 'preprocess',
          page: i + 1,
          pageCount: pageFiles.length,
          message: `Preparando página ${i + 1} de ${pageFiles.length}…`,
        })
        preprocessed = await preprocessImage(pageFiles[i])
        pagePath = preprocessed
      } catch (err) {
        console.error('[omr] preprocess failed for page, using raw render:', err)
      }

      const result = await runEngine(pagePath, 'pdf', signal)
      if (result) results.push(result)
      await fs.unlink(pageFiles[i]).catch(() => {})
      if (preprocessed) await fs.unlink(preprocessed).catch(() => {})
    }
  } finally {
    if (pageFiles.length > 0) {
      const pagesDir = path.dirname(pageFiles[0])
      await fs.rm(pagesDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  if (signal?.aborted) {
    const err = new Error('Reconocimiento cancelado')
    err.name = 'AbortError'
    throw err
  }

  if (results.length === 0) {
    throw new Error('No se pudo procesar ninguna página del PDF. Puede ser un problema de memoria — intenta con un PDF de menos páginas.')
  }

  if (results.length === 1) return results[0]

  try {
    return mergeMusicXmlPages(results)
  } catch (mergeErr) {
    console.error('[omr] merge failed, returning longest page:', mergeErr)
    return results.reduce((best, r) => (r.length > best.length ? r : best))
  }
}

async function pickLargestFile(baseDir: string, relativePaths: string[]): Promise<string> {
  if (relativePaths.length === 1) return relativePaths[0]
  let largest = relativePaths[0]
  let maxSize = 0
  for (const rel of relativePaths) {
    const stat = await fs.stat(path.join(baseDir, rel))
    if (stat.size > maxSize) {
      maxSize = stat.size
      largest = rel
    }
  }
  return largest
}

async function extractMxl(mxlPath: string): Promise<string> {
  const buffer = await fs.readFile(mxlPath)
  const entries = unzipSync(new Uint8Array(buffer))

  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('.xml') && !name.startsWith('META-INF')) {
      return strFromU8(data)
    }
  }

  throw new Error('No se encontró MusicXML dentro del archivo .mxl')
}
