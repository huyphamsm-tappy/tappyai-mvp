import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildProfileMetadata, isProfileId, profileCardUrl, profileCardVersion } from './profileOg'

const ENV = { NEXT_PUBLIC_SITE_URL: 'https://www.example.test' } as unknown as NodeJS.ProcessEnv
const ID = '123e4567-e89b-12d3-a456-426614174000'

describe('profile share metadata (BUG 13)', () => {
  it('exposes the profile card — absolute https, 1200x630 png, versioned — as og:image and twitter:image', () => {
    const m = buildProfileMetadata(ID, { full_name: 'Huy Phạm', avatar_url: 'https://x/a.jpg', updated_at: '2026-10-01T10:00:00Z' }, ENV)
    const og = (m.openGraph as { images: { url: string; width: number; height: number; type: string }[] }).images[0]
    expect(og.url.startsWith(`https://www.example.test/users/${ID}/card.png?v=1.`)).toBe(true)
    expect([og.width, og.height, og.type]).toEqual([1200, 630, 'image/png'])
    expect((m.twitter as { card: string; images: string[] }).card).toBe('summary_large_image')
    expect((m.twitter as { images: string[] }).images[0]).toBe(og.url)
    expect(m.alternates?.canonical).toBe(`https://www.example.test/users/${ID}`)
  })

  it('the image URL changes when the profile is edited (Zalo/Facebook cache-bust)', () => {
    const a = profileCardVersion({ full_name: 'A', updated_at: '2026-10-01T10:00:00Z' })
    const b = profileCardVersion({ full_name: 'A', updated_at: '2026-10-02T10:00:00Z' })
    expect(a).not.toBe(b)
    // No updated_at: falls back to a hash of the public fields — still changes with the name.
    expect(profileCardVersion({ full_name: 'A' })).not.toBe(profileCardVersion({ full_name: 'B' }))
    expect(profileCardUrl(ID, undefined, ENV)).toBe(`https://www.example.test/users/${ID}/card.png`)
  })

  it('an unknown or unnamed profile leaks nothing: neutral title, no card, not indexed', () => {
    for (const p of [null, { full_name: null }, { full_name: '  ' }]) {
      const m = buildProfileMetadata(ID, p, ENV)
      expect(m.title).toBe('Profile | TappyAI')
      expect(m.openGraph).toBeUndefined()
      expect(JSON.stringify(m)).not.toContain('card.png')
    }
  })

  it('only well-formed ids reach the database / the card', () => {
    expect(isProfileId(ID)).toBe(true)
    expect(isProfileId("x' or 1=1")).toBe(false)
    expect(isProfileId('../../etc')).toBe(false)
  })
})

describe('the card route and the page wiring', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')
  it('page uses the builder; the route is edge, png, reads only public columns, encodes only the profile URL', () => {
    expect(read('app/users/[id]/page.tsx')).toContain('buildProfileMetadata(')
    const route = read('app/users/[id]/card.png/route.tsx')
    expect(route).toContain("export const runtime = 'edge'")
    expect(route).toContain(".select('full_name, avatar_url')")
    expect(route).toContain('absoluteUrl(`/users/${params.id}`)')
    expect(route).toContain('isProfileId(id)')
    expect(route).not.toMatch(/email|phone|bio/i)
  })
})
