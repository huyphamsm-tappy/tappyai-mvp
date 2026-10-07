// @vitest-environment jsdom
// Owner SL1 (29/09): the CHAT plan card opens the approved sheet (#6) with the plan image, and the
// plan-link states (pending / sign-in / failed + Retry) live INSIDE that sheet — one sheet, not two.
//
// The sheet mints the link exactly as the legacy sheet does (same endpoint contract, mocked at
// fetch); the image waits for the link so the card prints the url that actually leaves.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { buildPlanArtifact } from '@/lib/share/shareArtifact'
import type { TappyPlan } from '@/components/TripPlanCard'

const renderShareCard = vi.fn(async (_input: { layout: string; artifact: { url: string } }) => null as File | null)
vi.mock('@/lib/share/shareCardFile', async (orig) => {
  const real = await orig<typeof import('@/lib/share/shareCardFile')>()
  return { ...real, renderShareCard: (input: { layout: string; artifact: { url: string } }) => renderShareCard(input) }
})
vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, string>) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
    locale: 'vi',
  }),
}))
vi.mock('@/components/messaging/NewMessageSheet', () => ({ default: () => null }))

import ShareMenu from './ShareMenu'

const ID = 'AbCdEfGhIjK1'
const PLAN_URL = `https://www.tappyai.com/plan/${ID}`
const plan: TappyPlan = {
  type: 'trip', title: 'Quy Nhơn 3 ngày 2 đêm', people: 2,
  days: [{ label: 'Ngày 1', items: [{ time: '09:00', emoji: '🏖️', category: 'entertainment', name: 'Bãi Kỳ Co' }] }],
}
const env = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv
const artifact = buildPlanArtifact(plan, 'vi', env)

let fetchMock: ReturnType<typeof vi.fn>
let open: ReturnType<typeof vi.fn>
beforeEach(() => {
  renderShareCard.mockClear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  open = vi.fn(() => ({}) as Window)
  vi.stubGlobal('open', open)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => undefined) }, configurable: true })
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tappyai.com')
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const sheet = () => render(<ShareMenu artifact={artifact} variant="plan" profileName={plan.title} open onClose={() => {}} />)

describe('the chat plan in the approved sheet (#6)', () => {
  it('is the sheet, with the plan image picker', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const { container } = sheet()
    expect(container.ownerDocument.querySelector('[data-share-variant="plan"]')).toBeTruthy()
    expect(container.ownerDocument.querySelector('[data-share-card-picker]')!.getAttribute('data-layout')).toBe('plan')
    expect(screen.getByText('share.profile.title')).toBeTruthy()
  })

  it('pending: the sheet says so, every target waits, and the image is not drawn with the brand url', async () => {
    let resolve!: (v: unknown) => void
    fetchMock.mockReturnValue(new Promise(r => { resolve = r }))
    sheet()
    const line = screen.getByText('Đang tạo liên kết kế hoạch…')
    expect(line.getAttribute('data-plan-link')).toBe('pending')
    expect((screen.getByTestId('share-target-copy') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('share-target-save') as HTMLButtonElement).disabled).toBe(true)
    expect(renderShareCard).not.toHaveBeenCalled()
    await act(async () => { resolve({ ok: true, status: 200, json: async () => ({ id: ID }) }) })
    await waitFor(() => expect(renderShareCard).toHaveBeenCalledTimes(1))
    expect(renderShareCard.mock.calls[0][0].layout).toBe('plan')
    expect(renderShareCard.mock.calls[0][0].artifact.url).toBe(PLAN_URL)
    expect(screen.queryByText('Đang tạo liên kết kế hoạch…')).toBeNull()
    expect(screen.getByText(PLAN_URL)).toBeTruthy()
  })

  it('signed out / guest: the reason is in the sheet and the url-only tiles refuse the brand root', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    sheet()
    await waitFor(() => expect(screen.getByText('Đăng nhập để tạo liên kết kế hoạch — hiện tại chia sẻ bằng văn bản')).toBeTruthy())
    for (const id of ['facebook', 'zalo', 'tiktok']) {
      const tile = screen.getByTestId(`share-target-${id}`) as HTMLButtonElement
      expect(tile.disabled).toBe(true)
      expect(tile.getAttribute('data-needs-link')).toBe('true')
      expect(tile.title).toBe('Cần có liên kết kế hoạch để chia sẻ lên đây')
    }
    // The image is still offered (with the brand url) once the link is settled as unavailable.
    await waitFor(() => expect(renderShareCard).toHaveBeenCalledTimes(1))
    expect(open).not.toHaveBeenCalled()
  })

  it('failed: said plainly with Retry inside the sheet; Retry mints and the tiles open up', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    sheet()
    await waitFor(() => expect(screen.getByText('Chưa tạo được liên kết kế hoạch — hiện tại chia sẻ bằng văn bản')).toBeTruthy())
    expect((screen.getByTestId('share-target-facebook') as HTMLButtonElement).disabled).toBe(true)
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: ID }) })
    await act(async () => { fireEvent.click(screen.getByTestId('share-plan-retry')) })
    await waitFor(() => expect(screen.getByText(PLAN_URL)).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId('share-plan-retry')).toBeNull()
    expect((screen.getByTestId('share-target-facebook') as HTMLButtonElement).disabled).toBe(false)
  })
})
