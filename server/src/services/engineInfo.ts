import { execFile } from 'child_process'
import fs from 'fs/promises'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface EngineInfo {
  configured: string
  audiverisAvailable: boolean
  oemerAvailable: boolean
  audiverisVersion: string | null
  oemerVersion: string | null
}

const AUDIVERIS_CMD = process.env.AUDIVERIS_CMD || 'audiveris'
const OEMER_CMD = process.env.OEMER_CMD || 'oemer'

let cached: EngineInfo | null = null
let pending: Promise<EngineInfo> | null = null

async function commandWorks(cmd: string): Promise<boolean> {
  if (cmd.startsWith('/')) {
    return fs.access(cmd).then(() => true).catch(() => false)
  }
  try {
    await execFileAsync('which', [cmd], { timeout: 2_000 })
    return true
  } catch {
    return false
  }
}

async function probeVersion(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: 8_000 })
    const text = `${stdout ?? ''}\n${stderr ?? ''}`
    const version = text.match(/(\d+\.\d+(?:\.\d+)?)/)
    return version?.[1] ?? text.trim().split('\n')[0]?.slice(0, 80) ?? null
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? ''
    const stdout = (err as { stdout?: string }).stdout ?? ''
    const text = `${stdout}\n${stderr}`
    const version = text.match(/(\d+\.\d+(?:\.\d+)?)/)
    return version?.[1] ?? null
  }
}

export function configuredEngine(): string {
  return (process.env.OMR_ENGINE || 'auto').toLowerCase()
}

export function peekEngineInfo(): EngineInfo & { probing: boolean } {
  if (!cached && !pending) void getEngineInfo().catch(() => {})
  if (cached) return { ...cached, probing: false }
  return {
    configured: configuredEngine(),
    audiverisAvailable: process.env.AUDIVERIS_AVAILABLE === '1',
    oemerAvailable: false,
    audiverisVersion: null,
    oemerVersion: null,
    probing: true,
  }
}

export async function getEngineInfo(): Promise<EngineInfo> {
  if (cached) return cached
  if (pending) return pending
  pending = (async () => {
    const audiverisAvailable =
      process.env.AUDIVERIS_AVAILABLE === '1'
        ? true
        : process.env.AUDIVERIS_AVAILABLE === '0'
          ? false
          : await commandWorks(AUDIVERIS_CMD)
    const oemerAvailable = await commandWorks(OEMER_CMD)
    const [audiverisVersion, oemerVersion] = await Promise.all([
      audiverisAvailable ? probeVersion(AUDIVERIS_CMD, ['-version']) : Promise.resolve(null),
      oemerAvailable ? probeVersion(OEMER_CMD, ['--version']) : Promise.resolve(null),
    ])
    cached = {
      configured: configuredEngine(),
      audiverisAvailable,
      oemerAvailable,
      audiverisVersion,
      oemerVersion,
    }
    return cached
  })()
  try {
    return await pending
  } finally {
    pending = null
  }
}

export function resetEngineInfoCache() {
  cached = null
}
