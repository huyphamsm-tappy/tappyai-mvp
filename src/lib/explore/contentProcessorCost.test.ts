import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

// ── V2-UAT-013 — the cost RCA, made executable ──────────────────────────────
//
// The finding read: "12 AI call sites; one upload = 2 × generate + 1 × vision". The first half is
// a fact about the source. The second half was a STATIC COUNT read as a RUNTIME one, and it is
// wrong: `processContent` has three call sites that are mutually exclusive branches, each ending
// in its own `return`. An upload spends exactly ONE of them.
//
// That distinction is the whole reason the Owner asked for RCA before optimisation. "Reduce three
// calls to one" would have been work against a number that was never real, and the branch it
// removed would have been the one handling a case the other two do not.
//
// So this file measures instead of counting. It drives the real function with the model mocked
// and asserts how many calls each input shape actually makes.

const generate = vi.fn(async () => ({ text: '{"hashtags":["a"],"category":"food","location":""}' }))
const vision = vi.fn(async () => ({ text: '{"caption":"c","hashtags":["a"],"category":"food","location":""}' }))

vi.mock('@/lib/ai/llm', () => ({ AI: { generate: (...a: unknown[]) => generate(...(a as [])), vision: (...a: unknown[]) => vision(...(a as [])) } }))

const IMAGE = 'https://storage.example.com/thumbs/a.jpg'

describe('one upload costs one model call, whichever shape it has', () => {
  beforeEach(() => { generate.mockClear(); vision.mockClear() })

  it('a caption-only post: one generate, no vision', async () => {
    const { processContent } = await import('./contentProcessor')
    await processContent({ caption: 'Bún bò ngon quá' })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(vision).toHaveBeenCalledTimes(0)
  })

  it('a caption WITH a thumbnail still costs one, and it is the cheap one', async () => {
    // The caption branch wins over the image branch deliberately: the user already said what the
    // post is about, so paying for vision to find out would be spending money to be told something
    // we were given for free.
    const { processContent } = await import('./contentProcessor')
    await processContent({ caption: 'Bún bò ngon quá', thumbnailUrl: IMAGE })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(vision).toHaveBeenCalledTimes(0)
  })

  it('a title with no thumbnail: one generate, no vision', async () => {
    const { processContent } = await import('./contentProcessor')
    await processContent({ title: 'Quán cà phê Quận 1' })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(vision).toHaveBeenCalledTimes(0)
  })

  it('a thumbnail with no caption: one vision, no generate', async () => {
    const { processContent } = await import('./contentProcessor')
    await processContent({ thumbnailUrl: IMAGE })
    expect(vision).toHaveBeenCalledTimes(1)
    expect(generate).toHaveBeenCalledTimes(0)
  })

  it('nothing at all: no model call whatsoever', async () => {
    const { processContent } = await import('./contentProcessor')
    const result = await processContent({})
    expect(generate).toHaveBeenCalledTimes(0)
    expect(vision).toHaveBeenCalledTimes(0)
    expect(result.category).toBe('other')
  })

  it('a model failure costs one call, not a retry storm', async () => {
    // There is no retry layer anywhere in `lib/ai/llm`, and that is a decision rather than an
    // omission: a retry doubles spend on exactly the failures that are least likely to succeed the
    // second time, and every caller here degrades gracefully instead. `processContent` returns a
    // usable fallback; the safety pipeline's own vision call fails CLOSED. Adding retry would
    // raise cost and, on the safety path, delay a hold.
    generate.mockRejectedValueOnce(new Error('provider down'))
    const { processContent } = await import('./contentProcessor')
    const result = await processContent({ caption: 'Bún bò' })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(result.caption).toBe('Bún bò')
  })
})

describe('the two vision calls on one image are not a duplicate', () => {
  it('they ask different questions, at different trust levels', () => {
    // An upload does reach vision twice: once here for a caption, once in the safety pipeline for
    // evidence. Merging them is the obvious saving and it is REFUSED, because the safety prompt is
    // deliberately incapable of asking for a verdict — it transcribes visible text and names
    // subjects, and nothing else. Folding caption generation into it would let content production
    // share a prompt with a safety observation, which is how a model ends up authoring policy.
    const safety = readFileSync('src/lib/safety/evidence/modalities.ts', 'utf8')
    expect(safety).toContain('IT IS NEVER ASKED WHETHER SOMETHING VIOLATES A POLICY')
    // The safety prompt must not ask for a caption, a category or hashtags — the content job.
    const prompt = /FRAME_OBSERVATION_PROMPT = \[([\s\S]*?)\]\.join/.exec(safety)?.[1] ?? ''
    expect(prompt).not.toMatch(/caption|hashtag|category/i)
    expect(prompt).toContain('Do not judge it')
  })
})

describe('the link field does not spend a model call per keystroke', () => {
  const composer = readFileSync('src/app/reviews/new/page.tsx', 'utf8')

  it('resolution is debounced away from onChange', () => {
    // `onChange` runs on every keystroke. Once `detectSource` matches — around character 20 of a
    // ~43-character YouTube URL — every remaining keystroke fired /api/links/resolve AND
    // /api/explore/process, and the second is a model call. Typing a link cost ~20 calls to make
    // one post; pasting cost one, which is why it never showed up in a demo.
    expect(composer).toContain('URL_RESOLVE_DEBOUNCE_MS')
    expect(composer).toMatch(/urlDebounceRef\.current = setTimeout\(/)
    // The synchronous state updates must stay OUTSIDE the timer or the field goes unresponsive.
    expect(composer).toMatch(/const handleUrlChange = \(val: string\) => \{\s*\n\s*setSource_url\(val\)/)
  })

  it('the same URL is never resolved twice', () => {
    expect(composer).toContain('lastResolvedUrlRef')
    expect(composer).toMatch(/if \(lastResolvedUrlRef\.current === trimmed\) return/)
  })

  it('clearing the field re-arms the memo', () => {
    // Otherwise pasting a link, clearing it and pasting the same one again would silently do
    // nothing — the guard would still be holding the old value.
    expect(composer).toMatch(/if \(!trimmed\) \{ lastResolvedUrlRef\.current = ''; return \}/)
  })
})

describe('the prompt cache is real and lives in the provider', () => {
  it('the stable prefix carries a cache breakpoint', () => {
    // The finding noted "no cache layer visible in lib/ai". It is there — it is just not a cache
    // of OUR OWN: B1 splits the system prompt so the ~11k-token rulebook is byte-identical across
    // requests, and the Anthropic adapter marks that segment `cache_control: ephemeral`. The
    // caching happens at the provider, which is the only place that may know a vendor's name.
    const provider = readFileSync('src/lib/ai/llm/providers/claude.ts', 'utf8')
    expect(provider).toContain('cacheControl')
    expect(provider).toContain('decorateMessages')

    // And the thing being cached has to stay invariant, or the breakpoint buys nothing. That is
    // asserted properly in promptBuilder.test.ts; named here so the two halves of one mechanism
    // are findable from each other.
    const builder = readFileSync('src/lib/ai/promptBuilder.ts', 'utf8')
    expect(builder).toContain('shared')
  })

  it('no vendor cache logic escaped the provider layer', () => {
    // Enforced for real by scripts/architecture/check.mjs (`no-vendor-cache-logic`); restated here
    // because a cache breakpoint in application code is both an architecture break and a cost bug —
    // it would move the boundary and silently invalidate the prefix.
    const ai = readFileSync('src/lib/ai/llm/ai.ts', 'utf8')
    expect(ai).not.toMatch(/cacheControl|cache_control/)
  })
})
