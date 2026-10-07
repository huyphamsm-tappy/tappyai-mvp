import { describe, it, expect } from 'vitest'
import { siteJsonLd } from './siteJsonLd'

describe('site JSON-LD (home)', () => {
  const env = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv
  const [site, org] = siteJsonLd(env) as [Record<string, unknown>, Record<string, unknown>]
  it('declares a SearchAction that lands on the public chat entry', () => {
    expect(site['@type']).toBe('WebSite')
    const action = site.potentialAction as { target: { urlTemplate: string }; 'query-input': string }
    expect(action.target.urlTemplate).toBe('https://www.tappyai.com/chat?q={search_term_string}')
    expect(action['query-input']).toBe('required name=search_term_string')
  })
  it('declares the organization with a fetchable logo and no user data', () => {
    expect(org['@type']).toBe('Organization')
    expect(org.logo).toBe('https://www.tappyai.com/branding/otter-logo.png')
    expect(JSON.stringify(siteJsonLd(env))).not.toMatch(/user|anon|session|token/)
  })
})
