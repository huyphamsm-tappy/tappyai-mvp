// The voice service's configuration and security boundaries.
//
// Two properties matter more than anything else here, and neither is visible at a glance:
//   1. The voice identity is SEPARATE from the media identity. If GCP_VOICE_SERVICE_ACCOUNT ever
//      fell back to the media account, TTS would silently run on the storage credential and the
//      two-account split would be decorative.
//   2. The media account's scope did not change when the voice account was added. Widening the
//      shared default would hand storage permissions to voice, and voice permissions to storage.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readVoiceConfig, isVoiceServiceReady } from './service'
import { TTS_SCOPE } from './googleTts'
import { STORAGE_SCOPE } from '@/lib/media/gcpAuth'

const root = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const FULL_ENV = {
  GCP_PROJECT_NUMBER: '1023373437508',
  GCP_WIF_POOL: 'vercel-oidc',
  GCP_WIF_PROVIDER: 'vercel',
  GCP_VOICE_SERVICE_ACCOUNT: 'tappyai-voice-tts@example.iam.gserviceaccount.com',
} as unknown as NodeJS.ProcessEnv

describe('the two service accounts stay separate', () => {
  it('reads the voice account from its own variable', () => {
    expect(readVoiceConfig(FULL_ENV)?.serviceAccountEmail).toBe(
      'tappyai-voice-tts@example.iam.gserviceaccount.com'
    )
  })

  it('does NOT fall back to the media service account', () => {
    const noVoice = { ...FULL_ENV, GCP_VOICE_SERVICE_ACCOUNT: undefined, GCP_MEDIA_SERVICE_ACCOUNT: 'tappyai-media-bridge@example.iam.gserviceaccount.com' } as unknown as NodeJS.ProcessEnv
    expect(readVoiceConfig(noVoice)).toBeNull()
    expect(isVoiceServiceReady(noVoice)).toBe(false)
  })

  it('never names the media account in the voice module', () => {
    expect(read('src/lib/voice/tts/service.ts')).not.toContain('GCP_MEDIA_SERVICE_ACCOUNT')
  })

  it('uses a scope distinct from storage', () => {
    expect(TTS_SCOPE).not.toBe(STORAGE_SCOPE)
    expect(STORAGE_SCOPE).toBe('https://www.googleapis.com/auth/devstorage.read_write')
  })
})

describe('the media scope was not widened when voice was added', () => {
  // The regression this prevents: someone "simplifies" by giving both accounts cloud-platform.
  it('still requests storage-only by default', () => {
    const src = read('src/lib/media/gcpAuth.ts')
    expect(src).toContain("STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write'")
    expect(src).toMatch(/deps\.scopes \?\? \[STORAGE_SCOPE\]/)
  })
})

describe('an unconfigured deployment is an expected state', () => {
  it.each([
    ['project number', 'GCP_PROJECT_NUMBER'],
    ['pool', 'GCP_WIF_POOL'],
    ['provider', 'GCP_WIF_PROVIDER'],
    ['voice service account', 'GCP_VOICE_SERVICE_ACCOUNT'],
  ])('is not ready without the %s', (_label, key) => {
    const env = { ...FULL_ENV, [key]: undefined } as unknown as NodeJS.ProcessEnv
    expect(readVoiceConfig(env)).toBeNull()
  })

  it('is ready when everything is present', () => {
    expect(isVoiceServiceReady(FULL_ENV)).toBe(true)
  })
})

describe('the route is the language contract', () => {
  const route = () => read('src/app/api/voice/tts/route.ts')

  it('decides the language server-side rather than trusting the client', () => {
    const src = route()
    expect(src).toContain('detectLang')
    // A declared language is normalized against the supported set, never used verbatim.
    expect(src).toMatch(/normalizeVoiceLanguage\(declared\)\s*\?\?\s*normalizeVoiceLanguage\(detectLang\(text\)\)/)
  })

  it('never lets the client choose a voice', () => {
    // A caller-supplied voice name would be a cost and brand decision handed to the browser.
    expect(route()).not.toMatch(/body\.voice|voiceName\s*=\s*body/)
  })

  it('requires authentication and rate-limits per user', () => {
    const src = route()
    expect(src).toContain('getRequestUser')
    expect(src).toMatch(/rateLimit\(`voice-tts:\$\{user\.id\}`/)
  })

  it('bounds the billable text length', () => {
    expect(route()).toMatch(/text\.length > MAX_CHARS/)
  })

  it('answers 503 rather than substituting a language when voice is unavailable', () => {
    const src = route()
    expect(src).toContain("error: 'voice_unavailable'")
    expect(src).toContain('TtsNotConfiguredError')
  })

  it('does not return the provider error text to the caller', () => {
    const src = route()
    expect(src).toContain("error: 'synthesis_failed'")
    expect(src).not.toMatch(/message:\s*e\.message|String\(e\)/)
  })
})
