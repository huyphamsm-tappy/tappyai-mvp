import { describe, it, expect } from 'vitest'
import { pickReviewImage } from './placeImage'

describe('pickReviewImage (BUG 8)', () => {
  it('prefers the first public https photo', () => {
    expect(pickReviewImage({ photos: ['http://x/a.jpg', 'https://storage.googleapis.com/b/p.jpg'], thumbnail: 'https://t/x.jpg' }))
      .toBe('https://storage.googleapis.com/b/p.jpg')
  })
  it('uses the clip thumbnail when photos is empty or missing (was a placeholder before)', () => {
    expect(pickReviewImage({ photos: [], thumbnail: 'https://i.ytimg.com/vi/1/hq.jpg' })).toBe('https://i.ytimg.com/vi/1/hq.jpg')
    expect(pickReviewImage({ photos: null, thumbnail_url: 'https://t/x.jpg' })).toBe('https://t/x.jpg')
  })
  it('skips the suspended Vercel Blob host and non-https values', () => {
    expect(pickReviewImage({ photos: ['https://abc.public.blob.vercel-storage.com/a.jpg', 42, 'data:x'], thumbnail: '' })).toBeNull()
  })
  it('returns null when the row truly has no image', () => {
    expect(pickReviewImage({})).toBeNull()
  })
})
