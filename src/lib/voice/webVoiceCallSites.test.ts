// Guards the web voice call sites against the defect they just came out of.
//
// The bug was not subtle and it survived anyway: `recognition.lang = 'vi-VN'` sat in
// ChatInterface.tsx AND SearchBar.tsx, so English-mode users dictated English into a Vietnamese
// recogniser. Unit-testing the shared table cannot catch a call site that ignores it, which is why
// this reads the components themselves.
//
// The regex is anchored on the ASSIGNMENT (`recognition.lang = '...'`), not on the string 'vi-VN'
// anywhere in the file — a component may legitimately mention a locale in a comment, and matching
// that would make this guard noisy enough to be disabled.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const VOICE_COMPONENTS = [
  'src/components/ChatInterface.tsx',
  'src/components/SearchBar.tsx',
  'src/app/translate/page.tsx',
] as const

/** A speech-recognition locale assigned from a literal rather than the shared table. */
const HARDCODED_RECOGNITION_LOCALE = /\.lang\s*=\s*['"][a-z]{2}-[A-Z]{2}['"]/

describe('the guard itself', () => {
  // A broken pattern here would let every assertion below pass while proving nothing.
  it('catches a hardcoded assignment and ignores a derived one', () => {
    expect("recognition.lang = 'vi-VN'").toMatch(HARDCODED_RECOGNITION_LOCALE)
    expect('recognition.lang = "en-US"').toMatch(HARDCODED_RECOGNITION_LOCALE)
    expect('recognition.lang = inputLocale').not.toMatch(HARDCODED_RECOGNITION_LOCALE)
  })
})

describe('web voice call sites read the shared contract', () => {
  it.each(VOICE_COMPONENTS)('%s assigns no hardcoded recognition locale', (file) => {
    expect(read(file)).not.toMatch(HARDCODED_RECOGNITION_LOCALE)
  })

  it.each(VOICE_COMPONENTS)('%s derives its locale from the voice config', (file) => {
    const src = read(file)
    expect(src).toContain("from '@/lib/voice/config'")
    expect(src).toContain('inputLocaleFor(locale)')
  })

  it.each(VOICE_COMPONENTS)('%s refuses to listen in an unsupported language', (file) => {
    // Guards the branch, not merely the call: without it, a null locale would be assigned and the
    // engine would silently fall back to the page language.
    expect(read(file)).toMatch(/if\s*\(!inputLocale\)/)
  })
})

describe('voice messages are localized, not hardcoded', () => {
  it('ChatInterface no longer carries hardcoded Vietnamese voice errors', () => {
    const src = read('src/components/ChatInterface.tsx')
    // The six strings this replaced, by their distinctive fragments.
    for (const gone of ['Cần cấp quyền micro', 'Mình chưa nghe thấy gì', 'Không tìm thấy micro', 'Không khởi động được micro', 'Có trục trặc khi nhận giọng nói', 'Trình duyệt chưa hỗ trợ nhập bằng giọng nói']) {
      expect(src).not.toContain(gone)
    }
  })

  // The defect is a STRING LITERAL, not "did not call t()". `noVoiceMessage(code, uiLocale)` is a
  // legitimate localization helper with its own EN/VI coverage, so requiring t() specifically would
  // fail a correctly-localized call site and push someone to weaken the guard.
  // A literal with CONTENT is the defect. `setVoiceError('')` and `setVoiceError(null)` clear the
  // banner and display nothing, so they are not user-facing text — flagging them would only teach
  // someone to route an empty string through the translator to satisfy a guard.
  const HARDCODED_MESSAGE = /setVoiceError\(\s*['"`][^'"`]/

  it('no setVoiceError call passes a hardcoded message', () => {
    for (const file of VOICE_COMPONENTS) {
      const calls = read(file).match(/setVoiceError\([^)]*\)/g) ?? []
      expect(calls.length, file).toBeGreaterThan(0)
      expect(calls.filter((c) => HARDCODED_MESSAGE.test(c)), file).toEqual([])
    }
  })

  it('that guard would catch a real regression, and tolerates clearing', () => {
    expect(HARDCODED_MESSAGE.test("setVoiceError('Cần cấp quyền micro')")).toBe(true)
    expect(HARDCODED_MESSAGE.test('setVoiceError("Microphone blocked")')).toBe(true)
    expect(HARDCODED_MESSAGE.test("setVoiceError(t('voice.noSpeech'))")).toBe(false)
    expect(HARDCODED_MESSAGE.test('setVoiceError(noVoiceMessage(x, locale))')).toBe(false)
    expect(HARDCODED_MESSAGE.test("setVoiceError('')")).toBe(false)
    expect(HARDCODED_MESSAGE.test('setVoiceError(null)')).toBe(false)
  })
})
