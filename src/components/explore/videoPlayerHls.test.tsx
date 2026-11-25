// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, screen, fireEvent } from '@testing-library/react'
import VideoPlayer from './VideoPlayer'

// Explore video: the Explore player plays an HLS manifest through the playback endpoint, and leaves every old URL exactly as it was.
const OWNER = '11111111-1111-4111-8111-111111111111'
const ASSET = '22222222-2222-4222-8222-222222222222'
const MANIFEST = `https://media.example.com/vdel/${OWNER}/${ASSET}/manifest.m3u8`
const MP4 = 'https://storage.googleapis.com/tappyai-media-prod/videos/u/abc.mp4'

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('VideoPlayer with an HLS post', () => {
  it('🚨 an old MP4 post is unchanged: the <video> carries src=url and NO request is made to the playback endpoint', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { container } = render(<VideoPlayer url={MP4} sourceType="upload" active />)
    expect(container.querySelector('video')!.getAttribute('src')).toBe(MP4)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('an HLS post: the <video> has NO src of its own (the manifest would hit the CDN without its cookie) and the endpoint is asked first', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const { container } = render(<VideoPlayer url={MANIFEST} sourceType="upload" active />)
    expect(container.querySelector('video')!.getAttribute('src')).toBeNull()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/video/playback/${ASSET}`, expect.objectContaining({ method: 'POST', credentials: 'include' })))
  })

  it('a video the server will not show gets a clear message and no retry button (retrying a refusal is pointless)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    render(<VideoPlayer url={MANIFEST} sourceType="upload" active />)
    expect(await screen.findByTestId('video-playback-error')).toBeTruthy()
    expect(screen.getByText('Video này hiện không xem được.')).toBeTruthy()
    expect(screen.queryByText('Thử lại')).toBeNull()
  })

  it('a network failure offers "Thử lại", which asks again', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('offline') })
    vi.stubGlobal('fetch', fetchMock)
    render(<VideoPlayer url={MANIFEST} sourceType="upload" active />)
    const retry = await screen.findByText('Thử lại')
    fireEvent.click(retry)
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2))
  })
})
