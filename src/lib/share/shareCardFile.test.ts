// ONE generator for "Save" and "share as a file", and it renders the layout the user chose
// (owner UAT 2026-09-28: the downloaded file did not match the sheet's layout).

import { describe, it, expect, vi } from 'vitest'
import { renderShareCard, shareCardFileName } from './shareCardFile'
import type { ShareArtifact } from './shareArtifact'
import type { BrandedQrOptions } from '@/lib/qr/brandedCard'

const artifact: ShareArtifact = {
  kind: 'places', title: 'Phở Hòa', subject: 'Phở Hòa', text: 'https://www.tappyai.com/reviews/x', url: 'https://www.tappyai.com/reviews/x', places: [],
}

function renderers() {
  return {
    branded: vi.fn(async (_o: BrandedQrOptions): Promise<Blob | null> => new Blob(['branded'], { type: 'image/png' })),
    artifact: vi.fn(async (_a: ShareArtifact): Promise<Blob | null> => new Blob(['artifact'], { type: 'image/png' })),
  }
}

describe('renderShareCard', () => {
  it.each(['profile', 'post'] as const)('%s layout → the approved TappyAI card, encoding the shared link', async (layout) => {
    const r = renderers()
    const file = await renderShareCard({ artifact, layout, displayName: 'Phở Hòa', copy: { caption: 'Quét mã', website: 'www.tappyai.com' } }, r)
    expect(r.branded).toHaveBeenCalledTimes(1)
    expect(r.artifact).not.toHaveBeenCalled()
    expect(r.branded.mock.calls[0][0]).toMatchObject({ text: artifact.url, displayName: 'Phở Hòa', caption: 'Quét mã', website: 'www.tappyai.com' })
    expect(file?.type).toBe('image/png')
    expect(file?.name).toContain(`tappyai-${layout}-`)
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
  })

  it('file names are dated and name their layout', () => {
    const d = new Date('2026-09-28T10:00:00Z')
    expect(shareCardFileName('post', d)).toBe('tappyai-post-2026-09-28.png')
    expect(shareCardFileName('default', d)).toBe('tappyai-card-2026-09-28.png')
  })
})
