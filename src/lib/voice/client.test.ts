// The browser half of the voice contract.
//
// The property that matters most is what the client does NOT do: it never names a voice, so the
// browser can never choose what we pay to synthesize. The rest is failure handling, and the
// distinction between "unavailable" and "failed" is the whole point — one is a sentence explaining
// that read-aloud is not ready, the other is a retryable error. Collapsing them would show the
// wrong message in both cases.

import { describe, it, expect, vi } from 'vitest'
import { requestSpeech } from './client'

const jsonRes = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response

describe('what the client sends', () => {
  it('posts text and never a voice', async () => {
    const fetchImpl = vi.fn(async () => jsonRes(200, { audioBase64: 'QUJD', mimeType: 'audio/mpeg', language: 'vi' })) as unknown as typeof fetch
    await requestSpeech({ text: 'Xin chào', language: 'vi', fetchImpl })

    const init = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1]
    const body = JSON.parse(String(init.body))
    expect(body).toEqual({ text: 'Xin chào', language: 'vi' })
    // The decision the browser must not be able to make.
    expect(Object.keys(body)).not.toContain('voice')
    expect(Object.keys(body)).not.toContain('voiceName')
  })

  it('omits the language entirely when it has no hint, leaving detection to the server', async () => {
    const fetchImpl = vi.fn(async () => jsonRes(200, { audioBase64: 'QUJD' })) as unknown as typeof fetch
    await requestSpeech({ text: 'Hello', fetchImpl })
    const body = JSON.parse(String((fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1].body))
    expect(body).toEqual({ text: 'Hello' })
  })

  it('sends credentials so the route can authenticate the user', async () => {
    const fetchImpl = vi.fn(async () => jsonRes(200, { audioBase64: 'QUJD' })) as unknown as typeof fetch
    await requestSpeech({ text: 'Hi', fetchImpl })
    expect((fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1].credentials).toBe('include')
  })
})

describe('unavailable is not the same as failed', () => {
  it.each([503, 422])('treats %s as unavailable and reports the language', async (status) => {
    const fetchImpl = vi.fn(async () => jsonRes(status, { error: 'voice_unavailable', language: 'vi' })) as unknown as typeof fetch
    const out = await requestSpeech({ text: 'Xin chào', fetchImpl })
    expect(out).toEqual({ status: 'unavailable', language: 'vi' })
  })

  it('falls back to the requested language when the server names none', async () => {
    const fetchImpl = vi.fn(async () => jsonRes(503, {})) as unknown as typeof fetch
    const out = await requestSpeech({ text: 'Hello', language: 'en', fetchImpl })
    expect(out).toEqual({ status: 'unavailable', language: 'en' })
  })

  it.each([401, 429, 500, 502])('treats %s as a retryable failure, not unavailable', async (status) => {
    const fetchImpl = vi.fn(async () => jsonRes(status, {})) as unknown as typeof fetch
    expect(await requestSpeech({ text: 'Hi', fetchImpl })).toEqual({ status: 'failed' })
  })
})

describe('cancellation is its own outcome', () => {
  it('reports a cancelled request rather than an error', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const fetchImpl = vi.fn(async () => { throw abortErr }) as unknown as typeof fetch
    // Pressing stop must not raise an error banner.
    expect(await requestSpeech({ text: 'Hi', fetchImpl })).toEqual({ status: 'cancelled' })
  })

  it('still reports a genuine network error as failed', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('network down') }) as unknown as typeof fetch
    expect(await requestSpeech({ text: 'Hi', fetchImpl })).toEqual({ status: 'failed' })
  })
})

describe('malformed success responses do not become silent playback', () => {
  it('fails when the body carries no audio', async () => {
    const fetchImpl = vi.fn(async () => jsonRes(200, { mimeType: 'audio/mpeg' })) as unknown as typeof fetch
    expect(await requestSpeech({ text: 'Hi', fetchImpl })).toEqual({ status: 'failed' })
  })

  it('fails when the body is not JSON at all', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json') } }) as unknown as Response) as unknown as typeof fetch
    expect(await requestSpeech({ text: 'Hi', fetchImpl })).toEqual({ status: 'failed' })
  })

  it('passes through the language and voice the SERVER chose', async () => {
    const fetchImpl = vi.fn(async () => jsonRes(200, {
      audioBase64: 'QUJD', mimeType: 'audio/mpeg', language: 'vi', voiceName: 'vi-VN-Neural2-A', cacheHit: true,
    })) as unknown as typeof fetch
    const out = await requestSpeech({ text: 'Xin chào', fetchImpl })
    expect(out).toMatchObject({ status: 'ok', language: 'vi', voiceName: 'vi-VN-Neural2-A', cacheHit: true })
  })
})
