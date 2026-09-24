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
    const p = buildShareTargetPrompt({ text: 'a\x07b'.repeat(2000) })!
    expect(p.length).toBeLessThanOrEqual(1000)
    expect(p).not.toContain('\x07')
  })
  it('destination is the existing chat with the prompt prefilled', () => {
    expect(shareTargetDestination({ text: 'hi' })).toBe('/chat?q=hi')
  })
})

describe('PWA shortcuts — G1 completion', () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'public', 'manifest.json'), 'utf8')) as {
    id: string; start_url: string; shortcuts: Array<{ name: string; url: string; icons: Array<{ src: string }> }>
  }
  it('declares a stable id and two home-screen shortcuts, both attributed as pwa_shortcut', () => {
    expect(manifest.id).toBe('/')
    expect(manifest.shortcuts.map((s) => s.url)).toEqual(['/chat?src=pwa_shortcut', '/scam-shield?src=pwa_shortcut'])
    for (const s of manifest.shortcuts) {
      expect(s.name.trim().length).toBeGreaterThan(0)
      expect(s.url.startsWith('/')).toBe(true)
      for (const i of s.icons) expect(i.src).toBe('/branding/otter-logo.png')
    }
  })
})
