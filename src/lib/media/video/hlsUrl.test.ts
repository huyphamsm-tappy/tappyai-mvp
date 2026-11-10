import { describe, it, expect } from 'vitest'
import { isHlsUrl, videoAssetIdFromManifestUrl } from './hlsUrl'

const OWNER = '11111111-1111-4111-8111-111111111111'
const ASSET = '22222222-2222-4222-8222-222222222222'

describe('isHlsUrl', () => {
  it('is true for a .m3u8 path (query and fragment ignored), false for everything old posts use', () => {
    expect(isHlsUrl(`https://media.example.com/vdel/${OWNER}/${ASSET}/manifest.m3u8`)).toBe(true)
    expect(isHlsUrl('https://x.example/a.m3u8?x=1')).toBe(true)
    expect(isHlsUrl('https://storage.googleapis.com/tappyai-media-prod/videos/u/abc.mp4')).toBe(false)
    expect(isHlsUrl('https://www.youtube.com/watch?v=abc')).toBe(false)
    expect(isHlsUrl('https://x.example/clip.mp4?name=a.m3u8')).toBe(false)
    expect(isHlsUrl('')).toBe(false)
    expect(isHlsUrl(undefined)).toBe(false)
  })
})

describe('videoAssetIdFromManifestUrl', () => {
  it('reads the asset id from the delivery path of a post\'s media_url', () => {
    expect(videoAssetIdFromManifestUrl(`https://media.example.com/vdel/${OWNER}/${ASSET}/manifest.m3u8`)).toBe(ASSET)
  })
  it('is null for anything that is not exactly a delivery manifest (so the player never asks about a random URL)', () => {
    for (const u of [
      `https://media.example.com/vdel/${OWNER}/${ASSET}/hls720.m3u8`,
      `https://media.example.com/vsrc/${OWNER}/${ASSET}/manifest.m3u8`,
      `https://media.example.com/vdel/${OWNER}/manifest.m3u8`,
      `http://media.example.com/vdel/${OWNER}/${ASSET}/manifest.m3u8`,
      `https://media.example.com/x/vdel/${OWNER}/${ASSET}/manifest.m3u8`,
      'https://storage.googleapis.com/tappyai-media-prod/videos/u/abc.mp4', '', 'not a url',
    ]) expect(videoAssetIdFromManifestUrl(u), u).toBeNull()
  })
})
