import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SHARE_TARGET_PATH, buildShareTargetPrompt, shareTargetDestination } from './shareTarget'

describe('Web Share Target', () => {
  it('the manifest declares a GET share_target pointing at the landing page', () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'public', 'manifest.json'), 'utf8'))
    expect(manifest.share_target).toEqual({
      action: SHARE_TARGET_PATH, method: 'GET', enctype: 'application/x-www-form-urlencoded',
      params: { title: 'title', text: 'text', url: 'url' },
    })
  })
  it('a shared URL becomes a question about the link', () => {
    expect(buildShareTargetPrompt({ url: 'https://shopee.vn/x', title: 'Áo thun' })).toBe('Cho mình biết về: Áo thun\nhttps://shopee.vn/x')
    expect(buildShareTargetPrompt({ url: 'https://shopee.vn/x' })).toBe('Cho mình biết về link này: https://shopee.vn/x')
  })
  it('a URL hidden in `text` (how many Android apps share) is recovered', () => {
    expect(buildShareTargetPrompt({ text: 'Xem cái này https://www.tiktok.com/@a/video/1' })).toContain('https://www.tiktok.com/@a/video/1')
  })
  it('plain text is the question itself; empty input means the plain chat', () => {
    expect(buildShareTargetPrompt({ text: 'Quán này có ngon không?' })).toBe('Quán này có ngon không?')
    expect(buildShareTargetPrompt({})).toBeNull()
    expect(shareTargetDestination({})).toBe('/chat')
  })
  it('caps the prompt and strips control characters', () => {
    const p = buildShareTargetPrompt({ text: 'ab'.repeat(2000) })!
    expect(p.length).toBeLessThanOrEqual(1000)
    expect(p).not.toContain('')
  })
  it('destination is the existing chat with the prompt prefilled', () => {
    expect(shareTargetDestination({ text: 'hi' })).toBe('/chat?q=hi')
  })
})
