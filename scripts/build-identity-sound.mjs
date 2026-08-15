// Build the Tappy notification identity sound: chime + "TAPPY!" in ONE file.
//
// One file because the OS notification-sound mechanism plays a single asset — Android channel
// sounds and iOS UNNotificationSound cannot sequence two. And a pre-generated asset rather than
// runtime TTS because neither platform can reliably synthesize speech from a background push.
//
// No ffmpeg on this machine, so the audio is assembled directly: Google TTS is requested as
// LINEAR16 (raw PCM) instead of MP3, the chime is synthesized as PCM here, and the two are
// concatenated sample-by-sample into one WAV. WAV suits both platforms — Android res/raw accepts
// it, and iOS notification sounds accept WAV under 30 seconds.
//
// The chime reproduces the web's Web Audio version exactly: C5 -> E5 -> G5, 0.13s apart, each with
// a fast attack and exponential decay, so the identity is the same sound on every platform.

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const token = process.env.TTS_TOKEN
const project = process.env.TTS_PROJECT
const outDir = process.argv[2]
const voice = process.argv[3]
const langCode = process.argv[4]
if (!token || !project || !outDir || !voice || !langCode) {
  console.error('usage: TTS_TOKEN=.. TTS_PROJECT=.. node buildIdentitySound.mjs <outDir> <voiceName> <languageCode>')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

const SAMPLE_RATE = 24000 // Chirp3-HD's natural rate; avoids resampling the voice.
const NOTES = [523.25, 659.25, 783.99] // C5, E5, G5 — identical to src/lib/notifications/chime.ts
const NOTE_SPACING = 0.13
const NOTE_DECAY = 0.45
const PEAK = 0.28 // matches the web gain, so the chime is not louder on native
const GAP_AFTER_CHIME = 0.12

/** The chime as Float32 samples. */
function renderChime() {
  const total = Math.ceil((NOTE_SPACING * (NOTES.length - 1) + NOTE_DECAY) * SAMPLE_RATE)
  const buf = new Float32Array(total)
  NOTES.forEach((freq, i) => {
    const start = Math.floor(i * NOTE_SPACING * SAMPLE_RATE)
    const len = Math.floor(NOTE_DECAY * SAMPLE_RATE)
    for (let n = 0; n < len && start + n < total; n++) {
      const t = n / SAMPLE_RATE
      // Fast linear attack then exponential decay — the web envelope, expressed in samples.
      const attack = Math.min(t / 0.01, 1)
      const decay = Math.exp(-t * 7)
      buf[start + n] += Math.sin(2 * Math.PI * freq * t) * PEAK * attack * decay
    }
  })
  return buf
}

/** Google TTS as raw PCM, so it can be concatenated without a decoder. */
async function renderSpeech(text) {
  const body = Buffer.from(
    JSON.stringify({
      input: { text },
      voice: { languageCode: langCode, name: voice },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: SAMPLE_RATE, speakingRate: 1.0 },
    }),
    'utf8'
  )
  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      'x-goog-user-project': project,
    },
    body,
  })
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}`)
  const { audioContent } = await res.json()
  if (!audioContent) throw new Error('no audio returned')

  // LINEAR16 comes back as a complete WAV; skip its 44-byte header to get at the samples.
  const wav = Buffer.from(audioContent, 'base64')
  const pcm = wav.subarray(44)
  const out = new Float32Array(pcm.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = pcm.readInt16LE(i * 2) / 32768
  return out
}

function toWav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    data.writeInt16LE(Math.round(clamped * 32767), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

const chime = renderChime()
const speech = await renderSpeech('Tappy!')
const gap = new Float32Array(Math.floor(GAP_AFTER_CHIME * SAMPLE_RATE))

const combined = new Float32Array(chime.length + gap.length + speech.length)
combined.set(chime, 0)
combined.set(speech, chime.length + gap.length)

const wav = toWav(combined)
const name = `tappy_identity_${langCode}.wav`
writeFileSync(join(outDir, name), wav)

const seconds = combined.length / SAMPLE_RATE
console.log(JSON.stringify({
  file: name,
  voice,
  languageCode: langCode,
  sampleRateHertz: SAMPLE_RATE,
  channels: 1,
  bitsPerSample: 16,
  seconds: +seconds.toFixed(2),
  bytes: wav.length,
  chimeSeconds: +(chime.length / SAMPLE_RATE).toFixed(2),
  speechSeconds: +(speech.length / SAMPLE_RATE).toFixed(2),
  withiniOSLimit: seconds < 30,
  charactersBilled: 'Tappy!'.length,
}, null, 1))
