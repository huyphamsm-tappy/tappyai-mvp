// @vitest-environment jsdom
//
// The branded preview is rendered FROM the artifact — the user sees what
// leaves. It can therefore only ever show whitelisted fields, and it must show
// the brand (official logo asset + BRAND.name) and the full text on demand.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { PlacesLiveView } from '@/lib/recommendation/liveView'
import fixture from '@/lib/share/__fixtures__/placesLiveView.food.json'
import { buildPlacesArtifact } from '@/lib/share/shareArtifact'
import { BRAND } from '@/lib/share/openGraph'
import SharePreview from './SharePreview'

vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, string>) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
    locale: 'vi',
  }),
}))

afterEach(cleanup)

const env = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv
const view = fixture as unknown as PlacesLiveView
const artifact = buildPlacesArtifact(view, 'Quán bún bò ngon ở TP.HCM', 'vi', env)

describe('SharePreview', () => {
  it('shows the official brand mark and name, and the subject', () => {
    const { container } = render(<SharePreview artifact={artifact} />)
    const logo = container.querySelector('img[src="/logo.svg"]')
    expect(logo).not.toBeNull()
    expect(screen.getByText(BRAND.name)).toBeTruthy()
    expect(screen.getByText('TappyAI gợi ý: Quán bún bò ngon ở TP.HCM')).toBeTruthy()
  })

  it('previews three places and says how many more there are', () => {
    render(<SharePreview artifact={artifact} />)
    const rows = screen.getAllByTestId('share-preview-place')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain(`1. ${view.items[0].name}`)
    expect(rows[0].textContent).toContain(String(view.items[0].rating))
    expect(screen.getByText('share.morePlaces:{"n":"5"}')).toBeTruthy()
  })

  it('reveals the full brochure text — the exact artifact text', () => {
    render(<SharePreview artifact={artifact} />)
    expect(screen.queryByTestId('share-preview-text')).toBeNull()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByTestId('share-preview-text').textContent).toBe(artifact.text)
  })

  it('renders nothing internal, even in the DOM', () => {
    const { container } = render(<SharePreview artifact={artifact} />)
    fireEvent.click(screen.getByRole('button'))
    const html = container.innerHTML
    for (const forbidden of ['place:osm:', 'distanceKm', 'provenance', 'matchVerdict', 'priceSignal', 'shortlistPosition']) {
      expect(html).not.toContain(forbidden)
    }
  })

  it('for a plan shows subject and text without place rows', () => {
    const plan = { ...artifact, kind: 'plan' as const, places: [], subject: 'Kế hoạch từ TappyAI: 1 ngày', text: 'Kế hoạch từ TappyAI: 1 ngày\n\nNgày 1\n  08:00 ☕ Cà phê\n\nGợi ý bởi TappyAI · www.tappyai.com' }
    render(<SharePreview artifact={plan} />)
    expect(screen.queryAllByTestId('share-preview-place')).toHaveLength(0)
    expect(screen.getByText('Kế hoạch từ TappyAI: 1 ngày')).toBeTruthy()
  })
})
