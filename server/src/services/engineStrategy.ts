// Which OMR engine reads a choral score.
//
// auto (the default) prefers the engine that usually misreads choir parts less:
//   - PDF / engraved pages → Audiveris (staff model, fewer invented chords)
//   - camera photos → oemer (neural), then Audiveris if it returns nothing
// Explicit OMR_ENGINE=audiveris|oemer skips that choice. OMR_FALLBACK=0
// disables the second engine. Images that only have one engine installed use it.

export type OmrEngineName = 'audiveris' | 'oemer'

export interface EngineChoice {
  primary: OmrEngineName | null
  fallback: OmrEngineName | null
}

export function chooseEngine(opts: {
  configured: string
  inputKind: 'pdf' | 'image'
  audiverisAvailable: boolean
  oemerAvailable: boolean
  allowFallback?: boolean
}): EngineChoice {
  const configured = opts.configured.trim().toLowerCase()
  const allowFallback = opts.allowFallback !== false
  const has = (name: OmrEngineName) =>
    name === 'audiveris' ? opts.audiverisAvailable : opts.oemerAvailable

  let preferred: OmrEngineName
  let alternate: OmrEngineName
  if (configured === 'audiveris' || configured === 'oemer') {
    preferred = configured
    alternate = configured === 'audiveris' ? 'oemer' : 'audiveris'
  } else {
    // auto, and any unknown value — don't fail a deploy over a typo.
    if (opts.inputKind === 'pdf') {
      preferred = 'audiveris'
      alternate = 'oemer'
    } else {
      preferred = 'oemer'
      alternate = 'audiveris'
    }
  }

  const primary = has(preferred) ? preferred : has(alternate) ? alternate : null
  let fallback: OmrEngineName | null = null
  if (allowFallback && primary) {
    const other: OmrEngineName = primary === 'audiveris' ? 'oemer' : 'audiveris'
    if (has(other)) fallback = other
  }
  return { primary, fallback }
}
