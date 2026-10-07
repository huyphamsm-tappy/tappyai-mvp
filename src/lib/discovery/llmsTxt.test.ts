import { describe, it, expect } from 'vitest'
import { llmsTxt } from './llmsTxt'
import { HUB_DOMAINS } from './domainHubs'
import { DISALLOWED_PATHS } from '@/app/robots'
import { GET } from '@/app/llms.txt/route'

describe('/llms.txt — a deterministic public-page index, nothing more', () => {
  const env = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv
  const text = llmsTxt(env)

  it('starts with the brand H1 and a blockquote summary (llmstxt.org shape)', () => {
    const [h1, , quote] = text.split('\n')
    expect(h1).toBe('# TappyAI')
    expect(quote.startsWith('> ')).toBe(true)
  })

  it('lists every hub, Scam Shield and /about with absolute canonical URLs', () => {
    for (const d of HUB_DOMAINS) expect(text).toContain(`](https://www.tappyai.com/${d})`)
    expect(text).toContain('](https://www.tappyai.com/scam-shield)')
    expect(text).toContain('](https://www.tappyai.com/about)')
    expect(text).toContain('](https://www.tappyai.com/sitemap.xml)')
  })

  it('never lists a disallowed (private) path, a query string, or an unresolved placeholder', () => {
    for (const p of DISALLOWED_PATHS) expect(text, p).not.toContain(`https://www.tappyai.com${p}`)
    expect(text).not.toMatch(/\?src=|\?q=|\{email\}|user_id|anon/)
  })

  it('is deterministic for the same environment', () => {
    expect(llmsTxt(env)).toBe(text)
  })

  it('the route serves it as cacheable text/plain', async () => {
    const res = GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('cache-control')).toContain('s-maxage')
    expect((await res.text()).startsWith('# TappyAI')).toBe(true)
  })
})
