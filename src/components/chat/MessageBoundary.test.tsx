// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import MessageBoundary, { Deferred } from './MessageBoundary'

afterEach(cleanup)
const labels = { title: 'This message could not be shown.', retry: 'Retry', copy: 'Copy', copied: 'Copied' }
let boom = true
const Bomb = () => { if (boom) throw new Error('card exploded'); return <p>fine now</p> }

describe('MessageBoundary — one broken message never blanks the chat', () => {
  it('contains a throwing child to its own row; the neighbours still render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    boom = true
    const onError = vi.fn()
    render(
      <div>
        <p>message one</p>
        <MessageBoundary resetKey={1} rawText="raw answer" labels={labels} onError={onError}><Bomb /></MessageBoundary>
        <p>message three</p>
      </div>,
    )
    expect(screen.getByText('message one')).toBeTruthy()
    expect(screen.getByText('message three')).toBeTruthy()
    expect(screen.getByTestId('message-boundary')).toBeTruthy()
    expect(screen.getByText(labels.title)).toBeTruthy()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it("catches an exception thrown by the caller's own parse code (Deferred)", () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<MessageBoundary resetKey={1} rawText="x" labels={labels}><Deferred render={() => { throw new Error('parse failed') }} /></MessageBoundary>)
    expect(screen.getByTestId('message-boundary')).toBeTruthy()
  })

  it('Retry renders the message again; Copy puts the raw text on the clipboard', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    boom = true
    render(<MessageBoundary resetKey={1} rawText="the raw answer" labels={labels}><Bomb /></MessageBoundary>)
    fireEvent.click(screen.getByText('Copy'))
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith('the raw answer')
    boom = false
    fireEvent.click(screen.getByText('Retry'))
    expect(screen.getByText('fine now')).toBeTruthy()
    expect(screen.queryByTestId('message-boundary')).toBeNull()
  })

  it('a new content key (next streamed chunk) clears the caught error by itself', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    boom = true
    const { rerender } = render(<MessageBoundary resetKey={10} rawText="a" labels={labels}><Bomb /></MessageBoundary>)
    expect(screen.getByTestId('message-boundary')).toBeTruthy()
    boom = false
    rerender(<MessageBoundary resetKey={11} rawText="ab" labels={labels}><Bomb /></MessageBoundary>)
    expect(screen.getByText('fine now')).toBeTruthy()
  })
})
