// THE ONE RULE: notification content must never be spoken.
//
// Tappy's notification identity is a chime and the word "TAPPY!". It is NOT a reader. A user who
// gets a notification in a quiet room, or on a speaker in a shared office, must never have the
// title or body read out — that is a privacy failure, not a feature bug, and it cannot be undone
// once it has happened.
//
// The audit that produced this guard found no such path today. It also found how easily one could
// appear: push-sw.js posts the FULL payload to the page, and the chime is invoked on the very next
// line. `playTappyChime(event.data.payload.body)` is a one-line change that no type error would
// catch, because the function would simply gain a parameter.
//
// So this guard pins the SHAPE that makes it impossible, not merely the current absence:
// playTappyChime takes no arguments and speaks a literal.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const chime = () => read('src/lib/notifications/chime.ts')
const pushHook = () => read('src/hooks/usePushNotifications.ts')
const serviceWorker = () => read('public/push-sw.js')

/** A call to the chime that passes anything at all. */
const CHIME_WITH_ARGUMENT = /playTappyChime\s*\(\s*[^)\s]/

describe('the detectors themselves', () => {
  // Without these, a broken pattern would let every assertion below pass while proving nothing.
  it('catches a chime call carrying content and allows the bare call', () => {
    expect('playTappyChime(event.data.payload.body)').toMatch(CHIME_WITH_ARGUMENT)
    expect('playTappyChime(title)').toMatch(CHIME_WITH_ARGUMENT)
    expect('playTappyChime(notification.body)').toMatch(CHIME_WITH_ARGUMENT)
    expect('playTappyChime()').not.toMatch(CHIME_WITH_ARGUMENT)
    expect('playTappyChime( )').not.toMatch(CHIME_WITH_ARGUMENT)
  })
})

describe('playTappyChime cannot receive content', () => {
  it('declares no parameters', () => {
    // The structural guarantee: it is not that we choose not to pass the body, it is that there is
    // nowhere to put it.
    expect(chime()).toMatch(/export function playTappyChime\(\s*\)\s*:\s*void/)
  })

  it('speaks a literal, never a variable', () => {
    const src = chime()
    expect(src).toMatch(/new SpeechSynthesisUtterance\(\s*'Tappy'\s*\)/)
    // Any other utterance construction in this file would mean something dynamic is spoken.
    expect(src.match(/new SpeechSynthesisUtterance\(/g)?.length ?? 0).toBe(1)
  })

  it('never reads a title, body or payload', () => {
    const src = chime()
    for (const forbidden of ['body', 'title', 'payload', 'notification']) {
      expect(src.toLowerCase(), forbidden).not.toContain(`.${forbidden}`)
    }
  })
})

describe('no call site passes content to the chime', () => {
  it.each([
    ['the push hook', () => pushHook()],
    ['the service worker', () => serviceWorker()],
    ['the chime module', () => chime()],
  ])('%s calls it with no arguments', (_name, src) => {
    expect(src()).not.toMatch(CHIME_WITH_ARGUMENT)
  })
})

describe('no notification handler reaches any other TTS path', () => {
  const TTS_ENTRY_POINTS = [
    'useTTS',
    'useServerTTS',
    '/api/voice/tts',
    'requestSpeech',
    'speechSynthesis.speak',
  ]

  it.each(TTS_ENTRY_POINTS)('the push hook does not use %s', (entry) => {
    // The push hook is where notification data lives in the page. It may play the chime, and
    // nothing else that produces speech.
    expect(pushHook()).not.toContain(entry)
  })

  it.each(TTS_ENTRY_POINTS)('the service worker does not use %s', (entry) => {
    expect(serviceWorker()).not.toContain(entry)
  })

  it('the service worker performs no speech at all', () => {
    // A service worker has no speechSynthesis, but asserting it keeps a future "helpful" addition
    // from being reviewed as harmless.
    const src = serviceWorker()
    expect(src).not.toContain('SpeechSynthesisUtterance')
    expect(src).not.toContain('speechSynthesis')
  })
})

describe('what the service worker hands the page', () => {
  it('still posts the payload — which is exactly why the guards above exist', () => {
    // Documenting the hazard rather than pretending it is absent: the body IS available at the
    // call site. The guards make using it a test failure instead of a plausible-looking edit.
    expect(serviceWorker()).toContain("postMessage({ type: 'TAPPY_PUSH'")
  })
})
