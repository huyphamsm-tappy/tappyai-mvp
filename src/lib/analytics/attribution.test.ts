// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  FIRST_ATTR_KEY, SESSION_ATTR_KEY, captureAttribution, getAttribution, getFirstTouchAttribution,
  isZaloUserAgent, parseLandingAttribution, setSessionSource, setShareAttribution,
} from './attribution'

const ZALO_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/112 Mobile Safari/537.36 Zalo/23.05.01'

describe('parseLandingAttribution — pure', () => {
  it('reads an explicit, valid ?src=', () => {
    expect(parseLandingAttribution({ pathname: '/', search: '?src=qr_pos' }).source).toBe('qr_pos')
    expect(parseLandingAttribution({ pathname: '/', search: '?src=zalo_mini' }).source).toBe('zalo_mini')
  })

  it('refuses an unknown ?src= — it can never become a stored value', () => {
    expect(parseLandingAttribution({ pathname: '/', search: '?src=facebook_ads' }).source).toBe('direct')
  })

  it('a public result path is a share-out landing', () => {
    expect(parseLandingAttribution({ pathname: '/r/AbCdEfGh12' }).source).toBe('share_out')
  })

  it("Zalo's browser refines a share landing to zalo_link", () => {
    expect(parseLandingAttribution({ pathname: '/r/AbCdEfGh12', userAgent: ZALO_UA }).source).toBe('zalo_link')
    expect(isZaloUserAgent(ZALO_UA)).toBe(true)
    expect(isZaloUserAgent('Mozilla/5.0 Chrome/120')).toBe(false)
  })

  it('an explicit source wins over the path heuristic', () => {
    expect(parseLandingAttribution({ pathname: '/r/AbCdEfGh12', search: '?src=zalo_mini', userAgent: ZALO_UA }).source).toBe('zalo_mini')
  })

  it('never derives share_id from the URL — the slug is not the id', () => {
    expect(parseLandingAttribution({ pathname: '/r/AbCdEfGh12' }).share_id).toBeUndefined()
  })

  it('a search or AI-engine referrer is GEO discovery, even on a share path', () => {
    expect(parseLandingAttribution({ pathname: '/food', referrer: 'https://www.google.com/' }).source).toBe('geo_google')
    expect(parseLandingAttribution({ pathname: '/r/AbCdEfGh12', referrer: 'https://www.bing.com/search?q=x' }).source).toBe('geo_google')
    expect(parseLandingAttribution({ pathname: '/r/AbCdEfGh12', referrer: 'https://chatgpt.com/' }).source).toBe('geo_chatgpt')
    expect(parseLandingAttribution({ pathname: '/', referrer: 'https://www.perplexity.ai/search/x' }).source).toBe('geo_chatgpt')
    expect(parseLandingAttribution({ pathname: '/', referrer: 'https://evil.google.com.attacker.example/' }).source).toBe('direct')
  })

  it('everything else is direct', () => {
    expect(parseLandingAttribution({ pathname: '/food' }).source).toBe('direct')
  })
})

describe('attribution persistence — survives the loop', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); history.replaceState(null, '', '/') })

  it('captures once per session and once per browser (first touch)', () => {
    history.replaceState(null, '', '/?src=qr_pos')
    const first = captureAttribution()
    expect(first?.source).toBe('qr_pos')
    history.replaceState(null, '', '/food?src=geo_google')
    expect(captureAttribution()?.source).toBe('qr_pos') // session record is not re-attributed by in-app navigation
    expect(getFirstTouchAttribution()?.source).toBe('qr_pos')
  })

  it('setShareAttribution bridges the share into the session and first touch', () => {
    history.replaceState(null, '', '/r/AbCdEfGh12')
    captureAttribution()
    const next = setShareAttribution('share-uuid-1')
    expect(next).toMatchObject({ source: 'share_out', share_id: 'share-uuid-1' })
    expect(getAttribution()).toMatchObject({ source: 'share_out', share_id: 'share-uuid-1' })
    expect(getFirstTouchAttribution()).toMatchObject({ share_id: 'share-uuid-1' })
  })

  it('setShareAttribution never downgrades a more specific source', () => {
    sessionStorage.setItem(SESSION_ATTR_KEY, JSON.stringify({ source: 'zalo_mini', at: new Date().toISOString() }))
    expect(setShareAttribution('s1')?.source).toBe('zalo_mini')
  })

  it('a later share does not overwrite an earlier first-touch share', () => {
    localStorage.setItem(FIRST_ATTR_KEY, JSON.stringify({ source: 'share_out', share_id: 'first', at: new Date().toISOString() }))
    setShareAttribution('second')
    expect(getFirstTouchAttribution()?.share_id).toBe('first')
  })

  it('setSessionSource: an entry surface names itself (wedge_scam, web_share_target) and first touch follows only on the first landing', () => {
    history.replaceState(null, '', '/scam-shield')
    captureAttribution()
    expect(setSessionSource('wedge_scam')?.source).toBe('wedge_scam')
    expect(getAttribution().source).toBe('wedge_scam')
    expect(getFirstTouchAttribution()?.source).toBe('wedge_scam')
    // A later session on the same browser does not rewrite first touch.
    sessionStorage.clear()
    history.replaceState(null, '', '/share-target')
    captureAttribution()
    setSessionSource('web_share_target')
    expect(getAttribution().source).toBe('web_share_target')
    expect(getFirstTouchAttribution()?.source).toBe('wedge_scam')
  })

  it('stores no PII and no user identifiers', () => {
    history.replaceState(null, '', '/r/AbCdEfGh12')
    captureAttribution(); setShareAttribution('s1')
    const raw = `${sessionStorage.getItem(SESSION_ATTR_KEY)}${localStorage.getItem(FIRST_ATTR_KEY)}`
    expect(Object.keys(JSON.parse(sessionStorage.getItem(SESSION_ATTR_KEY)!)).sort()).toEqual(['at', 'n', 'share_id', 'source'])
    expect(raw).not.toMatch(/user_id|anon_id|session_id|email|phone/)
  })
})
