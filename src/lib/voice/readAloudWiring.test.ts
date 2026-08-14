// Read Aloud must go through the server, and must not re-acquire the two decisions it just gave up.
//
// The regression this guards is subtle and would look harmless in review: someone reinstates
// `detectLang(text)` at the call site "so the server does not have to guess". That silently
// recreates a second language implementation in the client, which is exactly the drift the
// /api/voice/tts contract exists to prevent — and it would not fail any unit test, because the
// server would still work.
//
// The other half is the failure split. "No voice for this language" and "synthesis failed" need
// different sentences: one says do not bother, the other says try again. Collapsing them shows the
// wrong message in both cases.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi as viVoice, en as enVoice } from '@/lib/i18n/w2/voice'

const root = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')
const chat = () => read('src/components/ChatInterface.tsx')
const hook = () => read('src/hooks/useServerTTS.ts')

describe('the chat UI reads aloud through the server', () => {
  it('uses the server hook, not the browser speech engine', () => {
    const src = chat()
    expect(src).toContain("import { useServerTTS } from '@/hooks/useServerTTS'")
    expect(src).toContain('useServerTTS()')
    expect(src).not.toMatch(/from '@\/hooks\/useTTS'/)
  })

  it('does not pass a language to speak() — the backend decides it', () => {
    const src = chat()
    expect(src).toMatch(/tts\.speak\(msg\.id,\s*text\)/)
    // The specific regression: re-adding client-side detection at the call site.
    expect(src).not.toMatch(/tts\.speak\([^)]*detectLang/)
  })

  it('no longer imports the language detector at all', () => {
    // Leaving the import would let the next edit quietly reach for it again.
    expect(chat()).not.toContain("from '@/lib/ai/intent'")
  })
})

describe('the two failure modes stay distinct', () => {
  it('handles unavailable and failed with different messages', () => {
    const src = chat()
    expect(src).toContain('tts.unavailableLang')
    expect(src).toContain('tts.failed')
    expect(src).toContain("t('voice.readAloudFailed')")
    // unavailable keeps its own message, naming the language it cannot speak
    expect(src).toContain('noVoiceMessage(tts.unavailableLang')
  })

  it('both messages exist in both languages', () => {
    for (const key of ['voice.readAloudFailed', 'voice.voiceUnavailable']) {
      expect(viVoice[key], `vi ${key}`).toBeTruthy()
      expect(enVoice[key], `en ${key}`).toBeTruthy()
    }
    expect(viVoice['voice.readAloudFailed']).not.toBe(enVoice['voice.readAloudFailed'])
  })
})

describe('the hook cannot leak audio, requests, or a voice choice', () => {
  it('never names a voice', () => {
    // Choosing the voice is a cost decision; the browser must not be able to make it.
    const src = hook()
    expect(src).not.toMatch(/Chirp3|Neural2|Wavenet|Studio|voiceName:/)
  })

  it('aborts the in-flight request and revokes the blob URL', () => {
    const src = hook()
    expect(src).toContain('abortRef.current?.abort()')
    expect(src).toContain('URL.revokeObjectURL')
  })

  it('tears down on unmount', () => {
    expect(hook()).toMatch(/useEffect\(\(\) => \(\) => \{ teardown\(\) \}/)
  })

  it('ignores a response that arrived after the user pressed stop', () => {
    // Without this, stopping then starting another message would play the abandoned audio.
    expect(hook()).toContain('if (controller.signal.aborted) return')
  })

  it('changes speed without paying for a re-synthesis', () => {
    const src = hook()
    expect(src).toContain('audioRef.current.playbackRate = next')
    expect(src).not.toMatch(/changeSpeed[\s\S]{0,200}requestSpeech/)
  })
})
