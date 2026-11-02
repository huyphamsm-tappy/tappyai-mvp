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
    // B3 (owner 29/10): the call carries the request sequence (`seq`, stale-response guard) since 3750bac; still ONE call site, still behind the flag.
    const calls = [...PAGE.matchAll(/triggerUrlAI\(thumb, title(, seq)?\)/g)]
    expect(calls).toHaveLength(1)
    expect(PAGE).toMatch(/if \(LINK_AI_SUGGEST_ENABLED\) triggerUrlAI\(thumb, title(, seq)?\)/)
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

  it('29/10 (owner): a VIDEO upload asks no model either — the call is behind its own default-OFF flag', () => {
    expect(PAGE).toMatch(/const UPLOAD_AI_SUGGEST_ENABLED = process\.env\.NEXT_PUBLIC_POST_UPLOAD_AI_ENABLED === 'true'/)
    const handler = PAGE.slice(PAGE.indexOf('const handleVideoSelect = async'), PAGE.indexOf('const cancelUpload'))
    const gate = handler.indexOf('if (UPLOAD_AI_SUGGEST_ENABLED) {')
    expect(gate).toBeGreaterThan(-1)
    expect(handler.indexOf("apiFetch('/api/explore/process'")).toBeGreaterThan(gate)
    expect(handler.indexOf("setUploadStep('ai')")).toBeGreaterThan(gate)
    // Two requests to the content processor in the page: this one (gated here) and triggerUrlAI (gated by the link flag).
    expect(PAGE.match(/apiFetch\('\/api\/explore\/process'/g)).toHaveLength(2)
  })

  it('29/10 (owner): the server answers EMPTY for every post unless EXPLORE_CAPTION_AI_ENABLED=true, before any model call', () => {
    expect(ROUTE).toMatch(/if \(process\.env\.EXPLORE_CAPTION_AI_ENABLED !== 'true'\) return NextResponse\.json\(EMPTY\)/)
    expect(ROUTE.indexOf('EXPLORE_CAPTION_AI_ENABLED')).toBeLessThan(ROUTE.indexOf('processContent({'))
  })

  it('hashtags are typed by the poster and rendered with exactly one #', () => {
    expect(PAGE).toContain('data-post-hashtags')
    expect(PAGE).toMatch(/mergeHashtags\(typedTags, aiHashtags\)/)
    expect(PAGE).not.toMatch(/payload\.hashtags = aiHashtags/)
  })
})
