const DB_NAME = 'partitup'
const STORE = 'practice'
const PREFS_KEY = 'prefs'
const MAX_SCORES = 4
const MAX_XML_CHARS = 3_000_000

export interface SavedScore {
  id: string
  fileName: string
  musicXml: string
  savedAt: number
}

export interface PracticePrefs {
  preferredVoiceType: string | null
  tempo: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    const result = await fn(store)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    return result
  } finally {
    db.close()
  }
}

export async function getPreferences(): Promise<PracticePrefs | null> {
  try {
    return await withStore('readonly', (store) => idbRequest(store.get(PREFS_KEY) as IDBRequest<PracticePrefs | undefined>))
      .then((value) => value ?? null)
  } catch {
    return null
  }
}

export async function savePreferences(partial: Partial<PracticePrefs>): Promise<void> {
  try {
    const current = (await getPreferences()) ?? { preferredVoiceType: null, tempo: 1 }
    const next: PracticePrefs = { ...current, ...partial }
    await withStore('readwrite', (store) => idbRequest(store.put(next, PREFS_KEY)))
  } catch {
    // Private mode and full disks should not block practice.
  }
}

export async function rememberScore(input: { fileName: string; musicXml: string; tempo: number }): Promise<void> {
  if (input.musicXml.length > MAX_XML_CHARS) {
    await savePreferences({ tempo: input.tempo })
    return
  }
  try {
    const id = input.fileName.trim().toLowerCase() || 'partitura'
    const record: SavedScore = {
      id,
      fileName: input.fileName,
      musicXml: input.musicXml,
      savedAt: Date.now(),
    }
    await withStore('readwrite', async (store) => {
      await idbRequest(store.put(record, id))
      const keys = await idbRequest(store.getAllKeys())
      const scores: SavedScore[] = []
      for (const key of keys) {
        if (key === PREFS_KEY) continue
        const value = await idbRequest(store.get(key) as IDBRequest<SavedScore | undefined>)
        if (value?.musicXml) scores.push(value)
      }
      scores.sort((a, b) => b.savedAt - a.savedAt)
      for (const extra of scores.slice(MAX_SCORES)) {
        await idbRequest(store.delete(extra.id))
      }
    })
    await savePreferences({ tempo: input.tempo })
  } catch {
    // Ignore storage failures.
  }
}

export async function listRecentScores(): Promise<SavedScore[]> {
  try {
    return await withStore('readonly', async (store) => {
      const keys = await idbRequest(store.getAllKeys())
      const scores: SavedScore[] = []
      for (const key of keys) {
        if (key === PREFS_KEY) continue
        const value = await idbRequest(store.get(key) as IDBRequest<SavedScore | undefined>)
        if (value?.musicXml) scores.push(value)
      }
      return scores.sort((a, b) => b.savedAt - a.savedAt)
    })
  } catch {
    return []
  }
}
