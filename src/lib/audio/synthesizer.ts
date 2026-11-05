import { WorkerSynthesizer, Sequencer, audioBufferToWav } from 'spessasynth_lib'
import { loadSoundFont } from './soundfontLoader'
import { withoutSustainPedal } from './midiChannels'
import type { VoiceDefinition } from '../../types/voice'

let audioContext: AudioContext | null = null
let synth: WorkerSynthesizer | null = null
let sequencer: Sequencer | null = null
let worker: Worker | null = null
let masterGain: GainNode | null = null
let removeResumeListeners: (() => void) | null = null
let initialized = false
let initPromise: Promise<{ synth: WorkerSynthesizer; sequencer: Sequencer }> | null = null

// SpessaSynth's playback worklet publishes the notes on outputs 1–16 (one
// stereo pair per MIDI channel). Output 0 is only the effects bus and is
// nearly silent with our soundfont. Offline WAV rendering mixes every channel
// into a single buffer, which is why the download sounds right. Connecting
// the worklet straight to the speakers leaves Safari/iOS (and some Chromium
// builds) playing output 0 only. Each output therefore goes through its own
// gain into one stereo master before the destination.
const AUDIBLE_OUTPUTS = 17

function connectAudibleOutputs(node: AudioWorkletNode, context: AudioContext) {
  const master = context.createGain()
  master.gain.value = 1
  const outputs = Math.min(node.numberOfOutputs, AUDIBLE_OUTPUTS)
  for (let i = 0; i < outputs; i++) {
    const tap = context.createGain()
    node.connect(tap, i)
    tap.connect(master)
  }
  master.connect(context.destination)
  return master
}

function installResumeOnGesture(context: AudioContext) {
  removeResumeListeners?.()
  const resume = () => {
    if (context.state === 'suspended') void context.resume()
  }
  window.addEventListener('pointerdown', resume, true)
  window.addEventListener('keydown', resume, true)
  removeResumeListeners = () => {
    window.removeEventListener('pointerdown', resume, true)
    window.removeEventListener('keydown', resume, true)
  }
}

// Must run synchronously inside the play gesture. Safari ignores resume()
// once the handler has awaited anything else.
export function resumeAudioContext() {
  if (audioContext?.state === 'suspended') {
    void audioContext.resume()
  }
}

let songWaitId = 0

function waitForSong(seq: Sequencer): Promise<void> {
  const id = `partitup-song-ready-${++songWaitId}`
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timeout)
      seq.eventHandler.removeEvent('songChange', id)
      resolve()
    }
    const timeout = setTimeout(done, 5000)
    seq.eventHandler.addEvent('songChange', id, done)
  })
}

export async function initAudioEngine(): Promise<{ synth: WorkerSynthesizer; sequencer: Sequencer }> {
  if (initialized && synth && sequencer) {
    return { synth, sequencer }
  }
  if (initPromise) return initPromise

  initPromise = (async () => {
    audioContext = new AudioContext()
    installResumeOnGesture(audioContext)

    // Register the inline playback worklet (sends audio from the worker to output).
    await WorkerSynthesizer.registerPlaybackWorklet(audioContext)

    // The worker runs the actual synthesis (WorkerSynthesizerCore). Inlining the
    // `new URL(...)` inside `new Worker(...)` lets Vite bundle the worker for
    // production correctly.
    worker = new Worker(new URL('./synth.worker.ts', import.meta.url), { type: 'module' })

    synth = new WorkerSynthesizer(audioContext, worker.postMessage.bind(worker))
    worker.onmessage = (e) => synth!.handleWorkerMessage(e.data)

    const node = (synth as unknown as { worklet: AudioWorkletNode }).worklet
    masterGain = connectAudibleOutputs(node, audioContext)

    // Wait until the worker synthesizer has signalled it is ready before
    // loading the SoundFont — otherwise addSoundBank() may never resolve.
    await synth.isReady

    const soundFontBuffer = await loadSoundFont()
    await synth.soundBankManager.addSoundBank(soundFontBuffer, 'main')

    sequencer = new Sequencer(synth, { skipToFirstNoteOn: true })

    initialized = true
    return { synth, sequencer }
  })()

  try {
    return await initPromise
  } catch (err) {
    initPromise = null
    if (!initialized) {
      removeResumeListeners?.()
      removeResumeListeners = null
      masterGain?.disconnect()
      worker?.terminate()
      void audioContext?.close()
      synth = null
      sequencer = null
      worker = null
      audioContext = null
      masterGain = null
    }
    throw err
  }
}

export function getAudioEngine() {
  return { synth, sequencer, audioContext }
}

export async function loadMidiData(midiBase64: string) {
  midiBase64 = withoutSustainPedal(midiBase64)
  const { sequencer: seq } = await initAudioEngine()

  const binaryString = atob(midiBase64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  const ready = waitForSong(seq)
  seq.loadNewSongList([{ binary: bytes.buffer as ArrayBuffer }])
  await ready
}

export async function play() {
  resumeAudioContext()
  const { sequencer: seq } = await initAudioEngine()
  resumeAudioContext()
  if (audioContext?.state === 'suspended') {
    await audioContext.resume()
  }
  seq.play()
}

export function pause() {
  sequencer?.pause()
}

export function stop() {
  if (sequencer) {
    sequencer.currentTime = 0
    sequencer.pause()
  }
}

export function setPlaybackRate(rate: number) {
  if (sequencer) {
    sequencer.playbackRate = rate
  }
}

export function seekTo(seconds: number) {
  if (!sequencer) return
  const duration = sequencer.duration || 0
  const next = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds)
  sequencer.currentTime = next
}

export function getCurrentTime(): number {
  return sequencer?.currentHighResolutionTime ?? 0
}

export function getDuration(): number {
  return sequencer?.duration ?? 0
}

export function isPaused(): boolean {
  return sequencer?.paused ?? true
}

export function applyVoiceSettings(
  voices: VoiceDefinition[],
  channelMap?: Record<string, number>
) {
  if (!synth) return

  const hasSolo = voices.some((v) => v.solo)

  const drum = synth.midiChannels[9]
  drum?.setSystemParameter('isMuted', true)

  for (const voice of voices) {
    const ch = channelMap?.[voice.id] ?? voices.indexOf(voice)
    if (ch >= synth.channelCount) continue
    const midiCh = synth.midiChannels[ch]
    if (!midiCh) continue

    const shouldMute = hasSolo ? !voice.solo : voice.muted
    midiCh.setSystemParameter('isMuted', shouldMute)
    midiCh.setSystemParameter('gain', voice.volume)
  }
}

export async function renderToWav(
  midiBase64: string,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const { synth: s } = await initAudioEngine()
  if (!s) throw new Error('Sintetizador no inicializado')

  midiBase64 = withoutSustainPedal(midiBase64)
  const binaryString = atob(midiBase64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  sequencer?.loadNewSongList([{ binary: bytes.buffer as ArrayBuffer }])

  const audioBuffers = await s.renderAudio(44100, {
    separateChannels: false,
    extraTime: 2,
    loopCount: 0,
    progressCallback: onProgress,
  })

  const audioBuffer = audioBuffers[0]
  return audioBufferToWav(audioBuffer)
}

export function destroyAudioEngine() {
  sequencer?.pause()
  removeResumeListeners?.()
  removeResumeListeners = null
  masterGain?.disconnect()
  worker?.terminate()
  audioContext?.close()
  synth = null
  sequencer = null
  worker = null
  audioContext = null
  masterGain = null
  initPromise = null
  initialized = false
}
