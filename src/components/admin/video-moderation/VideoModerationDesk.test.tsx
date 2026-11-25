// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setLocale } from '@/lib/i18n/useTranslation'
import { VideoModerationDesk } from './VideoModerationDesk'

// Explore video VID-03: the review desk, rendered. Network is a stubbed fetch; nothing here touches a server.

const ID = '9a1b2c3d-5f49-4c58-9901-2d586e31352d'
const ID2 = '11111111-5f49-4c58-9901-2d586e31352d'
const ALL = { approve: true, approveSevere: true, reject: true }
const MOD = { approve: true, approveSevere: false, reject: true }

const item = (over: Record<string, unknown> = {}) => ({ assetId: ID, priority: 'high', severe: false, category: 'violence', confidence: 0.7, reasonCode: 'category_high', hasAudio: true, durationMs: 30000, waitingSince: '2026-11-05T10:00:00Z', ...over })
const detail = (over: Record<string, unknown> = {}) => ({
  asset: { id: ID, state: 'review_required', hasAudio: true, durationMs: 30000, updatedAt: '2026-11-05T10:00:00Z' },
  severe: false,
  results: [{ id: 1, kind: 'automated', decision: 'review_required', category: 'violence', confidence: 0.7, reasonCode: 'category_high', provider: 'openai', model: 'mod-x', policyVersion: 'vmod-1', evidence: { visual: { status: 'analysed', scores: { violence: 0.7 } }, overlay: { status: 'analysed', texts: ['BUY NOW'], scores: {} } }, transcript: 'xin chao the gioi', actor: 'service', note: null, createdAt: '2026-11-05T10:00:00Z' }],
  events: [{ id: 1, fromState: 'moderating', toState: 'review_required', eventType: 'moderation_review', actor: 'service', reason: null, createdAt: '2026-11-05T10:00:00Z' }],
  frameUrl: `/api/admin/video-moderation/${ID}/frame`,
  ...over,
})

type Reply = { status?: number; body?: unknown }
function stub(routes: Record<string, Reply | Reply[]>) {
  const calls: Array<{ url: string; method: string; body?: string }> = []
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body as string | undefined })
    const key = `${method} ${url}`
    const r = routes[key]
    const rep = Array.isArray(r) ? (r.length > 1 ? r.shift()! : r[0]) : r
    if (!rep) throw new Error(`no stub for ${key}`)
    const status = rep.status ?? 200
    return { ok: status >= 200 && status < 300, status, json: async () => rep.body } as Response
  })
  vi.stubGlobal('fetch', f)
  return calls
}
const L = '/api/admin/video-moderation'

beforeEach(() => setLocale('en'))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.removeItem('tappy_lang') })

async function openFirst(can = ALL) {
  const user = userEvent.setup()
  render(<VideoModerationDesk can={can} />)
  await user.click(await screen.findByRole('button', { name: 'Review' }))
  await screen.findByText('Video detail')
  return user
}

