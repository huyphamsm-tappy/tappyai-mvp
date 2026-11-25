/**
 * OpenAI speech-to-text adapter (Explore video moderation, ADR rev.2): the ONE place a clip's audio-only file is sent to the provider's transcription endpoint. The model id and the
 * key live here and nowhere else (the architecture guard). Only SPEECH matters (owner 05/11/2026): the transcript is moderated as TEXT afterwards; nothing here classifies a sound.
 *
 * It is a PAID call, so it asks the spend gate (src/lib/ai/budget/spendGate.ts) for its worst-case cost BEFORE the request is made: no budget, no gate, or a refusal means the audio is not sent.
 * Fail closed: anything that is not a clean answer (no key, refusal, timeout, HTTP error, unreadable body) is `unavailable`; the caller keeps the video in moderation and retries later.
 * Never throws and never logs the key, the audio or the text.
 */
import { reserveSpend, SpendRefusal, type SpendHandle } from '@/lib/ai/budget/spendGate'

export type TranscribeOutcome =
  | { status: 'ok'; /** Empty when nothing was said (silence, music, noise). */ text: string }
  | { status: 'unavailable'; reason: 'no_key' | 'bad_input' | 'spend_refused' | 'http_error' | 'bad_answer' | 'failed' }

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions'
const MODEL = 'gpt-4o-mini-transcribe'
const TIMEOUT_MS = 120_000
/** The provider accepts files up to 25 MB. */
const MAX_BYTES = 25 * 1024 * 1024
/** List price per audio minute of the model above. The worst case reserved is whole minutes plus one spare. */
export const TRANSCRIBE_USD_PER_MINUTE = 0.003

/** The model name, for the audit record of a decision (the id itself is only ever written in this file). */
export const OPENAI_TRANSCRIBE_MODEL = MODEL

export interface TranscribeDeps {
  fetchImpl?: typeof fetch
  env?: Record<string, string | undefined>
}

export async function transcribeSpeechWithOpenAI(audio: Uint8Array, info: { durationMs: number }, deps: TranscribeDeps = {}): Promise<TranscribeOutcome> {
  const key = ((deps.env ?? process.env).OPENAI_API_KEY ?? '').trim()
  if (!key) return { status: 'unavailable', reason: 'no_key' }
  if (audio.byteLength === 0 || audio.byteLength > MAX_BYTES || !Number.isFinite(info.durationMs) || info.durationMs <= 0) return { status: 'unavailable', reason: 'bad_input' }

  const minutes = Math.ceil(info.durationMs / 60_000) + 1
  const worstCaseUsd = minutes * TRANSCRIBE_USD_PER_MINUTE
  let spend: SpendHandle | null = null
  try {
    spend = reserveSpend('video:transcribe', worstCaseUsd)
  } catch (e) {
    if (e instanceof SpendRefusal) return { status: 'unavailable', reason: 'spend_refused' }
    throw e
  }

  const doFetch = deps.fetchImpl ?? fetch
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  // Sent (or possibly sent) from here on: the cost is the reserved worst case, never "given back".
  const settleWorstCase = () => { if (spend) { spend.settle(worstCaseUsd); spend = null } }
  try {
    const form = new FormData()
    form.append('model', MODEL)
    form.append('response_format', 'json')
    form.append('file', new File([audio as unknown as BlobPart], 'audio.mp4', { type: 'audio/mp4' }))
    const res = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: ctl.signal,
      cache: 'no-store',
    })
    settleWorstCase()
    if (!res.ok) {
      console.error('[openai-transcribe] provider answered', res.status)
      return { status: 'unavailable', reason: 'http_error' }
    }
    const body = (await res.json()) as { text?: unknown }
    if (typeof body?.text !== 'string') return { status: 'unavailable', reason: 'bad_answer' }
    return { status: 'ok', text: body.text.trim() }
  } catch (e) {
    settleWorstCase()
    console.error('[openai-transcribe] request failed:', e instanceof Error ? e.message : e)
    return { status: 'unavailable', reason: 'failed' }
  } finally {
    clearTimeout(timer)
  }
}
