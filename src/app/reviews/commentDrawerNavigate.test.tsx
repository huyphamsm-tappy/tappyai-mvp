// @vitest-environment jsdom
// BUG 11 — with the comment sheet open, the full-screen backdrop sat above the clip stage and
// swallowed every swipe / wheel gesture, so the user could not reach another clip. The backdrop now
// forwards swipes + wheel to the host (`onNavigate`) while a plain tap still closes the sheet, and
// the drawer is keyed by review id so a switch never shows the previous clip's comments.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { useState } from 'react'

vi.mock('next/link', () => ({ default: (p: any) => <a href={typeof p.href === 'string' ? p.href : '#'}>{p.children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }))
vi.mock('@/lib/tracking/tracker', () => ({ track: vi.fn() }))

import { CommentDrawer, type Review } from './feedShared'

const rev = (id: string) => ({ id, comment_count: 0 }) as unknown as Review

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => ({ comments: [{ id: 'c-' + String(url).split('/')[3], body: 'comment of ' + String(url).split('/')[3], user_id: 'u', created_at: new Date().toISOString(), profiles: { full_name: 'X' } }], count: 1 }),
  })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const backdrop = (c: HTMLElement) => c.querySelector('[data-comment-backdrop]') as HTMLElement

describe('CommentDrawer backdrop forwards navigation (BUG 11)', () => {
  it('a vertical swipe up / down calls onNavigate(1) / (-1) and does not close', () => {
    const onNavigate = vi.fn(); const onClose = vi.fn()
    const { container } = render(<CommentDrawer review={rev('a')} me={null} onClose={onClose} onAdded={vi.fn()} onNavigate={onNavigate} />)
    const b = backdrop(container)
    fireEvent.pointerDown(b, { pointerId: 1, clientX: 100, clientY: 400 })
    fireEvent.pointerUp(b, { pointerId: 1, clientX: 102, clientY: 300 })
    fireEvent.click(b)
    expect(onNavigate).toHaveBeenLastCalledWith(1)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(b, { pointerId: 2, clientX: 100, clientY: 300 })
    fireEvent.pointerUp(b, { pointerId: 2, clientX: 100, clientY: 420 })
    expect(onNavigate).toHaveBeenLastCalledWith(-1)
  })

  it('a horizontal swipe (stage orientation) navigates too; a tap still closes', async () => {
    const onNavigate = vi.fn(); const onClose = vi.fn()
    const { container } = render(<CommentDrawer review={rev('a')} me={null} onClose={onClose} onAdded={vi.fn()} onNavigate={onNavigate} />)
    const b = backdrop(container)
    fireEvent.pointerDown(b, { pointerId: 1, clientX: 300, clientY: 100 })
    fireEvent.pointerUp(b, { pointerId: 1, clientX: 200, clientY: 100 })
    expect(onNavigate).toHaveBeenLastCalledWith(1)
    onNavigate.mockClear()
    await new Promise(r => setTimeout(r, 5)) // the post-swipe click guard resets on the next task
    fireEvent.pointerDown(b, { pointerId: 3, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(b, { pointerId: 3, clientX: 12, clientY: 11 })
    fireEvent.click(b)
    expect(onNavigate).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('the wheel navigates once per burst', () => {
    const onNavigate = vi.fn()
    const { container } = render(<CommentDrawer review={rev('a')} me={null} onClose={vi.fn()} onAdded={vi.fn()} onNavigate={onNavigate} />)
    const b = backdrop(container)
    fireEvent.wheel(b, { deltaY: 120 }); fireEvent.wheel(b, { deltaY: 120 })
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenCalledWith(1)
  })

  it('without onNavigate the backdrop is unchanged (tap closes, no touch-action override)', () => {
    const onClose = vi.fn()
    const { container } = render(<CommentDrawer review={rev('a')} me={null} onClose={onClose} onAdded={vi.fn()} />)
    fireEvent.click(backdrop(container))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(backdrop(container).style.touchAction).toBe('')
  })

  it('keyed by review id: switching clips shows the NEW clip comments only', async () => {
    function Host() {
      const [id, setId] = useState('a')
      return (<>
        <button data-next onClick={() => setId('b')} />
        <CommentDrawer key={id} review={rev(id)} me={null} onClose={vi.fn()} onAdded={vi.fn()} onNavigate={vi.fn()} />
      </>)
    }
    const { container } = render(<Host />)
    await waitFor(() => expect(container.textContent).toContain('comment of a'))
    fireEvent.click(container.querySelector('[data-next]')!)
    await waitFor(() => expect(container.textContent).toContain('comment of b'))
    expect(container.textContent).not.toContain('comment of a')
  })
})
