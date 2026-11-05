export function buildWavFilename(
  fileName: string | null,
  voiceLabel: string | null,
  date = new Date()
): string {
  const slug = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w]+/g, '-')
      .replace(/^-|-$/g, '') || 'ensayo'
  const base = (fileName ?? 'ensayo').replace(/\.[^.]+$/, '')
  const voice = voiceLabel?.trim() || 'tutti'
  const day = date.toISOString().slice(0, 10)
  return `${slug(base)}-${slug(voice)}-${day}.wav`
}
