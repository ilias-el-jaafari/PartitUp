import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { execFileCancelable } from './execFile.js'

// oemer is an end-to-end neural OMR engine (https://github.com/BreezeWhite/oemer).
// It takes a single image and writes a MusicXML file to the output directory.
// Installed in a Python venv in the Docker image; OEMER_CMD points at its binary.
const OEMER_CMD = process.env.OEMER_CMD || 'oemer'

// Run oemer on a single image and return the MusicXML string, or null on failure.
export async function runOemer(imagePath: string, signal?: AbortSignal): Promise<string | null> {
  const outputDir = path.join(
    os.tmpdir(),
    `oemer-output-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  )
  await fs.mkdir(outputDir, { recursive: true })

  try {
    try {
      // -d / --without-deskew skips the (slow) deskewing pass. Inputs here are
      // screenshots / clean digital scans with no skew, so it's a safe speed-up.
      const result = await execFileCancelable(OEMER_CMD, [imagePath, '-o', outputDir, '-d'], {
        timeout: 540_000,
        signal,
      })
      if (result.cancelled) return null
    } catch (execErr: unknown) {
      const stderr = (execErr as { stderr?: string }).stderr ?? ''
      const stdout = (execErr as { stdout?: string }).stdout ?? ''
      console.error('[oemer] failed for', imagePath)
      console.error('[oemer] stderr tail:', stderr.slice(-2000))
      console.error('[oemer] stdout tail:', stdout.slice(-2000))
      if ((execErr as { cancelled?: boolean }).cancelled) return null
      // oemer may still have written partial output before erroring; fall
      // through and check the directory below.
    }

    const files = await fs.readdir(outputDir)
    const xml = files.find((f) => f.endsWith('.musicxml') || f.endsWith('.xml'))
    if (!xml) return null

    const content = await fs.readFile(path.join(outputDir, xml), 'utf-8')
    // Guard against empty / truncated output.
    if (!content.includes('<score-partwise') && !content.includes('<score-timewise')) {
      return null
    }
    return content
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {})
  }
}
