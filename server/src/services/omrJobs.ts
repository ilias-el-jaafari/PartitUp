import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { processWithOmr, type OmrProgress } from './audiveris.js'
import { cleanupMusicXml } from './musicxmlCleanup.js'
import { assertUploadMatches } from './uploadValidation.js'

export type JobStatus = 'running' | 'done' | 'error' | 'cancelled'

export interface OmrJob {
  id: string
  status: JobStatus
  stage: OmrProgress['stage'] | 'queued' | 'cleanup' | 'done'
  page?: number
  pageCount?: number
  message: string
  musicXml?: string
  createdAt: number
  cancel: () => void
}

const jobs = new Map<string, OmrJob>()
const JOB_TTL_MS = 30 * 60 * 1000

function prune() {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id)
  }
}

export function getJob(id: string): OmrJob | undefined {
  prune()
  return jobs.get(id)
}

export function startOmrJob(file: { path: string; originalname: string }): OmrJob {
  prune()
  const ac = new AbortController()
  const job: OmrJob = {
    id: randomUUID(),
    status: 'running',
    stage: 'queued',
    message: 'En cola…',
    createdAt: Date.now(),
    cancel: () => ac.abort(),
  }
  jobs.set(job.id, job)

  void run(job, file, ac.signal)
  return job
}

async function run(
  job: OmrJob,
  file: { path: string; originalname: string },
  signal: AbortSignal
) {
  const ext = path.extname(file.originalname).toLowerCase()
  let processedPath: string | null = null
  const filePath = file.path
  try {
    await assertUploadMatches(filePath, ext)
    const isPdf = ext === '.pdf'
    let inputPath = filePath
    if (isPdf) {
      processedPath = filePath + '.pdf'
      await fs.rename(filePath, processedPath)
      inputPath = processedPath
    } else {
      job.stage = 'preprocess'
      job.message = 'Preparando la imagen…'
      const { preprocessImage } = await import('./imagePreprocess.js')
      processedPath = await preprocessImage(filePath)
      inputPath = processedPath
    }

    if (signal.aborted) {
      job.status = 'cancelled'
      job.message = 'Reconocimiento cancelado'
      return
    }

    const rawXml = await processWithOmr(inputPath, isPdf, {
      signal,
      inputKind: isPdf ? 'pdf' : 'image',
      onProgress: (progress) => {
        job.stage = progress.stage
        job.page = progress.page
        job.pageCount = progress.pageCount
        job.message = progress.message
      },
    })

    if (signal.aborted) {
      job.status = 'cancelled'
      job.message = 'Reconocimiento cancelado'
      return
    }

    job.stage = 'cleanup'
    job.message = 'Limpiando el resultado…'
    job.musicXml = cleanupMusicXml(rawXml)
    job.status = 'done'
    job.stage = 'done'
    job.message = 'Partitura lista'
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      job.status = 'cancelled'
      job.message = 'Reconocimiento cancelado'
      return
    }
    job.status = 'error'
    job.message = err instanceof Error ? err.message : 'Error procesando el archivo'
  } finally {
    await fs.unlink(filePath).catch(() => {})
    if (processedPath) await fs.unlink(processedPath).catch(() => {})
  }
}

export function publicJob(job: OmrJob) {
  return {
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    page: job.page ?? null,
    pageCount: job.pageCount ?? null,
    message: job.message,
    musicXml: job.status === 'done' ? job.musicXml ?? null : undefined,
  }
}
