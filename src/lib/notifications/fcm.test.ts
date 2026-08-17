import { describe, it, expect } from 'vitest'
import {
  buildFcmMessage,
  sendFcmMessage,
  readFcmConfig,
  isFcmConfigured,
  FcmTokenGoneError,
  FcmSendError,
  FCM_SCOPE,
  IDENTITY_SOUND_ANDROID,
  IDENTITY_SOUND_APNS,
} from './fcm'
import type { NotificationPayload } from './send'
import { readFileSync } from 'node:fs'

const TOKEN = 'fZx1_test-token:APA91bExample'
const payload = (over: Partial<NotificationPayload> = {}): NotificationPayload => ({
  title: 'Deal gần bạn',
  body: 'Giảm 30% phở tối nay',
  ...over,
})

const ENV = {
  GCP_PROJECT_NUMBER: '1023373437508',
  GCP_WIF_POOL: 'pool',
  GCP_WIF_PROVIDER: 'provider',
  GCP_FCM_SERVICE_ACCOUNT: 'fcm@example.iam.gserviceaccount.com',
  FIREBASE_PROJECT_ID: 'example-project',
} as unknown as NodeJS.ProcessEnv

describe('FCM configuration', () => {
  it('is absent until every part of the identity is set', () => {
    expect(readFcmConfig({} as NodeJS.ProcessEnv)).toBeNull()
    for (const key of Object.keys(ENV)) {
      const partial = { ...ENV } as Record<string, string>
      delete partial[key]
      expect(readFcmConfig(partial as unknown as NodeJS.ProcessEnv), `missing ${key}`).toBeNull()
    }
    expect(isFcmConfigured(ENV)).toBe(true)
  })

  it('never falls back to the media or voice service account', () => {
    // A fallback would route push through an identity that was never granted it.
    const withOthers = {
      ...ENV,
      GCP_FCM_SERVICE_ACCOUNT: undefined,
      GCP_SERVICE_ACCOUNT: 'media@example.iam.gserviceaccount.com',
      GCP_VOICE_SERVICE_ACCOUNT: 'voice@example.iam.gserviceaccount.com',
    } as unknown as NodeJS.ProcessEnv
    expect(readFcmConfig(withOthers)).toBeNull()
  })

  it('requests only the messaging scope', () => {
    expect(FCM_SCOPE).toBe('https://www.googleapis.com/auth/firebase.messaging')
  })
})

describe('the Android payload contract', () => {
  it('is data-only, so the app always chooses the channel', () => {
    // A `notification` block is drawn by the system tray while the app is backgrounded and the
    // app's service never runs — which would bypass the user's identity_sound_enabled choice.
    const msg = buildFcmMessage(TOKEN, payload({ data: { kind: 'tappy_identity' } }))
    expect(msg.message).not.toHaveProperty('notification')
    expect(msg.message.android).not.toHaveProperty('notification')
    expect(msg.message.token).toBe(TOKEN)
  })

  it('carries the classification, not an instruction', () => {
    const msg = buildFcmMessage(TOKEN, payload({ data: { kind: 'tappy_identity' } }))
    expect(msg.message.data.kind).toBe('tappy_identity')
    // The server names a category. It never names a sound file, a URL, or anything to speak.
    const serialized = JSON.stringify(msg)
    expect(serialized).not.toContain('.wav')
    expect(serialized).not.toContain('http')
  })

  it('a missing kind is normal', () => {
    expect(buildFcmMessage(TOKEN, payload()).message.data.kind).toBe('normal')
    expect(buildFcmMessage(TOKEN, payload({ data: {} })).message.data.kind).toBe('normal')
  })

  it('an unknown kind degrades to normal rather than failing the send', () => {
    const msg = buildFcmMessage(
      TOKEN,
      payload({ data: { kind: 'tappy_identity_v2' as never } })
    )
    expect(msg.message.data.kind).toBe('normal')
  })

  it('content cannot promote a notification to the identity', () => {
    // The obvious way to steal the chime: write it in the text.
    const msg = buildFcmMessage(
      TOKEN,
      payload({ title: 'tappy_identity', body: 'kind=tappy_identity' })
    )
    expect(msg.message.data.kind).toBe('normal')
  })

  it('forwards a deep link when there is one, and omits the key when there is not', () => {
    expect(buildFcmMessage(TOKEN, payload({ data: { link: 'tappyai://group/7' } })).message.data.link)
      .toBe('tappyai://group/7')
    expect(buildFcmMessage(TOKEN, payload()).message.data).not.toHaveProperty('link')
  })

  it('every data value is a string, as FCM requires', () => {
    const msg = buildFcmMessage(TOKEN, payload({ data: { kind: 'tappy_identity', link: 'x://y' } }))
    for (const [k, v] of Object.entries(msg.message.data)) {
      expect(typeof v, `data.${k}`).toBe('string')
    }
  })

  it('identity notifications are delivered promptly, normal ones need not wake the device', () => {
    expect(buildFcmMessage(TOKEN, payload({ data: { kind: 'tappy_identity' } })).message.android.priority)
      .toBe('high')
    expect(buildFcmMessage(TOKEN, payload()).message.android.priority).toBe('normal')
  })
})

