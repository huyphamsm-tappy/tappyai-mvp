import { describe, it, expect } from 'vitest'
import { videoSourceBucket, getVideoSourceProvider } from './sourceStorage'

describe('videoSourceBucket', () => {
  it('has NO default: unset or blank means the feature has nowhere to write', () => {
    expect(videoSourceBucket({})).toBeNull()
    expect(videoSourceBucket({ GCS_VIDEO_SOURCE_BUCKET: '' })).toBeNull()
    expect(videoSourceBucket({ GCS_VIDEO_SOURCE_BUCKET: '   ' })).toBeNull()
  })

  it('returns a well-formed bucket name', () => {
    expect(videoSourceBucket({ GCS_VIDEO_SOURCE_BUCKET: 'tappyai-video-source' })).toBe('tappyai-video-source')
    expect(videoSourceBucket({ GCS_VIDEO_SOURCE_BUCKET: ' tappyai-video-source ' })).toBe('tappyai-video-source')
  })

  it('refuses a malformed name (no path, no uppercase, no scheme, too short)', () => {
    for (const bad of ['gs://bucket-name', 'has/slash', 'UPPER-case', 'ab', 'x'.repeat(64), '-leading-dash', 'sp ace']) {
      expect(videoSourceBucket({ GCS_VIDEO_SOURCE_BUCKET: bad }), bad).toBeNull()
    }
  })

  it('🚨 refuses the PUBLIC media bucket, by default name and by override', () => {
    expect(videoSourceBucket({ GCS_VIDEO_SOURCE_BUCKET: 'tappyai-media-prod' })).toBeNull()
    expect(videoSourceBucket({ GCS_VIDEO_SOURCE_BUCKET: 'custom-public', GCS_MEDIA_BUCKET: 'custom-public' })).toBeNull()
    expect(videoSourceBucket({ GCS_VIDEO_SOURCE_BUCKET: 'tappyai-video-source', GCS_MEDIA_BUCKET: 'custom-public' })).toBe('tappyai-video-source')
  })
})

describe('getVideoSourceProvider', () => {
  it('is null when the bucket is not configured', () => {
    expect(getVideoSourceProvider({}, null)).toBeNull()
  })

  it('binds a provider to the source bucket, not the public one', () => {
    const got = getVideoSourceProvider({ GCS_VIDEO_SOURCE_BUCKET: 'tappyai-video-source' }, null)
    expect(got?.bucket).toBe('tappyai-video-source')
    expect(got?.provider.id).toBe('gcs')
    expect(got?.provider.publicUrl('vsrc/a/b.mp4')).toContain('/tappyai-video-source/')
    expect(got?.provider.publicUrl('vsrc/a/b.mp4')).not.toContain('tappyai-media-prod')
  })
})
