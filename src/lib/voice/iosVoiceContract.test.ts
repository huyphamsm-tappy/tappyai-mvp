// The iOS half of the voice language contract — SOURCE VERIFIED ONLY.
//
// There is no macOS or Xcode in this environment, so nothing here proves iOS compiles or runs. What
// it does prove is that the Swift source states the same contract the web and Android already
// enforce, which is the part most likely to drift: three platforms, one rule, and only one of them
// can be executed here.
//
// The rule has two halves that look alike and are not:
//   voice INPUT follows the APP language  — you dictate in the language you chose to work in
//   read-aloud follows the MESSAGE language — a Vietnamese reply is spoken in Vietnamese even when
//                                             the interface is English
//
// This guard deliberately does NOT ban the string "vi-VN". It is a legitimate OUTPUT value and the
// locale table must be free to contain it. What it bans is a voice being constructed from a literal
// at a call site, which is the actual defect.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const tts = () => read('ios/TappyAI/Features/Chat/Data/TTSManager.swift')
const input = () => read('ios/TappyAI/Features/Chat/Data/VoiceInputManager.swift')
const langFile = () => read('ios/TappyAI/Features/Chat/Data/VoiceLanguage.swift')
const service = () => read('ios/TappyAI/Features/Chat/Data/ChatService.swift')
const catalog = () => read('ios/TappyAI/Resources/Localizable.xcstrings')

/** A voice or recogniser built from a literal locale rather than from the shared table. */
const LITERAL_VOICE = /(AVSpeechSynthesisVoice\(language:\s*["']|SFSpeechRecognizer\(locale:\s*Locale\(identifier:\s*["'])/

describe('the guard itself', () => {
  it('catches a literal voice and ignores a derived one', () => {
    expect('utterance.voice = AVSpeechSynthesisVoice(language: "vi-VN")').toMatch(LITERAL_VOICE)
    expect('recognizer = SFSpeechRecognizer(locale: Locale(identifier: "vi-VN"))').toMatch(LITERAL_VOICE)
    expect('utterance.voice = AVSpeechSynthesisVoice(language: localeTag)').not.toMatch(LITERAL_VOICE)
    expect('utterance.voice = AVSpeechSynthesisVoice(language: currentLocaleTag)').not.toMatch(LITERAL_VOICE)
  })
})

describe('no hardcoded voice locale remains', () => {
  it.each([
    ['TTSManager', () => tts()],
    ['VoiceInputManager', () => input()],
  ])('%s builds no voice from a literal', (_name, src) => {
    expect(src()).not.toMatch(LITERAL_VOICE)
  })

  it('the locale table is still allowed to contain the tags', () => {
    // Proves the guard above is scoped to CALL SITES, not to the strings themselves.
    const src = langFile()
    expect(src).toContain('"vi": "vi-VN"')
    expect(src).toContain('"en": "en-US"')
  })
})

describe('read-aloud follows the MESSAGE language', () => {
  it('takes the locale as a parameter rather than deciding one', () => {
    expect(tts()).toMatch(/func speak\(msgId: String, text: String, localeTag: String\)/)
  })

  it('asks the backend through an injected resolver, not by inspecting the text', () => {
    const src = tts()
    expect(src).toContain('var resolveLanguage: ((String) async -> MessageLanguage)?')
    expect(src).toContain('await resolveLanguage(text)')
  })

  it('reuses the same language for resume/skip/speed instead of re-deriving one', () => {
    // restartFrom re-speaks from an offset; picking a voice again there could switch language
    // mid-message.
    expect(tts()).toContain('AVSpeechSynthesisVoice(language: currentLocaleTag)')
  })

  it('stays silent when the device has no voice for that language', () => {
    expect(tts()).toMatch(/guard let voice = AVSpeechSynthesisVoice\(language: localeTag\) else \{ return \}/)
  })
})

describe('voice INPUT still follows the APP language', () => {
  it('derives the recogniser locale from the app language', () => {
    const src = input()
    expect(src).toContain('VoiceLocale.inputTag(forAppLanguage:')
    // The other half of the contract: input must NOT have moved to message language.
    expect(src).not.toContain('resolveLanguage')
    expect(src).not.toContain('messageLanguage')
  })
})

describe('there is no second language detector in Swift', () => {
  it('the service asks the backend endpoint', () => {
    expect(service()).toContain('/api/voice/language')
  })

  it('nothing inspects the message text to guess a language', () => {
    for (const [name, src] of [['TTSManager', tts()], ['VoiceLanguage', langFile()]] as const) {
      expect(src, name).not.toMatch(/unicodeScalars|CharacterSet|NSRegularExpression/)
    }
  })

  it('never falls back to Vietnamese when the answer is unknown', () => {
    // The exact shape of the bug: defaulting to Vietnamese when nothing decided.
    for (const [name, src] of [['TTSManager', tts()], ['ChatService', service()], ['VoiceLanguage', langFile()]] as const) {
      expect(src, name).not.toMatch(/\?\?\s*"vi-VN"/)
      expect(src, name).not.toMatch(/\?\?\s*"vi"/)
    }
  })

  it('the client never receives or names a Google voice', () => {
    for (const [name, src] of [['TTSManager', tts()], ['ChatService', service()]] as const) {
      expect(src, name).not.toMatch(/Chirp3|Neural2|Wavenet|Studio|voiceName/)
    }
  })
})

describe('stopping is not an error', () => {
  it('toggling off stops without asking the backend and without a message', () => {
    const src = tts()
    const fn = src.split('func speakResolvingLanguage')[1]?.split('\n    }')[0] ?? ''
    expect(fn).toContain('if speakingMsgId == msgId {')
    // The early return must come before the resolver call, so a toggle-off costs no request.
    expect(fn.indexOf('stop()')).toBeLessThan(fn.indexOf('resolveLanguage'))
  })
})

describe('EN/VI parity for the new iOS strings', () => {
  it.each(['chat.tts.languageUnsupported', 'chat.tts.languageFailed'])('%s exists in both languages', (key) => {
    const src = catalog()
    const entry = src.split(`"${key}"`)[1]?.slice(0, 500) ?? ''
    expect(entry).toContain('"en"')
    expect(entry).toContain('"vi"')
  })

  it('the two messages are different text, not a copy-paste', () => {
    const src = catalog()
    expect(src).toContain("This reply is in a language Tappy can't read aloud yet.")
    expect(src).toContain('Câu trả lời này ở ngôn ngữ Tappy chưa đọc được.')
    expect(src).toContain("Couldn't read that answer aloud. Please try again.")
    expect(src).toContain('Chưa đọc được câu trả lời. Bạn thử lại giúp mình nhé.')
  })

  it('the catalog is still valid JSON after the edit', () => {
    // An xcstrings file is JSON; a malformed edit would break the build on a machine that has one.
    expect(() => JSON.parse(catalog())).not.toThrow()
  })
})
