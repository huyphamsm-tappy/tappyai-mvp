// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import VoiceOverlay from './VoiceOverlay'

const base = { listening: true, text: '', error: null, firstUse: false, onToggle: vi.fn(), onCancel: vi.fn(), onSend: vi.fn() }

describe('C3: the voice screen', () => {
  it('shows the SAMPLE sentence before any speech, and the Send button cannot be pressed', () => {
    const onSend = vi.fn()
    const { container } = render(<VoiceOverlay {...base} onSend={onSend} />)
    expect(container.querySelector('[data-voice-sample]')).toBeTruthy()
    const send = container.querySelector('[data-voice-send]') as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.click(send)
    expect(onSend).not.toHaveBeenCalled()
  })
  it('whitespace-only recognition is still «nothing to send»', () => {
    const { container } = render(<VoiceOverlay {...base} text="   " />)
    expect((container.querySelector('[data-voice-send]') as HTMLButtonElement).disabled).toBe(true)
  })
  it('recognised text REPLACES the sample and enables Send', () => {
    const onSend = vi.fn()
    const { container } = render(<VoiceOverlay {...base} text="quán phở ngon quận 3" onSend={onSend} />)
    expect(container.querySelector('[data-voice-sample]')).toBeNull()
    expect(container.querySelector('[data-voice-text]')?.textContent).toBe('quán phở ngon quận 3')
    fireEvent.click(container.querySelector('[data-voice-send]') as HTMLButtonElement)
    expect(onSend).toHaveBeenCalledTimes(1)
  })
  it('Cancel and the centre button call their own handlers', () => {
    const onCancel = vi.fn(), onToggle = vi.fn()
    const { container } = render(<VoiceOverlay {...base} onCancel={onCancel} onToggle={onToggle} />)
    fireEvent.click(container.querySelector('[data-voice-cancel]') as HTMLButtonElement)
    fireEvent.click(container.querySelector('[data-voice-toggle]') as HTMLButtonElement)
    expect(onCancel).toHaveBeenCalledTimes(1); expect(onToggle).toHaveBeenCalledTimes(1)
  })
  it('paused state says so; the first-use line explains the microphone; an error replaces it', () => {
    const { container, rerender } = render(<VoiceOverlay {...base} listening={false} firstUse />)
    expect(container.querySelector('[data-voice-title]')?.textContent).toMatch(/Đã dừng nghe|Stopped/)
    expect(container.querySelector('[data-voice-reason]')).toBeTruthy()
    rerender(<VoiceOverlay {...base} listening={false} firstUse error="Cần cấp quyền micro" />)
    expect(container.querySelector('[data-voice-reason]')).toBeNull()
    expect(container.querySelector('[data-voice-error]')?.textContent).toBe('Cần cấp quyền micro')
  })
})

describe('C1: every way out switches the microphone off (source guard)', () => {
  const src = readFileSync(join(__dirname, '..', 'ChatInterface.tsx'), 'utf8')
  it('releaseRecognition detaches the handlers and aborts', () => {
    const block = src.slice(src.indexOf('const releaseRecognition'), src.indexOf('const closeVoice'))
    expect(block).toMatch(/r\.onresult = null/)
    expect(block).toMatch(/r\.abort\(\)/)
    expect(block).toMatch(/clearTimeout\(voiceIdleRef\.current\)/)
  })
  it('background tab, page hide, error, end, idle timeout and unmount all go through it', () => {
    expect(src).toMatch(/addEventListener\('visibilitychange', hide\)/)
    expect(src).toMatch(/addEventListener\('pagehide', leave\)/)
    expect(src).toMatch(/VOICE_IDLE_MS = 60_000/)
    expect(src).toMatch(/recognition\.onend = \(\) => \{[\s\S]{0,200}releaseRecognition\(\)/)
    expect(src).toMatch(/recognition\.onerror = [\s\S]{0,900}releaseRecognition\(\)/)
  })
  it('recognised text never goes into the input box by itself', () => {
    const onresult = src.slice(src.indexOf('recognition.onresult'), src.indexOf('// Optimistic instant feedback'))
    expect(onresult).toMatch(/setVoiceText\(/)
    expect(onresult).not.toMatch(/setInput\(/)
  })
})
