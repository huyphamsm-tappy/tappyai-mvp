// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }) }))

import AskTappyButton from './AskTappyButton'

// P4-12 — the discovery/tool → Chat loop (DD-004).
//
// Discovery and the tools used to dead-end: a user who found a place in Explore or finished a
// split-bill had to retype it to ask about it. These tests pin the two things that make the bridge
// safe — it reuses the existing chat route (no new backend contract), and it carries a REFERENCE
// rather than deciding what the user wants.

afterEach(() => { push.mockClear(); cleanup() })

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('AskTappyButton', () => {
  it('navigates to the existing chat route rather than a new endpoint', () => {
    render(<AskTappyButton subject="Nhà hàng A" />)
    fireEvent.click(screen.getByTestId('ask-tappy'))
    expect(push).toHaveBeenCalledOnce()
    expect(push.mock.calls[0][0]).toMatch(/^\/chat\?q=/)
  })

  it('carries the subject into the prompt', () => {
    render(<AskTappyButton subject="Nhà hàng A" />)
    fireEvent.click(screen.getByTestId('ask-tappy'))
    expect(decodeURIComponent(push.mock.calls[0][0])).toContain('Nhà hàng A')
  })

  it('passes a category when one is supplied, so the turn opens in context', () => {
    render(<AskTappyButton subject="Deal X" category="shopping" />)
    fireEvent.click(screen.getByTestId('ask-tappy'))
    expect(push.mock.calls[0][0]).toContain('category=shopping')
  })

  it('asks about the subject — it does not decide what the user wants', () => {
    render(<AskTappyButton subject="Nhà hàng A" />)
    fireEvent.click(screen.getByTestId('ask-tappy'))
    const prompt = decodeURIComponent(push.mock.calls[0][0])
    // The message appears as if the USER typed it, so it must not commit them to an intent.
    for (const forbidden of ['đặt bàn', 'book this', 'buy', 'mua ngay', 'should I']) {
      expect(prompt.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })

  it('does not trigger the card it sits inside', () => {
    const cardClick = vi.fn()
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
      <div onClick={cardClick}>
        <AskTappyButton subject="X" />
      </div>,
    )
    fireEvent.click(screen.getByTestId('ask-tappy'))
    expect(cardClick, 'the bridge must not race the card own navigation').not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledOnce()
  })

  it('meets the touch-target minimum and names itself', () => {
    render(<AskTappyButton subject="X" />)
    const btn = screen.getByTestId('ask-tappy')
    expect(btn.className).toContain('min-h-[44px]')
    expect(btn.getAttribute('aria-label')).toBeTruthy()
  })
})

describe('the bridge is present on the surfaces that used to dead-end', () => {
  it('Deals offers it on a deal', () => {
    const src = read('src/app/deals/DealsView.tsx')
    expect(src).toContain('AskTappyButton')
    expect(src).toContain('subject={deal.title}')
  })

  it('a tool result offers it once there is a result to carry', () => {
    const src = read('src/app/split-bill/page.tsx')
    expect(src).toContain('AskTappyButton')
    // Only when a real number exists — an empty form has nothing to talk about.
    expect(src).toContain('totalNum > 0 && (')
  })

  it('Explore carries the place instead of opening an empty chat', () => {
    const src = read('src/app/reviews/[id]/ReviewDetailView.tsx')
    // The CTA existed; what it lacked was context.
    expect(src).toContain("bridge.promptEntity")
    expect(src).toContain('review.place_name')
    expect(src, 'a bare /chat href is the dead-end this fixes').not.toContain('href="/chat"')
  })
})
