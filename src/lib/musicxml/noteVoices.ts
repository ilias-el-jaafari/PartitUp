const XML_NS = 'http://www.w3.org/XML/1998/namespace'

export interface StaffLayerVoice {
  id: string
  globalStaff: number
  layers: number[]
}

export function elementXmlId(el: Element): string | null {
  return el.getAttributeNS(XML_NS, 'id') ?? el.getAttribute('xml:id') ?? el.getAttribute('id')
}

function localName(el: Element): string {
  return el.localName || el.tagName
}

// note xml:id → voice id, using the staff/layer the note sits in, then overrides.
export function resolveNoteVoices(
  mei: string,
  voices: StaffLayerVoice[],
  overrides: Record<string, string> = {}
): Record<string, string> {
  const doc = new DOMParser().parseFromString(mei, 'application/xml')
  const map: Record<string, string> = {}

  const visit = (el: Element, staff: number | null, layer: number | null) => {
    const name = localName(el)
    let nextStaff = staff
    let nextLayer = layer
    if (name === 'staff') {
      const n = parseInt(el.getAttribute('n') ?? '', 10)
      if (Number.isFinite(n)) nextStaff = n
    } else if (name === 'layer') {
      const n = parseInt(el.getAttribute('n') ?? '1', 10)
      if (Number.isFinite(n)) nextLayer = n
    } else if (name === 'note' || name === 'rest') {
      const id = elementXmlId(el)
      if (id && nextStaff) {
        const override = overrides[id]
        if (override) map[id] = override
        else {
          const voice = voices.find((v) => v.globalStaff === nextStaff && (v.layers.length === 0 || v.layers.includes(nextLayer ?? 1)))
          if (voice) map[id] = voice.id
        }
      }
    }
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i]
      if (child.nodeType === 1) visit(child as Element, nextStaff, nextLayer)
    }
  }

  visit(doc.documentElement, null, null)
  return map
}
