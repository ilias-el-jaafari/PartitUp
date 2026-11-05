const OMR_API_URL = import.meta.env.VITE_OMR_API_URL || '/api'

// The OMR backend sleeps after inactivity and neural recognition on CPU is slow.
const OMR_TIMEOUT_MS = 600_000

export interface OmrProgress {
  stage: string
  page?: number | null
  pageCount?: number | null
  message: string
}

export interface OmrResult {
  musicXml: string
  status: 'success' | 'error'
  message?: string
}

interface OmrOptions {
  onProgress?: (progress: OmrProgress) => void
  signal?: AbortSignal
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

async function processWithJobs(file: File, options: OmrOptions): Promise<OmrResult | 'fallback'> {
  const formData = new FormData()
  formData.append('file', file)
  options.onProgress?.({ stage: 'upload', message: 'Enviando la partitura…' })

  const response = await fetch(`${OMR_API_URL}/omr/jobs`, {
    method: 'POST',
    body: formData,
    signal: options.signal,
  })
  if (response.status === 404) return 'fallback'
  const started = await response.json() as { jobId?: string; status?: string; message?: string; musicXml?: string }
  if (!response.ok || !started.jobId) {
    return {
      status: 'error',
      musicXml: '',
      message: started.message || 'No se pudo empezar el reconocimiento.',
    }
  }

  const jobId = started.jobId
  const startedAt = Date.now()
  try {
    while (Date.now() - startedAt < OMR_TIMEOUT_MS) {
      await sleep(1000, options.signal)
      const jobRes = await fetch(`${OMR_API_URL}/omr/jobs/${jobId}`, { signal: options.signal })
      if (jobRes.status === 404) {
        return { status: 'error', musicXml: '', message: 'El reconocimiento se interrumpió. Inténtalo de nuevo.' }
      }
      const job = await jobRes.json() as OmrProgress & { status?: string; musicXml?: string; message?: string }
      options.onProgress?.({
        stage: job.stage ?? 'recognize',
        page: job.page,
        pageCount: job.pageCount,
        message: job.message || 'Reconociendo la partitura…',
      })
      if (job.status === 'done' && job.musicXml) {
        return { status: 'success', musicXml: job.musicXml }
      }
      if (job.status === 'error' || job.status === 'cancelled') {
        return { status: 'error', musicXml: '', message: job.message || 'No se pudo leer la partitura.' }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      await fetch(`${OMR_API_URL}/omr/jobs/${jobId}`, { method: 'DELETE' }).catch(() => {})
      return { status: 'error', musicXml: '', message: 'Reconocimiento cancelado.' }
    }
    throw err
  }
  await fetch(`${OMR_API_URL}/omr/jobs/${jobId}`, { method: 'DELETE' }).catch(() => {})
  return {
    status: 'error',
    musicXml: '',
    message: 'El servidor de reconocimiento tardó demasiado. Puede estar despertándose — espera un momento e inténtalo de nuevo.',
  }
}

async function processSync(file: File, options: OmrOptions): Promise<OmrResult> {
  const formData = new FormData()
  formData.append('file', file)
  options.onProgress?.({ stage: 'recognize', message: 'Reconociendo la partitura…' })
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onAbort)
  const timer = setTimeout(() => controller.abort(), OMR_TIMEOUT_MS)
  try {
    const response = await fetch(`${OMR_API_URL}/omr`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })
    const data = await response.json() as OmrResult
    return data
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        status: 'error',
        musicXml: '',
        message: options.signal?.aborted
          ? 'Reconocimiento cancelado.'
          : 'El servidor de reconocimiento tardó demasiado. Puede estar despertándose — espera un momento e inténtalo de nuevo.',
      }
    }
    return {
      status: 'error',
      musicXml: '',
      message: 'No se pudo contactar con el servidor de reconocimiento. Comprueba tu conexión e inténtalo de nuevo.',
    }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }
}

export async function processImageOMR(file: File, options: OmrOptions = {}): Promise<OmrResult> {
  try {
    const job = await processWithJobs(file, options)
    if (job !== 'fallback') return job
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { status: 'error', musicXml: '', message: 'Reconocimiento cancelado.' }
    }
    // Older servers only expose the synchronous endpoint.
  }
  return processSync(file, options)
}

export async function processPdfOMR(file: File, options?: OmrOptions): Promise<OmrResult> {
  return processImageOMR(file, options)
}

export function prewarmOmrBackend(): void {
  const base = OMR_API_URL.replace(/\/api\/?$/, '')
  fetch(`${base}/health`, { method: 'GET' }).catch(() => {})
}
