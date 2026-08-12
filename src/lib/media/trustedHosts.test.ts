// The client-supplied media URL allowlist. Part of the A–T matrix:
//   E/K  every URL already in the database keeps validating
//   G    a URL outside our storage is still refused, on both providers

import { describe, it, expect } from 'vitest'
import { isTrustedMediaUrl } from './trustedHosts'

const env = { GCS_MEDIA_BUCKET: 'tappyai-media-prod' } as unknown as NodeJS.ProcessEnv

describe('isTrustedMediaUrl', () => {
  it('accepts the Blob URLs already stored in the database', () => {
    expect(
      isTrustedMediaUrl(
        'https://y5ozy0i9wdb73mam.public.blob.vercel-storage.com/music/1784696004238.mp3',
        env
      )
    ).toBe(true)
  })

  it('accepts a URL in our Cloud Storage bucket', () => {
    expect(
      isTrustedMediaUrl(
        'https://storage.googleapis.com/tappyai-media-prod/music/u-1/abc.mp3',
        env
      )
    ).toBe(true)
  })

  // storage.googleapis.com serves every public bucket on Google Cloud, so the
  // host alone is not evidence the object is ours.
  it.each([
    ['https://storage.googleapis.com/someone-elses-bucket/track.mp3', 'another bucket'],
    ['https://storage.googleapis.com/tappyai-media-prod/', 'bucket root, no object'],
    ['https://storage.googleapis.com/tappyai-media-prod-evil/track.mp3', 'bucket-name prefix'],
    ['https://storage.googleapis.com.evil.test/tappyai-media-prod/x.mp3', 'suffix on the host'],
    ['https://evil.test/tappyai-media-prod/x.mp3', 'unrelated host'],
    ['http://storage.googleapis.com/tappyai-media-prod/x.mp3', 'plain http'],
    ['https://public.blob.vercel-storage.com.evil.test/x.mp3', 'blob host suffixed'],
    ['not a url', 'not a url'],
    ['', 'empty'],
  ])('rejects %s (%s)', (value) => {
    expect(isTrustedMediaUrl(value, env)).toBe(false)
  })

  it('follows the configured bucket name', () => {
    const other = { GCS_MEDIA_BUCKET: 'another-bucket' } as unknown as NodeJS.ProcessEnv
    expect(isTrustedMediaUrl('https://storage.googleapis.com/another-bucket/x.mp3', other)).toBe(true)
    expect(isTrustedMediaUrl('https://storage.googleapis.com/tappyai-media-prod/x.mp3', other)).toBe(false)
  })
})
