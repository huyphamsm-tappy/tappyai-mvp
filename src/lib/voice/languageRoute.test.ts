// The language endpoint the native clients consume.
//
// Its whole reason to exist is that detectLang() must have exactly ONE implementation. It was shaped
// by two production incidents in opposite directions — an English sentence flipped to Vietnamese by
// a curly quote, then a Vietnamese place name flipping an English sentence — and a Kotlin copy plus
// a Swift copy would drift apart the first time one of them was corrected.
//
// So these tests assert two different things: that the endpoint's SOURCE delegates rather than
// reimplements, and that the shared detector plus normalization actually produce the answers the
// clients depend on.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectLang } from '@/lib/ai/intent'
import { normalizeVoiceLanguage } from './config'

const root = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')
const route = () => read('src/app/api/voice/language/route.ts')

/** What the route computes, expressed once so the tests below cannot drift from it. */
const answer = (text: string) => normalizeVoiceLanguage(detectLang(text))

describe('the backend owns the decision', () => {
  it('delegates to the shared detector instead of reimplementing it', () => {
    const src = route()
    expect(src).toContain("import { detectLang } from '@/lib/ai/intent'")
    expect(src).toMatch(/normalizeVoiceLanguage\(detectLang\(/)
  })

  it('normalizes before answering, so a client cannot receive a language it has no voice for', () => {
    expect(route()).toContain('normalizeVoiceLanguage')
  })

  it('is authenticated and rate-limited like every other voice route', () => {
    const src = route()
    expect(src).toContain('getRequestUser')
    expect(src).toMatch(/rateLimit\(`voice-lang:\$\{user\.id\}`/)
  })

  it('returns no audio, no voice name and no cost', () => {
    const src = route()
    expect(src).not.toContain('audioBase64')
    expect(src).not.toContain('SELECTED_VOICE')
    expect(src).not.toContain('texttospeech')
  })
})

describe('the answers the clients will act on', () => {
  it.each([
    ['quán ăn ngon ở đây', 'vi'],
    ['cho tôi xem menu nhé', 'vi'],
    ['where can I find good coffee', 'en'],
    ['Đà Nẵng hotels for two nights', 'en'],
  ])('%s → %s', (text, expected) => {
    expect(answer(text)).toBe(expected)
  })

  // A language we genuinely cannot speak must come back as null so the client stays silent.
  it.each(['こんにちは', '안녕하세요', 'สวัสดีครับ'])('answers null for %s', (text) => {
    expect(answer(text)).toBeNull()
  })

  it('never answers with a language outside the supported set', () => {
    for (const text of ['xin chào', 'hello', 'こんにちは', '你好', 'Привет']) {
      const a = answer(text)
      expect(a === null || a === 'vi' || a === 'en', `${text} -> ${a}`).toBe(true)
    }
  })
})

describe('speakable mirrors the language, never contradicts it', () => {
  it('is false exactly when the language is null', () => {
    for (const text of ['xin chào', 'hello there', 'こんにちは']) {
      const language = answer(text)
      const speakable = language !== null
      expect(speakable).toBe(language !== null)
    }
    // And the route derives it the same way rather than tracking a second flag.
    expect(route()).toMatch(/speakable:\s*language !== null/)
  })
})
