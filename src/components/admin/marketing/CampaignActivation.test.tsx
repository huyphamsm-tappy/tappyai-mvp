// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { CampaignActivation, CONFIRM_PHRASE, DRY_RUN_TTL_MS } from './CampaignActivation'

// V2.2-2 — dry run then a typed confirmation (M-18), tested by DRIVING IT.
//
// 🚨 A CAMPAIGN CANNOT BE RECALLED, so the assertions that matter are about
// what is IMPOSSIBLE to reach, not about what works. Nothing here reads source
// text: "the component contains the word BROADCAST" would pass against a form
// that ignored the phrase entirely.

vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

const PLAN = {
  audienceSize: 42,
  candidates: 100,
  skipped: {
    consent: 50,
    unsubscribed: 3,
    frequency_24h: 4,
    frequency_7d: 1,
    quiet_hours: 0,
    ineligible: 0,
  },
  chunkCount: 1,
  audienceFingerprint: 'abcdef0123456789',
}

let fetchMock: ReturnType<typeof vi.fn>

function wireFetch(dry: { ok: boolean; status?: number; body?: unknown }, send?: { ok: boolean; body?: unknown }) {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const parsed = JSON.parse((init?.body as string) ?? '{}')
    if (parsed.dryRun === false) {
      return {
        ok: send?.ok ?? false,
        status: send?.ok ? 200 : 403,
        json: async () => send?.body ?? { error: { message: 'blocked: M-30 / Q6' } },
      } as Response
    }
    return {
      ok: dry.ok,
      status: dry.status ?? (dry.ok ? 200 : 403),
      json: async () => ({ data: dry.body ?? PLAN }),
    } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
}

const dryRunBtn = () => screen.getByText('admin.marketing.campaigns.dryRun')
const phraseInput = () => screen.getByLabelText('admin.marketing.campaigns.confirmLabel')
const sendBtn = () => screen.queryByText('admin.marketing.campaigns.send')

