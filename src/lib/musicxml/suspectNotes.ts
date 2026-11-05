const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const PNAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b']

export interface SuspectNote {
  id: string
  /** Diatonic steps to apply, or null when the suggestion is to delete the note. */
  steps: number | null
  reason: string
}

function xmlId(el: Element): string | null {
  return el.getAttributeNS(XML_NS, 'id') ?? el.getAttribute('xml:id') ?? el.getAttribute('id')
}

function diatonic(el: Element): number | null {
  const pname = el.getAttribute('pname')
  const oct = el.getAttribute('oct')
  if (!pname || oct == null) return null
  const idx = PNAMES.indexOf(pname.toLowerCase())
  if (idx < 0) return null
  return parseInt(oct, 10) * 7 + idx
}

function local(el: Element): string {
  return el.localName || el.tagName
}

// Notes that jump an octave (or more) away from both neighbors and back are
// usually an OMR octave error. The suggestion pulls the note back to the line.
export function findSuspectNotes(mei: string): SuspectNote[] {
  const doc = new DOMParser().parseFromString(mei, 'application/xml')
  const suspects: SuspectNote[] = []

  const visitLayer = (layer: Element) => {
    const seq: { id: string; pitch: number }[] = []
    for (let i = 0; i < layer.childNodes.length; i++) {
      const child = layer.childNodes[i]
      if (child.nodeType !== 1) continue
      const el = child as Element
      if (local(el) !== 'note') continue
      if (el.getAttribute('grace')) continue
      const id = xmlId(el)
      const pitch = diatonic(el)
      if (!id || pitch === null) continue
      seq.push({ id, pitch })
    }
    for (let i = 1; i < seq.length - 1; i++) {
      const prev = seq[i - 1]
      const cur = seq[i]
      const next = seq[i + 1]
      const dp = cur.pitch - prev.pitch
      const dn = cur.pitch - next.pitch
      if (Math.sign(dp) !== Math.sign(dn)) continue
      if (Math.abs(dp) < 7 || Math.abs(dn) < 7) continue
      if (Math.abs(prev.pitch - next.pitch) > 2) continue
      const target = Math.round((prev.pitch + next.pitch) / 2)
      const steps = target - cur.pitch
      if (steps === 0) continue
      suspects.push({
        id: cur.id,
        steps: Math.abs(steps) > 10 ? null : steps,
        reason: Math.abs(steps) === 7 || Math.abs(steps) === 8
          ? 'Salto de octava aislado: probable error de lectura'
          : 'Nota muy alejada de las vecinas',
      })
    }
  }

  const walk = (el: Element) => {
    if (local(el) === 'layer') visitLayer(el)
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i]
      if (child.nodeType === 1) walk(child as Element)
    }
  }
  if (doc.documentElement) walk(doc.documentElement)
  return suspects
}
