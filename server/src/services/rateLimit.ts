import type { Request, Response, NextFunction } from 'express'

interface Bucket {
  hits: number[]
}

const buckets = new Map<string, Bucket>()

export function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || req.ip || 'unknown'
  }
  return req.ip || 'unknown'
}

// Sliding window. Exported so tests can drive the clock without Express.
export function allowHit(
  store: Map<string, Bucket>,
  key: string,
  limit: number,
  windowMs: number,
  now: number
): boolean {
  const bucket = store.get(key) ?? { hits: [] }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs)
  if (bucket.hits.length >= limit) {
    store.set(key, bucket)
    return false
  }
  bucket.hits.push(now)
  store.set(key, bucket)
  return true
}

export function rateLimit(opts: { limit: number; windowMs: number; name: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ok = allowHit(buckets, `${opts.name}:${clientKey(req)}`, opts.limit, opts.windowMs, Date.now())
    if (!ok) {
      res.status(429).json({
        status: 'error',
        message: 'Demasiadas peticiones de reconocimiento. Espera un momento y vuelve a intentarlo.',
      })
      return
    }
    next()
  }
}
