// ONE generator for "Save" and "share as a file", and it renders the layout the user chose
// (owner UAT 2026-09-28: the downloaded file did not match the sheet's layout; owner picks 29/09:
// review / clip / suggestion cards in sample #1's style, the plan image in sample #7's).

import { describe, it, expect, vi } from 'vitest'
import { renderShareCard, shareCardFileName, shareCardLayouts } from './shareCardFile'
import type { ShareArtifact, SharedPlace } from './shareArtifact'
import type { BrandedQrOptions } from '@/lib/qr/brandedCard'
import type { ContentCardCopy, SharePostCard } from './contentCards'
import type { PlanShareSnapshot } from '@/lib/plans/share/planShare'
import type { PlanBrochureStrings } from '@/lib/i18n/planBrochure'

const artifact: ShareArtifact = {
  kind: 'places', title: 'Phở Hòa', subject: 'Phở Hòa', text: 'https://www.tappyai.com/reviews/x', url: 'https://www.tappyai.com/reviews/x', places: [],
}
const places: SharedPlace[] = [{ name: 'Phở Hòa', rating: 4.5, links: [] }, { name: 'Phở Lệ', links: [] }]
const suggestion: ShareArtifact = { kind: 'places', title: 'Phở ngon Q3', subject: 'Phở ngon Q3', text: 'Phở ngon Q3\n1. Phở Hòa', url: 'https://www.tappyai.com', places }
const snapshot: PlanShareSnapshot = { v: 1, title: 'Quy Nhơn 3 ngày 2 đêm', people: 2, days: [{ label: 'Ngày 1', items: [{ name: 'Bãi Kỳ Co', time: '09:00' }] }] }
const plan: ShareArtifact = { kind: 'plan', title: snapshot.title, subject: snapshot.title, text: 'x', url: 'https://www.tappyai.com/plan/AbCdEfGhIjK1', places: [], plan: snapshot, planLink: true }
const review: SharePostCard = { kind: 'review', title: 'Phở Hòa', placeName: 'Phở Hòa', rating: 5, excerpt: 'Ngon', author: 'An' }

function renderers() {
  const png = (tag: string) => new Blob([tag], { type: 'image/png' })
  return {
    branded: vi.fn(async (_o: BrandedQrOptions): Promise<Blob | null> => png('branded')),
    artifact: vi.fn(async (_a: ShareArtifact): Promise<Blob | null> => png('artifact')),
    post: vi.fn(async (_c: SharePostCard, _u: string, _k: ContentCardCopy): Promise<Blob | null> => png('post')),
    suggestion: vi.fn(async (_s: string, _p: SharedPlace[], _u: string, _k: ContentCardCopy): Promise<Blob | null> => png('suggestion')),
    plan: vi.fn(async (_s: PlanShareSnapshot, _u: string, _k: PlanBrochureStrings): Promise<Blob | null> => png('plan')),
  }
}