describe('the identity sound is structural, never spoken', () => {
  it('names an Android resource, not a phrase to synthesise', () => {
    expect(IDENTITY_SOUND_ANDROID).toBe('tappy_identity')
    expect(IDENTITY_SOUND_ANDROID).not.toContain(' ')
  })

  it('the APNs name is declared for later but not wired into the Android path', () => {
    expect(IDENTITY_SOUND_APNS).toBe('TappyIdentity.wav')
    const msg = JSON.stringify(buildFcmMessage(TOKEN, payload({ data: { kind: 'tappy_identity' } })))
    expect(msg).not.toContain(IDENTITY_SOUND_APNS)
  })

  it('no notification text can reach a speech path anywhere in this module', () => {
    const src = readFileSync(new URL('./fcm.ts', import.meta.url), 'utf8')
    for (const forbidden of ['TextToSpeech', 'speak(', '/api/voice/tts', 'synthesize']) {
      expect(src, `must not reference ${forbidden}`).not.toContain(forbidden)
    }
    // Non-vacuous: the detector fires on what it bans.
    expect('tts.speak(payload.body)').toContain('speak(')
  })
})

describe('sending', () => {
  const deps = (fetchImpl: typeof fetch) => ({
    getAccessToken: async () => 'short-lived-token',
    config: readFcmConfig(ENV)!,
    fetchImpl,
  })

  it('posts to the HTTP v1 endpoint with a bearer token', async () => {
    let seen: { url: string; init: RequestInit } | null = null
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init }
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch

    await sendFcmMessage(TOKEN, payload(), deps(fetchImpl))
    expect(seen!.url).toBe('https://fcm.googleapis.com/v1/projects/example-project/messages:send')
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe('Bearer short-lived-token')
  })

  it('treats a deleted token as permanently gone, matching the existing pruning contract', async () => {
    // send.ts prunes on statusCode 404/410; reusing that shape means dead Android tokens are
    // disabled by the code that already does it for web push.
    for (const status of [404, 403]) {
      const fetchImpl = (async () => new Response('{}', { status })) as unknown as typeof fetch
      await expect(sendFcmMessage(TOKEN, payload(), deps(fetchImpl))).rejects.toBeInstanceOf(
        FcmTokenGoneError
      )
      await expect(sendFcmMessage(TOKEN, payload(), deps(fetchImpl))).rejects.toMatchObject({
        statusCode: 404,
      })
    }
  })

  it('reports a transient provider failure separately, so it can be retried', async () => {
    const fetchImpl = (async () => new Response('{}', { status: 503 })) as unknown as typeof fetch
    await expect(sendFcmMessage(TOKEN, payload(), deps(fetchImpl))).rejects.toBeInstanceOf(
      FcmSendError
    )
  })

  it('never leaks the provider response body or the token into the error', async () => {
    // A provider body can echo the token and the message back; an error that carries it ends up in
    // logs and, worse, in anything that surfaces errors to a client.
    const body = JSON.stringify({ error: { message: `bad token ${TOKEN}`, details: 'secret' } })
    const fetchImpl = (async () => new Response(body, { status: 400 })) as unknown as typeof fetch
    const err = await sendFcmMessage(TOKEN, payload(), deps(fetchImpl)).then(
      () => new Error('expected the send to reject'),
      (e: unknown) => e as Error
    )
    expect(err.message).not.toContain(TOKEN)
    expect(err.message).not.toContain('secret')
    expect(err.message).toContain('400')
  })

  it('does not send at all when the deployment has no FCM identity', async () => {
    const { createFcmSender } = await import('./fcm')
    expect(createFcmSender(undefined, {} as NodeJS.ProcessEnv)).toBeNull()
  })
})
