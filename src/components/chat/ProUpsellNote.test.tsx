// @vitest-environment jsdom
// 17/11/2026 (owner): a note under every Free answer says the Pro plan answers smarter and with more accurate data - only when the plans are on sale.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

const flag = vi.hoisted(() => ({ subscriptions: true }))
vi.mock('@/lib/subscription/useSubscriptionsFlag', () => ({ useSubscriptionsFlag: () => ({ subscriptions: flag.subscriptions }) }))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi' }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))

import { ProUpsellNote, __resetProUpsellNote } from './ProUpsellNote'

const answer = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))

beforeEach(() => { __resetProUpsellNote(); flag.subscriptions = true })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ProUpsellNote', () => {
  it('Free plan with the plans on sale: the note and its link to the plans page', async () => {
    answer({ plan: 'free', isAnonymous: true })
    render(<ProUpsellNote />)
    const note = await screen.findByTestId('pro-upsell-note')
    expect(note.textContent).toContain('pres.proNote')
    expect(note.querySelector('a')?.getAttribute('href')).toBe('/subscription')
  })

  it('a paid plan: nothing', async () => {
    answer({ plan: 'promax3m', isPro: true })
    render(<ProUpsellNote />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('pro-upsell-note')).toBeNull()
  })

  it('plans not on sale: nothing, even on Free (there is no Pro to buy and Free has every tool)', async () => {
    flag.subscriptions = false
    answer({ plan: 'free' })
    render(<ProUpsellNote />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('pro-upsell-note')).toBeNull()
  })

  it('the plan could not be read: nothing (an offer is never shown on a guess)', async () => {
    answer(null, false)
    render(<ProUpsellNote />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('pro-upsell-note')).toBeNull()
  })

  it('many answers on one page read the plan once', async () => {
    answer({ plan: 'free' })
    render(<><ProUpsellNote /><ProUpsellNote /><ProUpsellNote /></>)
    expect(await screen.findAllByTestId('pro-upsell-note')).toHaveLength(3)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