describe('renderShareCard', () => {
  it.each(['profile', 'post'] as const)('%s layout → the approved TappyAI QR card, encoding the shared link', async (layout) => {
    const r = renderers()
    const file = await renderShareCard({ artifact, layout, displayName: 'Phở Hòa', copy: { caption: 'Quét mã', website: 'www.tappyai.com' } }, r)
    expect(r.branded).toHaveBeenCalledTimes(1)
    expect(r.artifact).not.toHaveBeenCalled()
    expect(r.branded.mock.calls[0][0]).toMatchObject({ text: artifact.url, displayName: 'Phở Hòa', caption: 'Quét mã', website: 'www.tappyai.com' })
    expect(file?.type).toBe('image/png')
    expect(file?.name).toContain(`tappyai-${layout}-`)
  })

  it('review / clip layouts → the post card with the shared link and the layout badge', async () => {
    const r = renderers()
    const copy = { caption: 'c', website: 'www.tappyai.com', badges: { review: 'Review', clip: 'Clip' }, scanTitle: 'Quét mã' }
    const f1 = await renderShareCard({ artifact, layout: 'review', post: review, copy }, r)
    expect(r.post.mock.calls[0][0]).toBe(review)
    expect(r.post.mock.calls[0][1]).toBe(artifact.url)
    expect(r.post.mock.calls[0][2]).toMatchObject({ badge: 'Review', scanTitle: 'Quét mã', website: 'www.tappyai.com' })
    expect(f1?.name).toMatch(/^tappyai-review-/)
    const f2 = await renderShareCard({ artifact, layout: 'clip', post: { ...review, kind: 'clip' }, copy }, r)
    expect(r.post.mock.calls[1][2].badge).toBe('Clip')
    expect(f2?.name).toMatch(/^tappyai-clip-/)
    expect(r.branded).not.toHaveBeenCalled()
  })

  it('review layout without post data → null (never a card with invented fields)', async () => {
    const r = renderers()
    expect(await renderShareCard({ artifact, layout: 'review' }, r)).toBeNull()
    expect(r.post).not.toHaveBeenCalled()
  })

  it('suggestion layout → the places of the artifact (whitelisted SharedPlace only)', async () => {
    const r = renderers()
    const file = await renderShareCard({ artifact: suggestion, layout: 'suggestion', copy: { caption: '', badges: { suggestion: 'Tappy gợi ý' } } }, r)
    expect(r.suggestion).toHaveBeenCalledWith('Phở ngon Q3', places, 'https://www.tappyai.com', expect.objectContaining({ badge: 'Tappy gợi ý' }))
    expect(file?.name).toMatch(/^tappyai-suggestion-/)
  })

  it('plan layout → the plan snapshot and the plan link', async () => {
    const r = renderers()
    const file = await renderShareCard({ artifact: plan, layout: 'plan' }, r)
    expect(r.plan.mock.calls[0][0]).toBe(snapshot)
    expect(r.plan.mock.calls[0][1]).toBe(plan.url)
    expect(file?.name).toMatch(/^tappyai-plan-/)
  })

  it('default layout → the brochure card drawn from the artifact', async () => {
    const r = renderers()
    const file = await renderShareCard({ artifact, layout: 'default' }, r)
    expect(r.artifact).toHaveBeenCalledWith(artifact)
    expect(r.branded).not.toHaveBeenCalled()
    expect(file?.name).toContain('tappyai-card-')
  })

  it('null when the renderer returns nothing or throws — never a broken file', async () => {
    const r = renderers()
    r.branded.mockResolvedValueOnce(null)
    expect(await renderShareCard({ artifact, layout: 'post' }, r)).toBeNull()
    r.artifact.mockRejectedValueOnce(new Error('tainted'))
    expect(await renderShareCard({ artifact, layout: 'default' }, r)).toBeNull()
    r.suggestion.mockRejectedValueOnce(new Error('tainted'))
    expect(await renderShareCard({ artifact: suggestion, layout: 'suggestion' }, r)).toBeNull()
  })

  it('file names are dated and name their layout', () => {
    const d = new Date('2026-09-28T10:00:00Z')
    expect(shareCardFileName('post', d)).toBe('tappyai-post-2026-09-28.png')
    expect(shareCardFileName('default', d)).toBe('tappyai-card-2026-09-28.png')
    expect(shareCardFileName('suggestion', d)).toBe('tappyai-suggestion-2026-09-28.png')
  })
})

describe('shareCardLayouts — what the selector offers (first = default)', () => {
  it('profile → the profile QR card only', () => {
    expect(shareCardLayouts({ variant: 'profile', artifact })).toEqual(['profile'])
  })
  it('an Explore post → its own card first (review or clip), the QR card second', () => {
    expect(shareCardLayouts({ variant: 'post', artifact, post: review })).toEqual(['review', 'post'])
    expect(shareCardLayouts({ variant: 'post', artifact, post: { ...review, kind: 'clip' } })).toEqual(['clip', 'post'])
    expect(shareCardLayouts({ variant: 'post', artifact })).toEqual(['post'])
  })
  it('a recommendation with places → the suggestion card; without places → the legacy card', () => {
    expect(shareCardLayouts({ variant: 'suggestion', artifact: suggestion })).toEqual(['suggestion'])
    expect(shareCardLayouts({ variant: 'default', artifact })).toEqual(['default'])
    expect(shareCardLayouts({ variant: 'default', artifact: suggestion })).toEqual(['default'])
  })
  it('a plan with a snapshot → the plan image (sheet or default)', () => {
    expect(shareCardLayouts({ variant: 'plan', artifact: plan })).toEqual(['plan'])
    expect(shareCardLayouts({ variant: 'default', artifact: plan })).toEqual(['plan'])
    expect(shareCardLayouts({ variant: 'plan', artifact: { ...plan, plan: { ...snapshot, days: [] } } })).toEqual(['default'])
  })
})
