import { execFile } from 'child_process'

export interface ExecResult {
  stdout: string
  stderr: string
  killed: boolean
  cancelled: boolean
}

// Runs a command and kills it if `signal` aborts (OMR cancel between or during a page).
export function execFileCancelable(
  cmd: string,
  args: string[],
  opts: { timeout: number; maxBuffer?: number; signal?: AbortSignal }
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      cmd,
      args,
      { timeout: opts.timeout, maxBuffer: opts.maxBuffer ?? 50 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const out = stdout?.toString() ?? ''
        const errText = stderr?.toString() ?? ''
        const cancelled = Boolean(opts.signal?.aborted)
        if (cancelled) {
          resolve({ stdout: out, stderr: errText, killed: true, cancelled: true })
          return
        }
        if (err) {
          const killed = Boolean((err as { killed?: boolean }).killed)
          reject(Object.assign(err, { stdout: out, stderr: errText, killed, cancelled: false }))
          return
        }
        resolve({ stdout: out, stderr: errText, killed: false, cancelled: false })
      }
    )

    const kill = () => {
      child.kill('SIGKILL')
    }
    if (opts.signal) {
      if (opts.signal.aborted) kill()
      else opts.signal.addEventListener('abort', kill, { once: true })
    }
  })
}
