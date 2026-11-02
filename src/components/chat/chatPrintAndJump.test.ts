// Owner 02/11 (web chat):
//  1. Ctrl+P printed one page - the chat page is one screen tall (h-dvh) and only its middle pane scrolls, so the print had the visible
//     part only. Printing now lets the chat pages' frames grow to the whole conversation and hides the bars and the composer.
//  2. A long chat needed the mouse wheel or the scroll bar to get around: buttons to the top / the end, and when the reader has
//     scrolled up while Tappy is still answering, the end button says so with the typing dots.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { jumpButtons } from './useStickToBottom'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('scroll jump buttons', () => {
  const m = (scrollTop: number, scrollHeight = 5000, clientHeight = 800) => ({ scrollTop, scrollHeight, clientHeight })
  it('at the end: only "to the top" once far enough from it', () => {
    expect(jumpButtons(m(4200), false)).toEqual({ top: true, end: false, answering: false })
    expect(jumpButtons(m(0, 900), false)).toEqual({ top: false, end: false, answering: false })
  })
  it('scrolled up: "to the end", and while Tappy is answering it shows the typing dots', () => {
    expect(jumpButtons(m(1000), false)).toEqual({ top: true, end: true, answering: false })
    expect(jumpButtons(m(1000), true)).toEqual({ top: true, end: true, answering: true })
    expect(jumpButtons(m(100), true)).toEqual({ top: false, end: true, answering: true })
  })
  it('the chat draws them over its scrolling pane', () => {
    const chat = src('src/components/ChatInterface.tsx')
    expect(chat).toContain('<ScrollJumpButtons')
    expect(chat).toContain('data-chat-scroll')
  })
})

describe('printing the chat', () => {
  it('the print rule lets the chat frames grow and hides the bars and the composer', () => {
    const css = src('src/app/globals.css')
    const print = css.slice(css.indexOf('/* chat print */'))
    expect(print).toContain('@media print')
    expect(print).toContain('[data-chat-page]')
    expect(print).toContain('[data-chat-scroll]')
    expect(print).toContain('overflow: visible !important')
    expect(print).toContain('[data-print-hide]')
  })
  it('both chat pages and the composer carry the markers', () => {
    expect(src('src/app/(app)/chat/page.tsx')).toContain('data-chat-page')
    expect(src('src/app/(app)/chat/[id]/ChatConversation.tsx')).toContain('data-chat-page')
    expect(src('src/components/ChatInterface.tsx')).toContain('data-print-hide')
  })
})
