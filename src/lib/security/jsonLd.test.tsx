import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { serializeJsonLd } from './jsonLd'
import JsonLd from '@/components/JsonLd'
import { buildPublicPayload } from '@/lib/share/publicSanitizer'
import type { PublicSharedResult } from '@/lib/share/sharedResult'

// ─────────────────────────────────────────────────────────────────────────────
// security-audit C1: a share title of `</script><script>…</script>` broke out of the /r/<slug>
// page's JSON-LD block and ran as script. These tests pin the fix at every layer: the serializer,
// the component, the real page built from a real payload, and a guard that no page renders
// JSON-LD any other way.
// ─────────────────────────────────────────────────────────────────────────────

const ATTACK = '</script><script>alert(1)</script>'

const store = vi.hoisted(() => ({ row: null as unknown }))
vi.mock('@/lib/share/sharedResultStore', () => ({
  getPublicSharedResult: vi.fn(async () => store.row),
  listPublicSharedResults: vi.fn(async () => []),
}))

/** The contents of every `<script type="application/ld+json">` in a rendered page. */
const ldBlocks = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1])

describe('serializeJsonLd', () => {
  it('escapes every character that can end or confuse a script block, and nothing else changes', () => {
    const value = { name: ATTACK, amp: 'a & b > c', ls: 'x\u2028y\u2029z', nested: [{ t: '<!--' }] }
    const out = serializeJsonLd(value)
    expect(out).not.toMatch(/[<>&\u2028\u2029]/)
    expect(out).toContain('\\u003c/script\\u003e')
    expect(JSON.parse(out)).toEqual(value) // same JSON: crawlers read identical data
  })

  it('never returns undefined', () => {
    expect(serializeJsonLd(undefined)).toBe('null')
  })
})

describe('<JsonLd>', () => {
  it('renders one inert script block for a hostile title', () => {
    const html = renderToStaticMarkup(<JsonLd data={{ '@type': 'QAPage', name: ATTACK }} />)
    expect(html).not.toContain('</script><script>')
    expect(html.match(/<script/g)).toHaveLength(1)
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(JSON.parse(ldBlocks(html)[0])).toEqual({ '@type': 'QAPage', name: ATTACK })
  })
})

describe('/r/[slug] — the page the attack targeted, built from a real payload', () => {
  it('a hostile title and question stay data, never markup', async () => {
    // The real builder: the title is user-supplied (POST /api/shared-results) and only PII is
    // redacted from it, so the attack string survives into the stored payload exactly.
    const payload = buildPublicPayload({
      userQuery: `ăn gì ở quận 1 ${ATTACK}`,
      assistantContent: 'Một câu trả lời.',
      domain: 'food',
      locale: 'vi',
      title: ATTACK,
    })
    expect(payload.title).toBe(ATTACK)
    store.row = {
      id: 'id1', slug: 'AbCdEfGh12', query: payload.query, payload, domain: 'food', locale: 'vi',
      og_version: 1, view_count: 0, ask_count: 0, created_at: '2026-09-27T00:00:00.000Z',
      parent_id: null, owner_is_anonymous: false, // listed ⇒ the breadcrumb block renders too
    } satisfies PublicSharedResult

    const { default: SharedResultPage } = await import('@/app/r/[slug]/page')
    const html = renderToStaticMarkup(await SharedResultPage({ params: { slug: 'AbCdEfGh12' } }))

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('</script><script>')
    const blocks = ldBlocks(html)
    expect(blocks.length).toBe(2) // QAPage + breadcrumb, both carrying the title
    expect(html.match(/<script/g)).toHaveLength(blocks.length) // no script element but JSON-LD
    for (const b of blocks) expect(b).not.toMatch(/[<>]/)
    const [qa, crumbs] = blocks.map((b) => JSON.stringify(JSON.parse(b)))
    expect(qa).toContain(JSON.stringify(ATTACK).slice(1, -1)) // still the exact title, as data
    expect(crumbs).toContain(JSON.stringify(ATTACK).slice(1, -1))
  })
})

describe('guard — no page renders JSON-LD except through <JsonLd>', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) return walk(p)
      return /\.(tsx|ts|jsx|js)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : []
    })
  const allowed = new Set([path.join('src', 'components', 'JsonLd.tsx'), path.join('src', 'lib', 'security', 'jsonLd.ts')])

  it('application/ld+json appears only in the component', () => {
    const offenders = walk('src').filter((f) => !allowed.has(f) && fs.readFileSync(f, 'utf8').includes('application/ld+json'))
    expect(offenders).toEqual([])
  })

  it('no dangerouslySetInnerHTML is fed JSON.stringify directly', () => {
    const offenders = walk('src').filter((f) => /dangerouslySetInnerHTML=\{\{\s*__html:\s*JSON\.stringify\(/.test(fs.readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
