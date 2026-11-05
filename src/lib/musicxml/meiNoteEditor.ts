// Edits notes inside a Verovio MEI document by their xml:id (which equals the
// SVG element id used for selection). Used by the manual correction feature to
// nudge pitches and delete spurious notes, then re-render score + audio.

const XML_NS = 'http://www.w3.org/XML/1998/namespace'

const PNAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b']
// Order in which accidentals are added for flat / sharp key signatures.
const FLAT_ORDER = ['b', 'e', 'a', 'd', 'g', 'c', 'f']
const SHARP_ORDER = ['f', 'c', 'g', 'd', 'a', 'e', 'b']

function elementId(el: Element): string | null {
  return el.getAttributeNS(XML_NS, 'id') ?? el.getAttribute('xml:id') ?? el.getAttribute('id')
}

// The gestural accidental a diatonic pitch carries in the given key signature
// (fifths: negative = flats, positive = sharps). Returns 'f', 's' or null.
function accidGesForKey(pname: string, fifths: number): string | null {
  if (fifths < 0) return FLAT_ORDER.slice(0, -fifths).includes(pname) ? 'f' : null
  if (fifths > 0) return SHARP_ORDER.slice(0, fifths).includes(pname) ? 's' : null
  return null
}

function elementsByLocalName(root: ParentNode, name: string): Element[] {
  const found: Element[] = []
  const visit = (node: Node) => {
    if (node.nodeType !== 1) return
    const el = node as Element
    if ((el.localName || el.tagName).toLowerCase() === name) found.push(el)
    for (let i = 0; i < el.childNodes.length; i++) visit(el.childNodes[i])
  }
  const start = 'documentElement' in root ? (root as Document).documentElement : (root as Element)
  if (start) visit(start)
  return found
}

function forEachMatchingNote(
  doc: Document,
  ids: Set<string>,
  fn: (note: Element) => void
): void {
  // Collect first because fn may replace nodes.
  const matches = elementsByLocalName(doc, 'note').filter((note) => {
    const id = elementId(note)
    return Boolean(id && ids.has(id))
  })
  matches.forEach(fn)
}

// Move the given notes by `deltaSteps` diatonic steps (positive = up). The
// accidental is recomputed from the key signature so in-key pitches spell
// correctly; any explicit accidental on the note is cleared.
export function transposeNotesDiatonic(
  mei: string,
  noteIds: Iterable<string>,
  deltaSteps: number,
  fifths: number
): string {
  const doc = new DOMParser().parseFromString(mei, 'application/xml')
  const ids = new Set(noteIds)

  forEachMatchingNote(doc, ids, (note) => {
    const pname = note.getAttribute('pname')
    const octStr = note.getAttribute('oct')
    if (!pname || octStr == null) return
    const idx = PNAMES.indexOf(pname.toLowerCase())
    if (idx < 0) return

    const total = idx + deltaSteps
    const newIdx = ((total % 7) + 7) % 7
    const octShift = Math.floor(total / 7)
    const newPname = PNAMES[newIdx]
    const newOct = parseInt(octStr, 10) + octShift

    note.setAttribute('pname', newPname)
    note.setAttribute('oct', String(newOct))

    const acc = accidGesForKey(newPname, fifths)
    if (acc) note.setAttribute('accid.ges', acc)
    else note.removeAttribute('accid.ges')
    note.removeAttribute('accid')
    // Drop any explicit displayed accidental child so the key signature applies.
    elementsByLocalName(note, 'accid').forEach((a) => a.remove())
  })

  return new XMLSerializer().serializeToString(doc)
}

// Replace the given notes with rests of the same duration, preserving timing.
export function deleteNotesToRests(mei: string, noteIds: Iterable<string>): string {
  const doc = new DOMParser().parseFromString(mei, 'application/xml')
  const ids = new Set(noteIds)

  forEachMatchingNote(doc, ids, (note) => {
    const rest = doc.createElementNS(note.namespaceURI, 'rest')
    const dur = note.getAttribute('dur')
    const dots = note.getAttribute('dots')
    if (dur) rest.setAttribute('dur', dur)
    if (dots) rest.setAttribute('dots', dots)
    note.replaceWith(rest)
  })

  return new XMLSerializer().serializeToString(doc)
}

// Pitch of the nearest preceding note in the same layer, used as a sensible
// starting pitch when a rest becomes a note.
function previousNotePitch(el: Element): { pname: string; oct: number } | null {
  let sib = el.previousElementSibling
  while (sib) {
    if (sib.localName === 'note' && sib.getAttribute('pname')) {
      return { pname: sib.getAttribute('pname')!, oct: parseInt(sib.getAttribute('oct') ?? '4', 10) }
    }
    const inner = elementsByLocalName(sib, 'note')
    if (inner.length > 0) {
      const n = inner[inner.length - 1]
      return { pname: n.getAttribute('pname') ?? 'b', oct: parseInt(n.getAttribute('oct') ?? '4', 10) }
    }
    sib = sib.previousElementSibling
  }
  return null
}

// Turn the given rests into notes of the same duration (for notes the OMR
// missed). The new note starts at the previous note's pitch (or b4) so it lands
// near the right range; the user then nudges it to the exact pitch.
export function restsToNotes(
  mei: string,
  restIds: Iterable<string>,
  fifths: number
): string {
  const doc = new DOMParser().parseFromString(mei, 'application/xml')
  const ids = new Set(restIds)

  const rests = elementsByLocalName(doc, 'rest')
  for (const rest of rests) {
    const id = elementId(rest)
    if (!id || !ids.has(id)) continue

    const note = doc.createElementNS(rest.namespaceURI, 'note')
    const dur = rest.getAttribute('dur')
    const dots = rest.getAttribute('dots')
    if (dur) note.setAttribute('dur', dur)
    if (dots) note.setAttribute('dots', dots)

    const prev = previousNotePitch(rest)
    const pname = prev?.pname ?? 'b'
    const oct = prev?.oct ?? 4
    note.setAttribute('pname', pname)
    note.setAttribute('oct', String(oct))
    const acc = accidGesForKey(pname, fifths)
    if (acc) note.setAttribute('accid.ges', acc)

    rest.replaceWith(note)
  }

  return new XMLSerializer().serializeToString(doc)
}
