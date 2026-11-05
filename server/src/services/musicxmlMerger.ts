/**
 * Merges multiple MusicXML documents (one per page) into a single score.
 * Each page's MusicXML is expected to have the same part structure.
 * We take the first page as the base and append measures from subsequent pages.
 */
export function mergeMusicXmlPages(pages: string[]): string {
  if (pages.length === 0) throw new Error('No pages to merge')
  if (pages.length === 1) return pages[0]

  const base = pages[0]

  const basePartIds = extractPartIds(base)
  if (basePartIds.length === 0) return base

  let baseMeasureCount = countMeasures(base, basePartIds[0])

  let result = base

  for (let pageIdx = 1; pageIdx < pages.length; pageIdx++) {
    const pageXml = pages[pageIdx]
    const pagePartIds = extractPartIds(pageXml)
    // Audiveris sometimes renames parts per page. If no id is shared, zip by order.
    const shared = basePartIds.some((id) => pagePartIds.includes(id))
    const aligned = shared
      ? basePartIds
      : basePartIds.map((id, i) => pagePartIds[i] ?? id)

    for (let partIndex = 0; partIndex < basePartIds.length; partIndex++) {
      const partId = basePartIds[partIndex]
      const sourceId = aligned[partIndex]
      if (!sourceId || !pagePartIds.includes(sourceId)) continue

      const pageMeasures = extractMeasures(pageXml, sourceId)
      if (pageMeasures.length === 0) continue

      const renumbered = pageMeasures.map((m, i) => {
        const newNum = baseMeasureCount + i + 1
        return m.replace(
          /(<measure\s[^>]*number\s*=\s*")([^"]*?)(")/,
          `$1${newNum}$3`
        )
      })

      const partCloseTag = findPartClosePosition(result, partId)
      if (partCloseTag >= 0) {
        result =
          result.slice(0, partCloseTag) +
          '\n' + renumbered.join('\n') + '\n' +
          result.slice(partCloseTag)
      }
    }

    const countId = aligned[0] && pagePartIds.includes(aligned[0]) ? aligned[0] : pagePartIds[0]
    const pageMeasureCount = countId ? countMeasures(pageXml, countId) : 0
    baseMeasureCount += pageMeasureCount
  }

  return result
}

function extractPartIds(xml: string): string[] {
  const ids: string[] = []
  const regex = /<part\s[^>]*id\s*=\s*"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(xml)) !== null) {
    if (!ids.includes(match[1])) {
      ids.push(match[1])
    }
  }
  return ids
}

function countMeasures(xml: string, partId: string): number {
  const measures = extractMeasures(xml, partId)
  return measures.length
}

function extractMeasures(xml: string, partId: string): string[] {
  const partContent = extractPartContent(xml, partId)
  if (!partContent) return []

  const measures: string[] = []
  const measureRegex = /<measure\s[^>]*>[\s\S]*?<\/measure>/g
  let match: RegExpExecArray | null
  while ((match = measureRegex.exec(partContent)) !== null) {
    measures.push(match[0])
  }
  return measures
}

function extractPartContent(xml: string, partId: string): string | null {
  const escapedId = partId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const startRegex = new RegExp(`<part\\s[^>]*id\\s*=\\s*"${escapedId}"[^>]*>`)
  const startMatch = startRegex.exec(xml)
  if (!startMatch) return null

  const contentStart = startMatch.index + startMatch[0].length
  const endTag = '</part>'
  const endIdx = xml.indexOf(endTag, contentStart)
  if (endIdx < 0) return null

  return xml.slice(contentStart, endIdx)
}

function findPartClosePosition(xml: string, partId: string): number {
  const escapedId = partId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const startRegex = new RegExp(`<part\\s[^>]*id\\s*=\\s*"${escapedId}"[^>]*>`)
  const startMatch = startRegex.exec(xml)
  if (!startMatch) return -1

  const endTag = '</part>'
  const endIdx = xml.indexOf(endTag, startMatch.index)
  return endIdx >= 0 ? endIdx : -1
}
