const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://partit-up.vercel.app',
]

function extraOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS ?? ''
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function allowVercelPreviews(): boolean {
  return (process.env.CORS_ALLOW_VERCEL_PREVIEWS ?? '1') !== '0'
}

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true
  const allowed = new Set([...DEFAULT_ORIGINS, ...extraOrigins()])
  if (allowed.has(origin)) return true
  if (allowVercelPreviews() && /^https:\/\/partit-up[a-z0-9-]*\.vercel\.app$/i.test(origin)) {
    return true
  }
  return false
}
