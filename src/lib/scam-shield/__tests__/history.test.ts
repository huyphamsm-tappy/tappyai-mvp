// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  readHistory, recordCheck, clearHistory,
  HISTORY_STORAGE_KEY, HISTORY_LIMIT,
} from '../history'
import type { CheckResult, RiskLevel } from '../types'

/**
 * Scam Shield's local history is a convenience list, and every test here exists because the
 * failure mode of getting it wrong is worse than not having it at all:
 *
 *   • a row that was never produced by a real check would be a fabricated security claim;
 *   • a throw on corrupt storage would take down the CHECK FORM sitting above the list;
 *   • a stale duplicate would show one URL with two different verdicts.
 *
 * The store is a string in someone else's browser: hand-edited, left over from an older shape of
 * the feature, half-written, or refused outright. It is treated as hostile input throughout.
 */

function result(over: Partial<CheckResult> & { level?: RiskLevel } = {}): CheckResult {
  const { level, ...rest } = over
  return {
    inputType: 'url',
    url: 'https://example.com/',
    risk: { score: 0, confidence: 90, level: level ?? 'SAFE' },
    evidence: { items: [], summary: { criticalCount: 0, warningCount: 0, safeCount: 0, totalSources: 0, respondedSources: 0 } },
    officialMatch: null,
    actions: [],
    checkedAt: Date.now(),
    cached: false,
    ...rest,
  }
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('a first visit has no history', () => {
  it('starts empty rather than seeded', () => {
    // 🚨 The visual reference showed three populated rows. If any of them ever reached the code,
    // this is the test that fails: a brand-new browser must read back nothing at all.
    expect(readHistory()).toEqual([])
  })

  it('stays empty until a real result is recorded', () => {
    expect(readHistory()).toHaveLength(0)
    recordCheck(result({ url: 'https://vietcombank.com.vn/' }))
    expect(readHistory()).toHaveLength(1)
  })
})

describe('entries come from real results', () => {
  it('stores the URL, the level and the check time — and nothing else', () => {
    recordCheck(result({ url: 'https://vcb-secure-login.net/', level: 'CRITICAL', checkedAt: 1_700_000_000_000 }))

    const [entry] = readHistory()
    expect(entry).toEqual({
      url: 'https://vcb-secure-login.net/',
      level: 'CRITICAL',
      checkedAt: 1_700_000_000_000,
    })
    // Score, evidence, actions and the official-brand match are deliberately absent: a phishing
    // dossier in localStorage on a shared machine is a liability, and every one of those fields
    // is re-derivable by checking the link again.
    expect(Object.keys(entry)).toHaveLength(3)
  })

  it('keeps the level the engine assigned, for every level it can assign', () => {
    const levels: RiskLevel[] = ['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INCONCLUSIVE']
    for (const level of levels) {
      localStorage.clear()
      recordCheck(result({ level, url: `https://${level.toLowerCase()}.example/` }))
      expect(readHistory()[0].level, `${level} survives a round trip`).toBe(level)
    }
  })

  it('falls back to now when a result carries no usable timestamp', () => {
    const before = Date.now()
    recordCheck(result({ checkedAt: 0 }))
    expect(readHistory()[0].checkedAt).toBeGreaterThanOrEqual(before)
  })
})

describe('ordering and size', () => {
  it('puts the most recent check first', () => {
    recordCheck(result({ url: 'https://first.example/', checkedAt: 1000 }))
    recordCheck(result({ url: 'https://second.example/', checkedAt: 2000 }))

    expect(readHistory().map(e => e.url)).toEqual(['https://second.example/', 'https://first.example/'])
  })

  it('moves a re-checked URL to the top instead of duplicating it', () => {
    // 🚨 Two rows for one link, carrying different verdicts, is the single most confusing thing
    // this list could show — the older one would read as a second opinion.
    recordCheck(result({ url: 'https://a.example/', level: 'SAFE', checkedAt: 1000 }))
    recordCheck(result({ url: 'https://b.example/', checkedAt: 2000 }))
    recordCheck(result({ url: 'https://a.example/', level: 'CRITICAL', checkedAt: 3000 }))

    const history = readHistory()
    expect(history.filter(e => e.url === 'https://a.example/')).toHaveLength(1)
    expect(history[0]).toMatchObject({ url: 'https://a.example/', level: 'CRITICAL' })
  })

  it('keeps only the most recent HISTORY_LIMIT entries', () => {
    for (let i = 0; i < HISTORY_LIMIT + 8; i++) {
      recordCheck(result({ url: `https://site-${i}.example/`, checkedAt: 1000 + i }))
    }
    const history = readHistory()
    expect(history).toHaveLength(HISTORY_LIMIT)
    expect(history[0].url).toBe(`https://site-${HISTORY_LIMIT + 7}.example/`)
  })
})

describe('the stored value is hostile input', () => {
  it('survives JSON that does not parse', () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, '{not json')
    expect(readHistory()).toEqual([])
  })

  it('survives valid JSON that is not an array', () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, '{"url":"https://x.example/"}')
    expect(readHistory()).toEqual([])
  })

  it('drops malformed rows and keeps the good ones', () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([
      { url: 'https://good.example/', level: 'HIGH', checkedAt: 2000 },
      null,
      'a string',
      { url: '', level: 'SAFE', checkedAt: 1000 },                    // empty URL
      { url: 'https://x.example/', level: 'PROBABLY_FINE', checkedAt: 1000 },  // invented level
      { url: 'https://y.example/', level: 'SAFE', checkedAt: 'soon' },  // non-numeric time
      { url: 'https://z.example/', level: 'SAFE' },                     // no time at all
    ]))
    expect(readHistory()).toEqual([{ url: 'https://good.example/', level: 'HIGH', checkedAt: 2000 }])
  })

  it('does not let a corrupt store block a new check from being recorded', () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, 'garbage')
    recordCheck(result({ url: 'https://fresh.example/' }))
    expect(readHistory().map(e => e.url)).toEqual(['https://fresh.example/'])
  })
})

describe('storage that is unavailable or refuses to write', () => {
  it('reads as empty when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readHistory()).toEqual([])
  })

  it('still returns the new list when the write is refused', () => {
    // Quota exceeded, or a store that reads but will not write. The visitor keeps seeing the
    // check they just ran; it simply does not survive a reload. Dropping it from the screen as
    // well would be a worse answer to the same problem.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded') })
    const next = recordCheck(result({ url: 'https://nowrite.example/' }))
    expect(next.map(e => e.url)).toEqual(['https://nowrite.example/'])
  })

  it('does not throw when clearing an unavailable store', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => clearHistory()).not.toThrow()
  })
})

describe('clearing', () => {
  it('forgets everything on this device', () => {
    recordCheck(result({ url: 'https://a.example/' }))
    recordCheck(result({ url: 'https://b.example/' }))
    expect(readHistory()).toHaveLength(2)

    clearHistory()

    expect(readHistory()).toEqual([])
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull()
  })
})