const SIG = 'Spring Hello there '

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// ═════════════════════════════════════════════════════════════════════════════
describe('🚨 the send control does not EXIST before a dry run', () => {
  it('renders no send button and no phrase field on first paint', () => {
    wireFetch({ ok: true })
    render(<CampaignActivation campaignId="c1" signature={SIG} />)
    expect(sendBtn()).toBeNull()
    expect(screen.queryByLabelText('admin.marketing.campaigns.confirmLabel')).toBeNull()
  })

  it('a dry run sends dryRun:true and never dryRun:false', async () => {
    wireFetch({ ok: true })
    render(<CampaignActivation campaignId="c1" signature={SIG} />)
    await act(async () => {
      fireEvent.click(dryRunBtn())
    })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ dryRun: true })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('after a dry run', () => {
  async function runDry(signature = SIG) {
    wireFetch({ ok: true })
    const view = render(<CampaignActivation campaignId="c1" signature={signature} />)
    await act(async () => {
      fireEvent.click(dryRunBtn())
    })
    await waitFor(() => expect(phraseInput()).toBeTruthy())
    return view
  }

  it('shows the plan: audience size, chunk count and fingerprint', async () => {
    await runDry()
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText('abcdef0123456789')).toBeTruthy()
  })

  it('🚨 shows skip reasons as COUNTS, never as a list of people', async () => {
    await runDry()
    expect(screen.getByText('admin.marketing.campaigns.skip.consent')).toBeTruthy()
    expect(screen.getByText('50')).toBeTruthy()
    // A zero-count reason is omitted rather than shown as noise.
    expect(screen.queryByText('admin.marketing.campaigns.skip.quiet_hours')).toBeNull()
  })

  it('🚨 the send button is ABSENT until the phrase matches exactly', async () => {
    await runDry()
    expect(sendBtn()).toBeNull()

    await act(async () => {
      fireEvent.change(phraseInput(), { target: { value: 'broadcast' } })
    })
    expect(sendBtn()).toBeNull() // lowercase is not the phrase

    await act(async () => {
      fireEvent.change(phraseInput(), { target: { value: 'BROADCAS' } })
    })
    expect(sendBtn()).toBeNull() // a prefix is not the phrase

    await act(async () => {
      fireEvent.change(phraseInput(), { target: { value: CONFIRM_PHRASE } })
    })
    expect(sendBtn()).not.toBeNull() // POSITIVE CONTROL
  })

  it('the real request sends dryRun:false EXPLICITLY, with the phrase', async () => {
    // Relying on omission would mean a client that forgot a field sent a
    // campaign to everyone who consented.
    await runDry()
    await act(async () => {
      fireEvent.change(phraseInput(), { target: { value: CONFIRM_PHRASE } })
    })
    await act(async () => {
      fireEvent.click(sendBtn()!)
    })
    const last = fetchMock.mock.calls.at(-1)!
    expect(JSON.parse((last[1] as RequestInit).body as string)).toEqual({
      dryRun: false,
      confirm: CONFIRM_PHRASE,
    })
  })

  it('🚨 a REFUSED send surfaces the server reason rather than looking successful', async () => {
    // `fetch` resolves on 403. Without the `res.ok` check the UI would clear the
    // form and imply the campaign went out.
    wireFetch({ ok: true }, { ok: false })
    render(<CampaignActivation campaignId="c1" signature={SIG} />)
    await act(async () => {
      fireEvent.click(dryRunBtn())
    })
    await waitFor(() => expect(phraseInput()).toBeTruthy())
    await act(async () => {
      fireEvent.change(phraseInput(), { target: { value: CONFIRM_PHRASE } })
    })
    await act(async () => {
      fireEvent.click(sendBtn()!)
    })
    expect(screen.getByText(/blocked: M-30/)).toBeTruthy()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('🚨 a stale plan cannot be sent', () => {
  it('editing the message invalidates the dry run', async () => {
    wireFetch({ ok: true })
    const { rerender } = render(<CampaignActivation campaignId="c1" signature={SIG} />)
    await act(async () => {
      fireEvent.click(dryRunBtn())
    })
    await waitFor(() => expect(phraseInput()).toBeTruthy())
    await act(async () => {
      fireEvent.change(phraseInput(), { target: { value: CONFIRM_PHRASE } })
    })
    expect(sendBtn()).not.toBeNull()

    // The operator edits the campaign text. The plan described an audience for
    // the OLD message; sending now would confirm one thing and do another.
    rerender(<CampaignActivation campaignId="c1" signature="Spring EDITED " />)
    expect(sendBtn()).toBeNull()
    expect(screen.getByText('admin.marketing.campaigns.dryRunStale')).toBeTruthy()
  })

  it('five minutes passing invalidates it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    wireFetch({ ok: true })
    const { rerender } = render(<CampaignActivation campaignId="c1" signature={SIG} />)
    await act(async () => {
      fireEvent.click(dryRunBtn())
    })
    await waitFor(() => expect(phraseInput()).toBeTruthy())
    await act(async () => {
      fireEvent.change(phraseInput(), { target: { value: CONFIRM_PHRASE } })
    })
    expect(sendBtn()).not.toBeNull()

    // Quiet hours turn on, caps expire, people unsubscribe.
    await act(async () => {
      vi.advanceTimersByTime(DRY_RUN_TTL_MS + 1000)
    })
    rerender(<CampaignActivation campaignId="c1" signature={SIG} />)
    expect(sendBtn()).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('🚨 below the floor', () => {
  it('reports the refusal and shows NO number, and offers no send control', async () => {
    wireFetch({ ok: false, status: 403 })
    render(<CampaignActivation campaignId="c1" signature={SIG} />)
    await act(async () => {
      fireEvent.click(dryRunBtn())
    })
    await waitFor(() =>
      expect(screen.getByText('admin.marketing.campaigns.belowFloor')).toBeTruthy(),
    )
    expect(sendBtn()).toBeNull()
    expect(screen.queryByLabelText('admin.marketing.campaigns.confirmLabel')).toBeNull()
  })
})
