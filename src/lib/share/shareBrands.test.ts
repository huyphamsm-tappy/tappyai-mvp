// The share menu's platform marks — real, official, traceable, and only for platforms.
//
// This file exists because the tiles used to be coloured initials ("F", "Z"),
// which is a text label pretending to be an icon. A mark is either the
// platform's own published artwork with its provenance on record, or it is
// not shown at all. There is no third option — no approximated path, no icon
// pack, no emoji.

import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SHARE_BRAND_MARKS, shareBrandMark } from './shareBrands'
import { WEB_SHARE_TARGETS, type ShareTargetId } from './shareTargets'

const root = join(__dirname, '..', '..', '..')
const marks = Object.values(SHARE_BRAND_MARKS)

describe('every platform in the menu has its own mark; every action has none', () => {
  it('covers exactly the messaging platforms — Facebook, Messenger, Zalo, WhatsApp, Telegram, Viber, LINE, TikTok', () => {
    expect(Object.keys(SHARE_BRAND_MARKS).sort()).toEqual(
      ['facebook', 'line', 'messenger', 'telegram', 'tiktok', 'viber', 'whatsapp', 'zalo'],
    )
  })

  it('every url/text handoff target that is a platform has a mark; the actions and Email do not', () => {
    const platforms = WEB_SHARE_TARGETS.filter(t => (t.kind === 'url-handoff' || t.kind === 'text-handoff' || t.id === 'tiktok') && t.id !== 'email')
    for (const t of platforms) expect(shareBrandMark(t.id), t.id).not.toBeNull()
    for (const id of ['email', 'inbox', 'save', 'copy', 'native'] as ShareTargetId[]) expect(shareBrandMark(id)).toBeNull()
  })

  it('ids match their keys and display names are the platforms’ own', () => {
    for (const [key, m] of Object.entries(SHARE_BRAND_MARKS)) expect(m.id).toBe(key)
    expect(marks.map(m => m.displayName).sort()).toEqual(
      ['Facebook', 'LINE', 'Messenger', 'Telegram', 'TikTok', 'Viber', 'WhatsApp', 'Zalo'],
    )
  })
})

describe('the asset files are real, vector, self-contained and traceable', () => {
  it.each(marks.map(m => [m.id, m] as const))('%s: /brands/share/<id>.svg exists, is an SVG, and is non-trivial', (_id, m) => {
    expect(m.logo).toBe(`/brands/share/${m.id}.svg`)
    const file = join(root, 'public', m.logo)
    expect(statSync(file).size).toBeGreaterThan(500)
    const svg = readFileSync(file, 'utf8')
    expect(svg).toMatch(/<svg[\s>]/)
    expect(svg).toContain('</svg>')
  })

  it.each(marks.map(m => [m.id, m] as const))('%s: no script, no event handler, no external reference inside the mark', (_id, m) => {
    const svg = readFileSync(join(root, 'public', m.logo), 'utf8')
    expect(svg).not.toMatch(/<script/i)
    expect(svg).not.toMatch(/\son[a-z]+=/i)
    expect(svg).not.toMatch(/<image/i)
    expect(svg).not.toMatch(/href=["']https?:/i)
  })

  it.each(marks.map(m => [m.id, m] as const))('%s: provenance and licence are on record', (_id, m) => {
    expect(m.source).toMatch(/Wikimedia Commons — File:[^ ]+\.svg/)
    expect(m.license.trim().length).toBeGreaterThan(0)
  })

  it('keeps the marks out of the commerce-partner registry', async () => {
    const { BRAND_REGISTRY } = await import('@/config/brandRegistry')
    for (const m of marks) expect(BRAND_REGISTRY).not.toHaveProperty(m.id)
  })
})
