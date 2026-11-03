// @vitest-environment jsdom
// 01/11 (owner UAT: "Tappy không copy được câu hỏi mà anh đã gửi, chỉ copy được câu trả lời"): the question the person sent gets its own copy
// button, and what it copies is the text exactly as they typed it (an answer is copied as plain text; a question is not edited).
import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import UserMessageCopy from './UserMessageCopy'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const withClipboard = () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

describe('UserMessageCopy', () => {
  it('copies the question exactly as typed: markdown marks, links and line breaks untouched', async () => {
    const writeText = withClipboard()
    const typed = 'so sánh **A** và *B*\nxem https://example.com/x?a=1 giúp mình'
    render(<UserMessageCopy text={typed} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(typed))
  })
  it('says it was copied, then goes back', async () => {
    withClipboard()
    render(<UserMessageCopy text="xin chào" />)
    const before = screen.getByRole('button').getAttribute('aria-label')
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('button').getAttribute('aria-label')).not.toBe(before))
  })
  it('a blocked clipboard does not break the chat', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    render(<UserMessageCopy text="x" />)
    fireEvent.click(screen.getByRole('button'))
    await new Promise(r => setTimeout(r, 20))
    expect(screen.getByRole('button')).toBeTruthy()
  })
})

describe('the chat', () => {
  it('shows the copy button under every question the person sent', () => {
    const src = readFileSync('src/components/ChatInterface.tsx', 'utf8')
    expect(src).toContain('<UserMessageCopy text={typeof msg.content === \'string\' ? msg.content : \'\'}')
  })
})
