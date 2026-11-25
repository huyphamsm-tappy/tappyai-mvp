import { describe, it, expect } from 'vitest'
import { getVideoDeliveryProvider, videoDeliveryBucket } from './deliveryStorage'

describe('videoDeliveryBucket', () => {
  const env = { GCS_VIDEO_DELIVERY_BUCKET: 'tappy-video-delivery', GCS_VIDEO_SOURCE_BUCKET: 'tappy-video-source' }

  it('has NO default: unset, empty or malformed means not configured', () => {
    expect(videoDeliveryBucket({})).toBeNull()
    expect(videoDeliveryBucket({ GCS_VIDEO_DELIVERY_BUCKET: '  ' })).toBeNull()
    expect(videoDeliveryBucket({ GCS_VIDEO_DELIVERY_BUCKET: 'Bad Bucket' })).toBeNull()
    expect(videoDeliveryBucket({ GCS_VIDEO_DELIVERY_BUCKET: 'a/b' })).toBeNull()
    expect(videoDeliveryBucket(env)).toBe('tappy-video-delivery')
  })

  it('🚨 never the public media bucket (default or configured) and never the source bucket', () => {
    expect(videoDeliveryBucket({ GCS_VIDEO_DELIVERY_BUCKET: 'tappyai-media-prod' })).toBeNull()
    expect(videoDeliveryBucket({ GCS_VIDEO_DELIVERY_BUCKET: 'my-public', GCS_MEDIA_BUCKET: 'my-public' })).toBeNull()
    expect(videoDeliveryBucket({ ...env, GCS_VIDEO_DELIVERY_BUCKET: 'tappy-video-source' })).toBeNull()
  })

  it('a provider is only built for a configured bucket', () => {
    expect(getVideoDeliveryProvider({})).toBeNull()
    const target = getVideoDeliveryProvider(env)
    expect(target?.bucket).toBe('tappy-video-delivery')
    expect(typeof target?.provider.copyObject).toBe('function')
  })
})
