import { describe, expect, it } from 'vitest'
import { sniffKind } from './uploadValidation.js'

describe('sniffKind', () => {
  it('recognizes PNG, JPEG and PDF magic bytes', () => {
    expect(sniffKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png')
    expect(sniffKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg')
    expect(sniffKind(Buffer.from('%PDF-1.7'))).toBe('pdf')
    expect(sniffKind(Buffer.from('not a score'))).toBeNull()
  })
})
