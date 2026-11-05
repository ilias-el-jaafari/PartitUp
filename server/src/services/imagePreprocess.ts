import sharp from 'sharp'
import path from 'path'
import os from 'os'

// Both engines (oemer and Audiveris) do their own binarization, so the job
// here is NOT to binarize — doing so destroys information (e.g. the thin rings
// of hollow half/whole noteheads). We only hand a clean grayscale image at a
// sensible size.
//
// On the 16GB HF Space there's plenty of memory, so we feed a higher
// resolution than the old Railway-constrained values — more pixels means
// better neural recognition. Both bounds are env-tunable so they can be
// adjusted per host without a code change.
const MAX_WIDTH = parseInt(process.env.OMR_MAX_WIDTH ?? '3600', 10)
const MIN_WIDTH = parseInt(process.env.OMR_MIN_WIDTH ?? '2600', 10)

export async function preprocessImage(inputPath: string): Promise<string> {
  const outputPath = path.join(os.tmpdir(), `omr-processed-${Date.now()}.png`)

  const meta = await sharp(inputPath).metadata()
  const sourceWidth = meta.width ?? MAX_WIDTH

  const sharpen = (process.env.OMR_SHARPEN ?? '1') !== '0'
  let pipeline = sharp(inputPath).grayscale().normalize()

  if (sourceWidth > MAX_WIDTH) {
    // Downscale large/high-DPI renders; supersamples for cleaner edges.
    pipeline = pipeline.resize({ width: MAX_WIDTH })
  } else if (sourceWidth < MIN_WIDTH) {
    // Upscale small screenshots so the staff interline is large enough.
    pipeline = pipeline.resize({ width: MIN_WIDTH, kernel: 'lanczos3' })
  }

  // A light unsharp mask helps staff lines and noteheads on phone photos
  // without binarizing (binarizing eats hollow noteheads).
  if (sharpen) {
    pipeline = pipeline.sharpen({ sigma: sourceWidth < MIN_WIDTH ? 0.8 : 0.45 })
  }

  await pipeline.withMetadata({ density: 300 }).png().toFile(outputPath)

  return outputPath
}
