// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pickVoice, bcp47ForLang, type VoiceLike } from './voiceSelection'

const v = (name: string, lang: string, extra: Partial<VoiceLike> = {}): VoiceLike => ({ name, lang, ...extra })

// The Windows-desktop reality from the RCA: only English voices installed.
const ENGLISH_ONLY: VoiceLike[] = [
  v('Microsoft David - English (United States)', 'en-US', { localService: true, default: true }),
  v('Microsoft Mark - English (United States)', 'en-US', { localService: true }),
  v('Microsoft Zira - English (United States)', 'en-US', { localService: true }),
]

describe('pickVoice — never a wrong-language voice', () => {
  it('returns NULL for Vietnamese when only English voices exist (the reported bug)', () => {
    expect(pickVoice(ENGLISH_ONLY, 'vi')).toBeNull()
  })

  it('picks a Vietnamese voice when one exists (never falls back to English)', () => {
    const voices = [...ENGLISH_ONLY, v('Google Tiếng Việt', 'vi-VN', { localService: false })]
    const picked = pickVoice(voices, 'vi')
    expect(picked?.lang.toLowerCase().startsWith('vi')).toBe(true)
    expect(picked?.name).toBe('Google Tiếng Việt')
  })

  it('prefers the natural/cloud voice over a robotic local one for the same language', () => {
    const voices = [
      v('eSpeak Vietnamese', 'vi-VN', { localService: true }),
      v('Microsoft HoaiMy Online (Natural) - Vietnamese', 'vi-VN', { localService: false }),
    ]
    expect(pickVoice(voices, 'vi')?.name).toContain('HoaiMy')
  })

  it('prefers the exact region tag (vi-VN) over a generic same-primary voice', () => {
    const voices = [v('Generic Viet', 'vi', { localService: true }), v('Regional Viet', 'vi-VN', { localService: true })]
    expect(pickVoice(voices, 'vi')?.name).toBe('Regional Viet')
  })

  it('selects an English voice for English text', () => {
    expect(pickVoice(ENGLISH_ONLY, 'en')?.lang).toBe('en-US')
  })

  it('returns null for Japanese when no ja voice exists', () => {
    expect(pickVoice(ENGLISH_ONLY, 'ja')).toBeNull()
  })
})

describe('bcp47 + display names', () => {
  it('maps detectLang codes to BCP-47 tags', () => {
    expect(bcp47ForLang('vi')).toBe('vi-VN')
    expect(bcp47ForLang('en')).toBe('en-US')
    expect(bcp47ForLang('ja')).toBe('ja-JP')
  })

  it('no longer ships a device-blaming notice for anyone to reach for', () => {
    // `noVoiceMessage`/`langDisplayName` were deleted, not merely unused: they claimed the DEVICE
    // had no voice for a language, and the chat UI showed that for an unconfigured SERVER provider.
    const src = readFileSync(new URL('./voiceSelection.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/export function noVoiceMessage/)
    expect(src).not.toMatch(/export function langDisplayName/)
    expect(src).not.toContain("This device has no ${name} voice")
  })
})
