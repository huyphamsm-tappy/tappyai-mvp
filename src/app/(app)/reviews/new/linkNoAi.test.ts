import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// 02/10 (owner): pasting a YouTube link must NOT ask a model for the description or hashtags.
// Title + cover still come from oEmbed (/api/links/resolve); the description stays empty for the
// poster; hashtags are typed by the poster and never rendered with a doubled "##".
const PAGE = readFileSync('src/app/(app)/reviews/new/page.tsx', 'utf8')
const ROUTE = readFileSync('src/app/api/explore/process/route.ts', 'utf8')

describe('post from a YouTube link: no AI-written description or hashtags', () => {
  it('the AI suggestion is only reachable behind the (default OFF) flag', () => {
    expect(PAGE).toMatch(/const LINK_AI_SUGGEST_ENABLED = process\.env\.NEXT_PUBLIC_POST_LINK_AI_ENABLED === 'true'/)
    const calls = [...PAGE.matchAll(/triggerUrlAI\(thumb, title\)/g)]
    expect(calls).toHaveLength(1)
    expect(PAGE).toMatch(/if \(LINK_AI_SUGGEST_ENABLED\) triggerUrlAI\(thumb, title\)/)
  })

  it('still resolves title and cover from the allowed source', () => {
    expect(PAGE).toContain("fetch('/api/links/resolve'")
    expect(PAGE).toMatch(/setUrlMeta\(\{ thumbnail_url: thumb, title \}\)/)
  })

  it('the server refuses the link flow (a request carrying a title) unless EXPLORE_LINK_AI_ENABLED=true', () => {
    expect(ROUTE).toMatch(/if \(title && process\.env\.EXPLORE_LINK_AI_ENABLED !== 'true'\) return NextResponse\.json\(EMPTY\)/)
    // ...and it comes BEFORE any model call.
    expect(ROUTE.indexOf('EXPLORE_LINK_AI_ENABLED')).toBeLessThan(ROUTE.indexOf('processContent({'))
  })

  it('hashtags are typed by the poster and rendered with exactly one #', () => {
    expect(PAGE).toContain('data-post-hashtags')
    expect(PAGE).toMatch(/mergeHashtags\(typedTags, aiHashtags\)/)
    expect(PAGE).not.toMatch(/payload\.hashtags = aiHashtags/)
  })
})