describe('list', () => {
  it('shows each video with priority, age and a clear child-safety mark', async () => {
    stub({ [`GET ${L}`]: { body: { data: [item({ assetId: ID2, priority: 'urgent', severe: true }), item()] } } })
    render(<VideoModerationDesk can={ALL} />)
    expect(await screen.findByText('Suspected child-safety case')).toBeTruthy()
    expect(screen.getByText('Urgent')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
    expect(screen.getAllByText(/Waiting \d+ h/).length).toBe(2)
    expect(screen.getByText(/the AI did not decide it/i)).toBeTruthy()
    // server order is kept: the urgent one first
    const lis = screen.getAllByRole('listitem')
    expect(lis[0].textContent).toContain('Suspected child-safety case')
  })
  it('empty state', async () => {
    stub({ [`GET ${L}`]: { body: { data: [] } } })
    render(<VideoModerationDesk can={ALL} />)
    expect(await screen.findByText('No video is waiting for review.')).toBeTruthy()
  })
  it('404 says the feature is off, 403 and 429 are told apart, a failure is not shown as empty', async () => {
    for (const [status, text] of [[404, 'Video review is not switched on.'], [403, 'You are not allowed to do this.'], [429, 'Too many requests. Try again in a few minutes.'], [500, /could not be read/]] as const) {
      stub({ [`GET ${L}`]: { status } })
      render(<VideoModerationDesk can={ALL} />)
      expect((await screen.findByRole('alert')).textContent).toMatch(text)
      expect(screen.queryByText('No video is waiting for review.')).toBeNull()
      cleanup()
    }
  })
})

describe('detail', () => {
  it('shows frames via the frame route only, scores, model, transcript, overlay text and history', async () => {
    stub({ [`GET ${L}`]: { body: { data: [item()] } }, [`GET ${L}/${ID}`]: { body: { data: detail() } } })
    await openFirst()
    const frames = screen.getAllByTestId('video-frame')
    expect(frames).toHaveLength(6)
    for (const f of frames) expect((f as HTMLElement).style.backgroundImage).toContain(`${L}/${ID}/frame`)
    expect(document.body.innerHTML).not.toMatch(/supabase|storage\/v1|bucket/i)
    expect(screen.getByText('violence: 0.70')).toBeTruthy()
    expect(screen.getByText(/mod-x/)).toBeTruthy()
    expect(screen.getByText(/vmod-1/)).toBeTruthy()
    expect(screen.getByText('xin chao the gioi')).toBeTruthy()
    expect(screen.getByText('BUY NOW')).toBeTruthy()
    expect(screen.getByText(/moderation_review: moderating/)).toBeTruthy()
  })
  it('a broken frame is announced', async () => {
    stub({ [`GET ${L}`]: { body: { data: [item()] } }, [`GET ${L}/${ID}`]: { body: { data: detail() } } })
    await openFirst()
    const probe = document.querySelector('img[aria-hidden="true"]') as HTMLImageElement
    probe.dispatchEvent(new Event('error'))
    expect((await screen.findByText(/frames could not be loaded/)).getAttribute('role')).toBe('alert')
  })
  it('detail 404 is reported', async () => {
    stub({ [`GET ${L}`]: { body: { data: [item()] } }, [`GET ${L}/${ID}`]: { status: 404 } })
    const user = userEvent.setup()
    render(<VideoModerationDesk can={ALL} />)
    await user.click(await screen.findByRole('button', { name: 'Review' }))
    expect((await screen.findByRole('alert')).textContent).toContain('not found')
  })
})

describe('decision flow', () => {
  it('requires a note: buttons stay disabled until one is written', async () => {
    stub({ [`GET ${L}`]: { body: { data: [item()] } }, [`GET ${L}/${ID}`]: { body: { data: detail() } } })
    const user = await openFirst()
    const approve = screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement
    const reject = screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement
    expect(approve.disabled).toBe(true)
    expect(reject.disabled).toBe(true)
    await user.type(screen.getByLabelText(/Note \(required/), 'ok')
    expect(approve.disabled).toBe(true)
    await user.type(screen.getByLabelText(/Note \(required/), ' looks fine')
    expect(approve.disabled).toBe(false)
    expect(reject.disabled).toBe(false)
  })

  it('posts the decision with the note and shows the SERVER state, not the expected one', async () => {
    const calls = stub({
      [`GET ${L}`]: [{ body: { data: [item()] } }, { body: { data: [] } }],
      [`GET ${L}/${ID}`]: [{ body: { data: detail() } }, { body: { data: detail({ asset: { ...detail().asset, state: 'published' } }) } }],
      [`POST ${L}/${ID}/decide`]: { body: { data: { assetId: ID, state: 'published', changed: true } } },
    })
    const user = await openFirst()
    await user.type(screen.getByLabelText(/Note \(required/), 'Checked all frames')
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Approved. Current state: published.')).toBeTruthy()
    const post = calls.find((c) => c.method === 'POST')!
    expect(JSON.parse(post.body!)).toEqual({ decision: 'approve', note: 'Checked all frames' })
    await waitFor(() => expect(screen.getByTestId('video-state').textContent).toBe('published'))
    expect(screen.getByText(/no longer waiting for review/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('an unchanged repeat is reported as already standing', async () => {
    stub({
      [`GET ${L}`]: { body: { data: [item()] } }, [`GET ${L}/${ID}`]: { body: { data: detail() } },
      [`POST ${L}/${ID}/decide`]: { body: { data: { assetId: ID, state: 'rejected', changed: false } } },
    })
    const user = await openFirst()
    await user.type(screen.getByLabelText(/Note \(required/), 'Clearly not allowed')
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    expect(await screen.findByText('This decision already stood. Current state: rejected.')).toBeTruthy()
  })

  it('409: says it was decided differently and reloads the true state', async () => {
    const calls = stub({
      [`GET ${L}`]: { body: { data: [item()] } },
      [`GET ${L}/${ID}`]: [{ body: { data: detail() } }, { body: { data: detail({ asset: { ...detail().asset, state: 'rejected' } }) } }],
      [`POST ${L}/${ID}/decide`]: { status: 409, body: { error: { code: 'CONFLICT' } } },
    })
    const user = await openFirst()
    await user.type(screen.getByLabelText(/Note \(required/), 'Fine by me')
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText(/decided differently/)).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('video-state').textContent).toBe('rejected'))
    expect(calls.filter((c) => c.url === `${L}/${ID}` && c.method === 'GET')).toHaveLength(2)
  })

  it.each([[403, 'You are not allowed to do this.'], [404, 'This video was not found.'], [429, 'Too many requests. Try again in a few minutes.'], [500, 'The decision could not be saved. Try again.']])('%i from the decide route is a readable message', async (status, text) => {
    stub({
      [`GET ${L}`]: { body: { data: [item()] } }, [`GET ${L}/${ID}`]: { body: { data: detail() } },
      [`POST ${L}/${ID}/decide`]: { status },
    })
    const user = await openFirst()
    await user.type(screen.getByLabelText(/Note \(required/), 'Reasonable note')
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    expect(await screen.findByText(text)).toBeTruthy()
  })
})

describe('permission denied', () => {
  it('without the approve permission the button is disabled and the reason is shown and linked', async () => {
    stub({ [`GET ${L}`]: { body: { data: [item()] } }, [`GET ${L}/${ID}`]: { body: { data: detail() } } })
    const user = await openFirst({ approve: false, approveSevere: false, reject: true })
    await user.type(screen.getByLabelText(/Note \(required/), 'A fine note')
    const approve = screen.getByRole('button', { name: 'Approve' })
    expect((approve as HTMLButtonElement).disabled).toBe(true)
    expect(approve.getAttribute('aria-describedby')).toBe('vm-why-approve')
    expect(screen.getByText('Your role may not approve videos.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('a moderator cannot approve a child-safety case but can reject it', async () => {
    stub({ [`GET ${L}`]: { body: { data: [item({ severe: true, priority: 'urgent' })] } }, [`GET ${L}/${ID}`]: { body: { data: detail({ severe: true }) } } })
    const user = await openFirst(MOD)
    await user.type(screen.getByLabelText(/Note \(required/), 'A fine note')
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/needs a permission your role does not have/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('without reject permission reject is disabled with a reason', async () => {
    stub({ [`GET ${L}`]: { body: { data: [item()] } }, [`GET ${L}/${ID}`]: { body: { data: detail() } } })
    const user = await openFirst({ approve: true, approveSevere: false, reject: false })
    await user.type(screen.getByLabelText(/Note \(required/), 'A fine note')
    expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Your role may not reject videos.')).toBeTruthy()
  })
})

describe('child-safety approval', () => {
  const setup = () => stub({
    [`GET ${L}`]: { body: { data: [item({ severe: true, priority: 'urgent' })] } }, [`GET ${L}/${ID}`]: { body: { data: detail({ severe: true }) } },
    [`POST ${L}/${ID}/decide`]: { body: { data: { assetId: ID, state: 'ready', changed: true } } },
  })
  it('asks for confirmation and sends nothing until confirmed; cancelling sends nothing', async () => {
    const calls = setup()
    const user = await openFirst()
    await user.type(screen.getByLabelText(/Note \(required/), 'Verified by two people')
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Go back' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Yes, approve' }))
    await screen.findByText(/Approved\. Current state/)
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  })
  it('rejecting a child-safety case needs no confirmation', async () => {
    const calls = setup()
    const user = await openFirst()
    await user.type(screen.getByLabelText(/Note \(required/), 'Reject right away')
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
  })
})
