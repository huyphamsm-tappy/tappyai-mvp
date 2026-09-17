// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { setLocale } from '@/lib/i18n/useTranslation'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { MusicTrackCard } from './MusicTrackCard'
import { MusicTrackGrid } from './MusicTrackGrid'
import { MusicThumbnail } from './MusicThumbnail'
import type { MusicTrack } from '../types/track'

// ── Music Library · the tile ────────────────────────────────────────────────
//
// The Library page swapped `MusicTrackList` rows for these tiles. What must hold:
// one control per track that names its action, decorative parts hidden from
// assistive tech, and a square artwork footprint that does not depend on the
// picture arriving.

// These assertions read the EN catalogue, so the locale is STATED rather than inherited: the
// product default is Vietnamese (ADR-027, merged with feat/affiliate-cross-platform) and a test
// that wants English must say so — the same rule the admin suites already follow.
beforeEach(() => setLocale('en'))
afterEach(cleanup)

const track: MusicTrack = {
  id: 't1',
  title: 'Ambient Flight',
  artist: 'Zeropage',
  durationSec: 254,
  audioUrl: 'https://example.test/full.mp3',
  previewUrl: 'https://example.test/preview.mp3',
  coverUrl: null,
  categoryId: null,
  providerId: 'p1',
}

describe('one accessible control per track', () => {
  it('is a single button whose name says it previews THIS track', () => {
    const onToggle = vi.fn()
    const { container } = render(<MusicTrackCard track={track} isPreviewing={false} onTogglePreview={onToggle} />)
    const buttons = container.querySelectorAll('button')
    expect(buttons.length, 'no nested or sibling buttons — the tile is the control').toBe(1)
    const card = buttons[0]
    expect(card.getAttribute('aria-label')).toBe('Preview Ambient Flight')
    expect(card.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(card)
    expect(onToggle).toHaveBeenCalledWith(track)
  })

  it('flips its name and pressed state while previewing', () => {
    const { container } = render(<MusicTrackCard track={track} isPreviewing onTogglePreview={() => {}} />)
    const card = container.querySelector('button')!
    expect(card.getAttribute('aria-label')).toBe('Stop previewing Ambient Flight')
    expect(card.getAttribute('aria-pressed')).toBe('true')
    expect(card.hasAttribute('data-previewing')).toBe(true)
  })

  it('hides the play glyph and the scrim from assistive tech', () => {
    const { container } = render(<MusicTrackCard track={track} isPreviewing={false} onTogglePreview={() => {}} />)
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.getAttribute('aria-hidden') === 'true' || !!svg.closest('[aria-hidden="true"]')).toBe(true)
    }
  })

  it('shows title, artist and duration', () => {
    const { container } = render(<MusicTrackCard track={track} isPreviewing={false} onTogglePreview={() => {}} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Ambient Flight')
    expect(text).toContain('Zeropage')
    expect(text).toContain('4:14')
  })
})

describe('the artwork keeps its footprint', () => {
  it('reserves a square box before, without, or after the image', () => {
    const { container } = render(<MusicTrackCard track={track} isPreviewing={false} onTogglePreview={() => {}} />)
    const art = container.querySelector('.v3-music-card-art') as HTMLElement
    expect(art.style.aspectRatio).toBe('1 / 1')
    // No cover → the drawn fallback fills the same box rather than collapsing it.
    const fallback = art.querySelector('[aria-hidden="true"].absolute.inset-0')
    expect(fallback, 'fill-mode fallback occupies the whole square').toBeTruthy()
  })

  it('`fill` is opt-in — the picker rows keep their fixed-size thumbnail', () => {
    const { container } = render(<MusicThumbnail coverUrl={null} title="x" />)
    const box = container.firstElementChild as HTMLElement
    expect(box.style.width).toBe('40px')
    expect(box.className).not.toContain('inset-0')
  })
})

describe('the grid keeps the list contract', () => {
  const tracks = [track, { ...track, id: 't2', title: 'Second' }, { ...track, id: 't3', title: 'Third' }]

  it('renders every track as a tile, in order', () => {
    const { container } = render(
      <MusicTrackGrid tracks={tracks} loading={false} error={null} previewingTrackId={null} onTogglePreview={() => {}} />,
    )
    expect([...container.querySelectorAll('[data-music-track]')].map((e) => e.getAttribute('data-music-track'))).toEqual(['t1', 't2', 't3'])
  })

  it('`max` caps a rail and hides its load-more', () => {
    const { container } = render(
      <MusicTrackGrid tracks={tracks} loading={false} error={null} hasMore onLoadMore={() => {}} previewingTrackId={null} onTogglePreview={() => {}} max={2} />,
    )
    expect(container.querySelectorAll('[data-music-track]').length).toBe(2)
    expect(container.textContent).not.toContain('Load more')
  })

  it('offers load-more only when the page says there is more', () => {
    const onLoadMore = vi.fn()
    const { container, getByText } = render(
      <MusicTrackGrid tracks={tracks} loading={false} error={null} hasMore onLoadMore={onLoadMore} previewingTrackId={null} onTogglePreview={() => {}} />,
    )
    fireEvent.click(getByText('Load more'))
    expect(onLoadMore).toHaveBeenCalled()
    cleanup()
    const { container: c2 } = render(
      <MusicTrackGrid tracks={tracks} loading={false} error={null} hasMore={false} previewingTrackId={null} onTogglePreview={() => {}} />,
    )
    expect(c2.textContent).not.toContain('Load more')
    expect(container).toBeTruthy()
  })

  it('surfaces error and empty states instead of a blank area', () => {
    const { container: err } = render(
      <MusicTrackGrid tracks={[]} loading={false} error="boom" previewingTrackId={null} onTogglePreview={() => {}} />,
    )
    expect(err.textContent).toContain('boom')
    cleanup()
    const { container: empty } = render(
      <MusicTrackGrid tracks={[]} loading={false} error={null} previewingTrackId={null} onTogglePreview={() => {}} />,
    )
    expect(empty.textContent).toContain('No songs found')
  })

  it('steps its columns rather than forcing one row', () => {
    const { container } = render(
      <MusicTrackGrid tracks={tracks} loading={false} error={null} previewingTrackId={null} onTogglePreview={() => {}} />,
    )
    const cls = container.querySelector('.grid')!.className
    expect(cls).toContain('grid-cols-2')
    expect(cls).toMatch(/xl:grid-cols-6/)
  })
})
