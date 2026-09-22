// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { MusicThumbnail } from './MusicThumbnail'
import { isServableMediaUrl } from '@/lib/media/servableMedia'

// ── Music Library · broken thumbnails ───────────────────────────────────────
//
// 🚨 THE BUG, AS MEASURED AGAINST PRODUCTION DATA. Every "Âm thanh gốc" track is
// auto-registered when a video review is posted, taking that review's poster as
// its cover. Posters written before the storage move live on Vercel Blob and
// those objects are GONE — the one GCS cover answered 200 and every
// `*.public.blob.vercel-storage.com` cover answered 404. That host is in
// `next.config` `remotePatterns`, so the optimizer tried, failed, and the
// browser rendered the ALT TEXT: the words "Âm thanh gốc" in a torn-paper icon,
// on every row but the first.
//
// The fix is in two halves and both are pinned here: the dead URLs are filtered
// where tracks are read, and a cover that fails for any OTHER reason lands on a
// drawn fallback rather than the browser's default.

afterEach(cleanup)

const disc = (c: HTMLElement) => c.querySelector('svg.lucide-music-2, svg.lucide-music2')

describe('the fallback is drawn, never the browser’s broken image', () => {
  it('renders the disc icon when a track has no cover', () => {
    const { container } = render(<MusicThumbnail coverUrl={null} title="Âm thanh gốc" />)
    expect(container.querySelector('img')).toBeNull()
    expect(disc(container)).toBeTruthy()
  })

  it('renders the disc icon when a real cover FAILS to load', () => {
    // 🚨 This is the half that stops alt text becoming the visual fallback. The
    // component had no `onError` at all, so a 404 cover rendered as its own alt
    // string — which is what a screen reader is for, not what a person sees.
    const { container } = render(
      <MusicThumbnail coverUrl="https://example.invalid/gone.jpg" title="Âm thanh gốc" />,
    )
    const img = container.querySelector('img')!
    expect(img).toBeTruthy()

    fireEvent.error(img)

    expect(container.querySelector('img'), 'the dead image is removed, not hidden').toBeNull()
    expect(disc(container)).toBeTruthy()
    expect(container.textContent, 'the title must not become the picture').not.toContain('Âm thanh gốc')
  })

  it('renders the image when the cover is good', () => {
    const { container } = render(
      <MusicThumbnail coverUrl="https://storage.googleapis.com/b/thumbnails/x.jpg" title="So High" />,
    )
    expect(container.querySelector('img')).toBeTruthy()
    expect(disc(container)).toBeNull()
  })
})

describe('dead cover URLs are filtered where tracks are read', () => {
  const repo = readFileSync('src/modules/music/repository/musicRepository.ts', 'utf8')

  it('the track mapper runs cover_url through the servable-media check', () => {
    // 🔑 One place, not one per route: browse, search and by-id all map here.
    // The reviews routes have applied this rule for a long time — the music
    // routes were the ones that never did.
    expect(repo).toContain('isServableMediaUrl(row.cover_url)')
  })

  it('the check itself rejects the retired host and keeps the live one', () => {
    expect(isServableMediaUrl('https://y5ozy0i9wdb73mam.public.blob.vercel-storage.com/thumbnails/1.jpg')).toBe(false)
    expect(isServableMediaUrl('https://storage.googleapis.com/tappyai-media-prod/thumbnails/1.jpg')).toBe(true)
    // Jamendo cover art for the CC-BY catalogue is untouched.
    expect(isServableMediaUrl('https://usercontent.jamendo.com/cover.jpg')).toBe(true)
    expect(isServableMediaUrl(null)).toBe(true)
  })

  it('leaves audio alone — a silent track is a different bug from a blank tile', () => {
    // Scope, stated: the reported defect is the thumbnail. Nulling `audio_url`
    // here would remove tracks from the library rather than fix their artwork.
    expect(repo).not.toContain('isServableMediaUrl(row.audio_url)')
  })
})
