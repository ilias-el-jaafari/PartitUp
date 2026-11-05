import fs from 'fs/promises'

export type SniffedKind = 'png' | 'jpeg' | 'webp' | 'bmp' | 'tiff' | 'pdf'

const EXT_KIND: Record<string, SniffedKind> = {
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.webp': 'webp',
  '.bmp': 'bmp',
  '.tif': 'tiff',
  '.tiff': 'tiff',
  '.pdf': 'pdf',
}

export function kindForExtension(ext: string): SniffedKind | null {
  return EXT_KIND[ext.toLowerCase()] ?? null
}

export function sniffKind(buf: Buffer): SniffedKind | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'png'
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp'
  }
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp'
  if (
    buf.length >= 4 &&
    ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
      (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a))
  ) {
    return 'tiff'
  }
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'pdf'
  return null
}

export async function assertUploadMatches(filePath: string, ext: string): Promise<SniffedKind> {
  const expected = kindForExtension(ext)
  if (!expected) {
    throw new Error(`Formato no soportado: ${ext || 'sin extensión'}. Usa PNG, JPG, WEBP, TIFF o PDF.`)
  }
  const fh = await fs.open(filePath, 'r')
  try {
    const buf = Buffer.alloc(16)
    const { bytesRead } = await fh.read(buf, 0, 16, 0)
    if (bytesRead < 2) throw new Error('El archivo está vacío.')
    const sniffed = sniffKind(buf.subarray(0, bytesRead))
    if (!sniffed) {
      throw new Error('El archivo no parece una imagen ni un PDF.')
    }
    if (sniffed !== expected) {
      throw new Error(`La extensión ${ext} no coincide con el contenido (${sniffed}).`)
    }
    return sniffed
  } finally {
    await fh.close()
  }
}
