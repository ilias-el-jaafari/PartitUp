import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { processWithOmr } from '../services/audiveris.js'
import { cleanupMusicXml } from '../services/musicxmlCleanup.js'
import { preprocessImage } from '../services/imagePreprocess.js'
import { assertUploadMatches, kindForExtension } from '../services/uploadValidation.js'
import { rateLimit } from '../services/rateLimit.js'
import { getJob, publicJob, startOmrJob } from '../services/omrJobs.js'

const MAX_MB = Number.parseInt(process.env.OMR_MAX_UPLOAD_MB ?? '25', 10)
const MAX_BYTES = (Number.isFinite(MAX_MB) && MAX_MB > 0 ? MAX_MB : 25) * 1024 * 1024

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (kindForExtension(ext)) cb(null, true)
    else cb(new Error(`Formato no soportado: ${ext || 'sin extensión'}. Usa PNG, JPG, WEBP, TIFF o PDF.`))
  },
})

function uploadSingle(req: Request, res: Response) {
  return new Promise<void>((resolve, reject) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function uploadError(err: unknown): { status: number; message: string } {
  const code = (err as { code?: string }).code
  if (code === 'LIMIT_FILE_SIZE') {
    return { status: 413, message: `El archivo supera el máximo de ${MAX_MB} MB.` }
  }
  const message = err instanceof Error ? err.message : 'No se pudo leer el archivo'
  return { status: 400, message }
}

export const omrRouter = Router()

const omrLimit = rateLimit({ limit: 8, windowMs: 10 * 60 * 1000, name: 'omr' })

omrRouter.post('/omr/jobs', omrLimit, async (req, res) => {
  try {
    await uploadSingle(req, res)
  } catch (err) {
    const mapped = uploadError(err)
    res.status(mapped.status).json({ status: 'error', message: mapped.message })
    return
  }
  if (!req.file) {
    res.status(400).json({ status: 'error', message: 'No se proporcionó archivo' })
    return
  }
  try {
    await assertUploadMatches(req.file.path, path.extname(req.file.originalname).toLowerCase())
  } catch (err) {
    await fs.unlink(req.file.path).catch(() => {})
    res.status(400).json({ status: 'error', message: err instanceof Error ? err.message : 'Archivo no válido' })
    return
  }
  const job = startOmrJob({ path: req.file.path, originalname: req.file.originalname })
  res.status(202).json(publicJob(job))
})

omrRouter.get('/omr/jobs/:id', (req, res) => {
  const job = getJob(req.params.id)
  if (!job) {
    res.status(404).json({ status: 'error', message: 'El trabajo de reconocimiento no existe o caducó.' })
    return
  }
  res.json(publicJob(job))
})

omrRouter.delete('/omr/jobs/:id', (req, res) => {
  const job = getJob(req.params.id)
  if (!job) {
    res.status(404).json({ status: 'error', message: 'El trabajo de reconocimiento no existe o caducó.' })
    return
  }
  job.cancel()
  job.status = 'cancelled'
  job.message = 'Reconocimiento cancelado'
  res.json(publicJob(job))
})

// Synchronous endpoint kept so older clients still receive MusicXML in one response.
omrRouter.post('/omr', omrLimit, async (req, res) => {
  try {
    await uploadSingle(req, res)
  } catch (err) {
    const mapped = uploadError(err)
    res.status(mapped.status).json({ status: 'error', message: mapped.message })
    return
  }

  if (!req.file) {
    res.status(400).json({ status: 'error', message: 'No se proporcionó archivo' })
    return
  }

  const filePath = req.file.path
  const ext = path.extname(req.file.originalname).toLowerCase()
  let processedPath: string | null = null

  try {
    await assertUploadMatches(filePath, ext)
    let inputPath: string
    const isPdf = ext === '.pdf'

    if (isPdf) {
      processedPath = filePath + '.pdf'
      await fs.rename(filePath, processedPath)
      inputPath = processedPath
    } else {
      processedPath = await preprocessImage(filePath)
      inputPath = processedPath
    }

    const rawXml = await processWithOmr(inputPath, isPdf)
    const musicXml = cleanupMusicXml(rawXml)
    res.json({ status: 'success', musicXml })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error procesando el archivo'
    res.status(500).json({ status: 'error', message })
  } finally {
    await fs.unlink(filePath).catch(() => {})
    if (processedPath) await fs.unlink(processedPath).catch(() => {})
  }
})
