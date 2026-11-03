import { describe, it, expect } from 'vitest'

// ── Gate 2 S5: the pieces that are new in this round (gate2/s5/S5-ADDENDUM.md) ──
//
// ST-0: `isUserDerived` — a model keyword is used in a server-built search URL only when every one of its folded tokens is in
// the user's own words or a slot code extracted from them (strict subset; one shared word is NOT enough — the Luna intent check
// that keeps a value on a single overlap is exactly what this must not be).
// ST-8: Google Shopping is a registry template in its own list (searchEngineTemplates), not in the marketplace list.
// ST-10: a server-built link is recorded as a grant only on its expected host (SERVER_BUILT_FIELDS / serverBuiltAllowed).
// These modules / exports do not exist before the fix, so this file cannot load at Step 0 — by design, kept apart from the
// other S5 tests so their Step 0 result is not masked.

import { foldKeyword, isUserDerived } from './searchKeyword'
import { searchEngineTemplates } from '@/lib/ccp/searchEngines'
import { marketplaceSearchTemplates } from '@/lib/ccp/adapters/marketplace'
import { searchTemplates } from '@/lib/ccp/adapters'
import { SERVER_BUILT_FIELDS, serverBuiltAllowed } from './urlGrants'

describe('ST-0 — isUserDerived (strict token subset, folded)', () => {
  it('folds diacritics, đ, case, hyphens and punctuation', () => {
    expect(foldKeyword('Quán Phở  ĐẶC-BIỆT, ngon!')).toBe('quan pho dac biet ngon')
    expect(foldKeyword('Sony WH-1000XM5')).toBe('sony wh 1000xm5')
  })
  it('a keyword whose every token the user said is allowed', () => {
    expect(isUserDerived('Tai nghe Sony WH-1000XM5', ['mua tai nghe sony wh-1000xm5 ở đâu'])).toBe(true)
    expect(isUserDerived('quan pho', ['Tìm quán phở gần đây'])).toBe(true)
    expect(isUserDerived('máy lọc nước Kangaroo', ['Máy lọc nước Kangaroo giá bao nhiêu, mua ở đâu?'])).toBe(true)
  })
  it('tokens may come from several sources together (user text + a code slot)', () => {
    expect(isUserDerived('phở Quận 3', ['quán phở ngon', 'Quận 3'])).toBe(true)
  })
  it('one extra token the user never said is enough to refuse', () => {
    expect(isUserDerived('tai nghe giá rẻ nhất shopee', ['mua tai nghe sony wh-1000xm5 ở đâu'])).toBe(false)
    expect(isUserDerived('quán bar thoát y', ['quán phở'])).toBe(false)
    expect(isUserDerived('quán', ['đặt bàn nhà hàng tối nay'])).toBe(false)
  })
  it('a single shared word is not a match (unlike the Luna intent check)', () => {
    expect(isUserDerived('cà phê sách yên tĩnh', ['tìm quán cà phê'])).toBe(false)
  })
  it('an empty or missing keyword is never user-derived; missing sources are ignored', () => {
    expect(isUserDerived('', ['quán phở'])).toBe(false)
    expect(isUserDerived('   ', ['quán phở'])).toBe(false)
    expect(isUserDerived(null, ['quán phở'])).toBe(false)
    expect(isUserDerived('phở', [null, undefined, '', 'phở bò'])).toBe(true)
  })
  it('matching is by whole token, not substring', () => {
    expect(isUserDerived('pho', ['phong khách'])).toBe(false)
  })
})

describe('ST-8 — Google Shopping comes from the registry, in its own list', () => {
  it('searchEngineTemplates holds the Google Shopping template', () => {
    expect(searchEngineTemplates()).toEqual([{ providerId: 'google_shopping', name: 'Google Mua sắm', template: 'https://www.google.com/search?tbm=shop&q={q}' }])
  })
  it('the marketplace list and searchTemplates() are unchanged (no Google entry)', () => {
    expect(marketplaceSearchTemplates().some(t => /google/i.test(t.providerId) || /google\./i.test(t.template))).toBe(false)
    expect(searchTemplates().some(t => t.providerId === 'google_shopping')).toBe(false)
  })
})

describe('ST-10 — server-built links are recorded only on their expected host', () => {
  it('names the server-built fields', () => {
    expect([...SERVER_BUILT_FIELDS].sort()).toEqual(['server:card-directions', 'server:card-search', 'server:directions', 'server:search:'].sort())
  })
  it('directions: www.google.com/maps/… only', () => {
    expect(serverBuiltAllowed('server:directions', 'https://www.google.com/maps/dir/?api=1&destination=Ph%E1%BB%9F%20L%E1%BB%87')).toBe(true)
    expect(serverBuiltAllowed('server:directions', 'https://evil.example/maps/dir/?api=1&destination=x')).toBe(false)
    expect(serverBuiltAllowed('server:directions', 'https://www.google.com/search?q=x')).toBe(false)
  })
  it('search:<provider>: the host of that provider’s registry template only', () => {
    expect(serverBuiltAllowed('server:search:google_shopping', 'https://www.google.com/search?tbm=shop&q=tai%20nghe')).toBe(true)
    expect(serverBuiltAllowed('server:search:lazada', 'https://www.lazada.vn/catalog/?q=tai%20nghe')).toBe(true)
    expect(serverBuiltAllowed('server:search:lazada', 'https://evil.example/catalog/?q=tai%20nghe')).toBe(false)
    expect(serverBuiltAllowed('server:search:unknown_provider', 'https://www.google.com/search?q=x')).toBe(false)
  })
  it('card search / directions: registry hosts, Google Maps and YouTube only', () => {
    expect(serverBuiltAllowed('server:card-search', 'https://www.youtube.com/results?search_query=Ph%E1%BB%9F%20L%E1%BB%87%20review')).toBe(true)
    expect(serverBuiltAllowed('server:card-directions', 'https://www.google.com/maps/dir/?api=1&destination=x')).toBe(true)
    expect(serverBuiltAllowed('server:card-search', 'https://evil.example/s?q=x')).toBe(false)
  })
  it('an unknown field is never allowed', () => {
    expect(serverBuiltAllowed('server:anything', 'https://www.google.com/maps/dir/?api=1')).toBe(false)
  })
})
