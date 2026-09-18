import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fixtures from '../../../shared/ccp/commerce-action-fixtures.json'
import { resolveActionLabel, actionLabel, actionTranslator } from '@/lib/recommendation/actionLabel'
import { handoffBodyFor } from '@/lib/recommendation/handoff'
import { parseHandoffBody } from '@/lib/ccp/handoffBody'
import { getProvider } from '@/lib/ccp/registry'
import { requestedProviderOf } from '@/lib/ai/tools/commerceIntent'
import { validateModelCtaBlock } from '@/lib/recommendation/ctaValidation'
import { parseCTA, parseFollowups } from '@/components/ChatInterface'
import { buildPlacesLiveView, type LiveAction } from '@/lib/recommendation/liveView'
import { buildRecommendations } from '@/lib/recommendation/recommendation'
import { unknownClaim, type CanonicalEntity } from '@/lib/recommendation/entity'
import type { Action } from '@/lib/recommendation/actions'
import { vi as viDict, en as enDict } from '@/lib/i18n/w5/placeDecision'
import type { SynthesisCommerceView } from '@/lib/ai/consultative/synthesisView'

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-PLATFORM CCP CONTRACT (14 Sep 2026) — the web half of a three-consumer fixture.
//
// `shared/ccp/commerce-action-fixtures.json` pins, per provider, the canonical Action the
// Commerce Capability Platform projects and what EVERY renderer must preserve from it. This file
// executes the canonical side: the label resolver decides the key the fixture records, the
// registry owns the host, the handoff body is what the endpoint accepts, the model's CTA block is
// validated server-side — and then reads the two native renderers to prove they can show every key
// the resolver can produce. Android and iOS execute the same fixture with their own decoders.
// ─────────────────────────────────────────────────────────────────────────────

type Case = (typeof fixtures.cases)[number]
const tVi = actionTranslator('vi')
const tEn = actionTranslator('en')
const hostOf = (u: string) => new URL(u).hostname.toLowerCase()
const asAction = (c: Case) => c.action as unknown as LiveAction

describe('every provider case: the canonical action survives unchanged', () => {
  it.each(fixtures.cases.map(c => [c.id, c] as const))('%s', (_id, c) => {
    const a = asAction(c)
    const entry = getProvider(c.expect.providerId)
    expect(entry, `${c.expect.providerId} must be a registry provider`).toBeTruthy()

    // The user named the merchant; the seam narrows the turn to it (the allow-list is canonical).
    expect(requestedProviderOf([c.userText])).toBe(c.requestedProviderId)

    // Provider · host · capability come from the registry, never from the model.
    expect(a.commerce?.providerId).toBe(c.expect.providerId)
    expect(entry!.allowedHosts.map(h => h.toLowerCase())).toContain(c.expect.host)
    expect(hostOf(a.url)).toBe(c.expect.host)
    expect(c.expect.forbiddenHosts).not.toContain(hostOf(a.url))
    expect(entry!.commerce).toContain(c.expect.capability)
    expect(a.commerce?.capability).toBe(c.expect.capability)
    for (const p of fixtures.retiredGrammars) expect(a.url.startsWith(p), `retired grammar ${p}`).toBe(false)
    for (const p of c.expect.params ?? []) expect(a.url).toContain(p)

    // Depth and the login boundary are the registry's for a DIRECT handoff; a search is L2 or the merchant's landing.
    const depth = (entry!.depth as Record<string, { guestDepth: number; authRequiredAt: string } | undefined>)[c.intentType]
    expect(depth).toBeTruthy()
    if (a.urlKind === 'direct') {
      expect(a.commerce?.guestDepth).toBe(depth!.guestDepth)
      expect(a.commerce?.authRequiredAt).toBe(depth!.authRequiredAt)
    } else {
      expect(a.commerce!.depth).toBeLessThanOrEqual(2)
    }
    expect(a.commerce?.depth).toBe(c.expect.depth)
    expect(a.commerce?.loginRequired).toBe(c.expect.loginRequired)
    if (c.expect.schedule) expect(a.commerce?.facts?.schedule).toEqual(c.expect.schedule)

    // The label DECISION is the resolver's, and the fixture carries it already resolved.
    expect(resolveActionLabel(a).key).toBe(c.expect.labelKey)
    expect(a.labelKey).toBe(c.expect.labelKey)
    expect(actionLabel(a, tVi)).toBe(c.expect.labelVi)
    expect(actionLabel(a, tEn)).toBe(c.expect.labelEn)

    // The handoff beacon carries the opaque ids and nothing else; the endpoint accepts it from every client.
    for (const platform of ['web', 'android', 'ios'] as const) {
      const body = handoffBodyFor(a, platform)
      expect(body).toEqual({ ...c.expect.handoffBody, platform })
      expect(parseHandoffBody(body)).toEqual({ ...c.expect.handoffBody, platform })
    }
  })

  it('TikTok Shop never resolves as Shopee (and no case leaks to a sibling merchant)', () => {
    for (const c of fixtures.cases) {
      const owner = getProvider(c.expect.providerId)!
      expect(owner.providerId).toBe(c.requestedProviderId)
      expect(owner.allowedHosts.map(h => h.toLowerCase())).toContain(hostOf(asAction(c).url))
    }
  })
})

describe('the live place view projects the RESOLVED key (the native contract)', () => {
  const commerceAction = (over: Partial<Action>): Action => ({
    kind: 'purchase', urlKind: 'direct', url: 'https://shop.tiktok.com/vn/pdp/iphone-16-pro-128gb/1730877187765799516', labelKey: 'v3.action.purchase', platform: 'TikTok Shop', priority: -1,
    commerce: { linkId: 'b2c3d4e5f60718293a4b5c6d', requestId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', providerId: 'tiktokshop', depth: 3, guestDepth: 3, authRequiredAt: 'before_checkout', loginRequired: true, handoff: 'merchant_login', freshnessType: 'static', expiresAt: null, tracked: false, capability: 'product_detail', primary: true },
    ...over,
  })
  const entity = (actions: Action[]): CanonicalEntity => ({
    v: 1, id: 'p1', domain: 'shopping', kind: 'place',
    identity: { name: 'iPhone 16 Pro', sourceRefs: [] },
    images: { primary: null, gallery: [] },
    location: { address: null, coordinates: null, distanceKm: null },
    quality: { rating: unknownClaim<number>(), ratingCount: unknownClaim<number>(), tappyRating: null, stars: null },
    pricing: { price: unknownClaim<number>(), priceRange: null, priceLevel: null, priceSignal: unknownClaim<string>() },
    availability: { openingHours: unknownClaim<string>(), openNow: null },
    attributes: {}, reviews: { actions: [], coverage: 'search' }, actions, provenance: {}, ext: {},
  } as unknown as CanonicalEntity)

  it('carries labelKey = the resolver key, the merchant as platform, and the commerce facts intact', () => {
    const recs = buildRecommendations([entity([commerceAction({})])], { rankedIds: ['p1'], shortlist: [{ rank: 0, id: 'p1', name: 'iPhone 16 Pro', role: 'best_overall' }], pickedId: 'p1', reasons: {}, tradeOffs: {} })
    const view = buildPlacesLiveView(recs)!
    const live = view.items[0].actions.find(a => a.commerce)!
    expect(live.labelKey).toBe('v3.action.purchaseLoginOn')
    expect(live.platform).toBe('TikTok Shop')
    expect(live.commerce).toMatchObject({ providerId: 'tiktokshop', depth: 3, loginRequired: true, handoff: 'merchant_login', capability: 'product_detail', linkId: 'b2c3d4e5f60718293a4b5c6d' })
    // A client that re-resolves (web) lands on the same key: the projection is idempotent.
    expect(resolveActionLabel(live).key).toBe(live.labelKey)
  })

  it('a search handoff on a login-walled merchant says so; a plain search does not', () => {
    const shopee = commerceAction({ urlKind: 'search', url: 'https://shopee.vn/search?keyword=iPhone', platform: 'Shopee', commerce: { ...commerceAction({}).commerce!, providerId: 'shopee', depth: 2, guestDepth: 2, authRequiredAt: 'before_selection', capability: 'product_discovery' } })
    const lazada = commerceAction({ urlKind: 'search', url: 'https://www.lazada.vn/catalog/?q=iPhone', platform: 'Lazada', commerce: { ...commerceAction({}).commerce!, providerId: 'lazada', depth: 2, guestDepth: 2, authRequiredAt: 'before_checkout', capability: 'product_discovery' } })
    expect(resolveActionLabel(shopee).key).toBe('v3.action.searchLoginOn')
    expect(resolveActionLabel(lazada).key).toBe('v3.action.searchOn')
  })
})

describe('the Shopping card view carries the same decision', () => {
  it.each(fixtures.shoppingCommerceViews.map(v => [v.id, v] as const))('%s', (_id, v) => {
    const view = v.view as unknown as SynthesisCommerceView
    const search = view.kind === 'SEARCH_HANDOFF'
    const action = { kind: 'purchase' as const, urlKind: search ? ('search' as const) : ('direct' as const), url: view.url, platform: view.merchantName, commerce: view }
    expect(resolveActionLabel(action).key).toBe(v.expect.labelKey)
    if (view.labelKey) expect(view.labelKey).toBe(v.expect.labelKey)
    expect(actionLabel(action, tVi)).toBe(v.expect.labelVi)
    expect(search).toBe(v.expect.isSearch)
    expect(hostOf(view.url)).toBe(v.expect.host)
  })
})

describe('the model\'s [CTA_BUTTONS] block is validated ONCE, on the server, for every client', () => {
  it.each(fixtures.modelCtaBlocks.map(b => [b.id, b] as const))('%s', (_id, b) => {
    const out = validateModelCtaBlock(b.input, tVi, b.requestedProviderId)
    const cta = parseCTA(out)
    const { text, followups } = parseFollowups(cta.text)
    for (const s of b.expectVisibleContains) expect(text).toContain(s)
    expect(cta.buttons.map(x => x.label)).toEqual(b.expectCtaLabels)
    expect(cta.buttons.map(x => hostOf(x.url))).toEqual(b.expectCtaHosts)
    for (const h of b.expectForbiddenHosts ?? []) expect(cta.buttons.some(x => hostOf(x.url) === h)).toBe(false)
    for (const u of b.expectForbiddenUrls ?? []) expect(cta.buttons.some(x => x.url === u)).toBe(false)
    expect(followups).toEqual(b.expectFollowups)
    // Re-emitted in the CLOSED form every parser accepts; the visible prose is untouched.
    expect(out).toContain('[CTA_BUTTONS]{')
    expect(out).toContain('[/CTA_BUTTONS]')
    expect(text).not.toContain('CTA_BUTTONS')
  })

  it('leaves text without a readable block exactly as it was', () => {
    expect(validateModelCtaBlock('Không có nút nào.', tVi, null)).toBe('Không có nút nào.')
    const partial = 'Đang gõ [CTA_BUTTONS]{"buttons":[{"label":"x"'
    expect(validateModelCtaBlock(partial, tVi, null)).toBe(partial)
  })

  it('removes the block entirely when nothing survives (the prose stays)', () => {
    const out = validateModelCtaBlock('Xin lỗi, chưa có.\n\n[CTA_BUTTONS]{"buttons":[{"label":"🛒 Shopee","type":"search","url":"https://shopee.vn/search?keyword=x"}]}', tVi, 'tiktokshop')
    expect(out).toBe('Xin lỗi, chưa có.')
  })
})

// ── The native renderers: every key the resolver can produce has a home on each client ──
const root = process.cwd()
const read = (p: string) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n?/g, '\n')
const ANDROID_CARD = 'android/app/src/main/java/com/tappyai/app/chat/PlaceCard.kt'
const ANDROID_LABELS = 'android/app/src/main/java/com/tappyai/app/chat/CommerceActionLabel.kt'
const ANDROID_STRINGS_EN = 'android/app/src/main/res/values/strings_chat.xml'
const ANDROID_STRINGS_VI = 'android/app/src/main/res/values-vi/strings_chat.xml'
const IOS_CARD = 'ios/TappyAI/Features/Chat/UI/PlaceCardView.swift'
const IOS_LABELS = 'ios/TappyAI/Features/Chat/Model/CommerceActionLabel.swift'
const IOS_STRINGS = 'ios/TappyAI/Resources/Localizable.xcstrings'

/** `v3.action.purchaseLoginOn` → `purchaseLoginOn` (what both native switches match on). */
const leaf = (key: string) => key.slice('v3.action.'.length)
/** The Android resource name the contract assigns to a key. */
const androidRes = (key: string) => 'place_action_' + leaf(key).replace(/[A-Z]/g, ch => '_' + ch.toLowerCase())
/** The iOS catalogue key the contract assigns to a key. */
const iosKey = (key: string) => 'place.action.' + leaf(key)

describe('the resolver cannot produce a key the fixture does not list', () => {
  it('every v3.action key in actionLabel.ts (including the ${key}On / LoginOn / AppOn expansions) is a listed commerce key or a plain place action', () => {
    const src = read('src/lib/recommendation/actionLabel.ts')
    const plain = new Set(['v3.action.maps', 'v3.action.directions', 'v3.action.website', 'v3.action.call', 'v3.action.social', 'v3.action.review', 'v3.action.reviewOn', 'v3.action.reviewSearch', 'v3.action.reviewSearchGeneric'])
    const listed = new Set(fixtures.commerceLabelKeys)
    const literal = [...src.matchAll(/'(v3\.action\.[A-Za-z]+)'/g)].map(m => m[1])
    for (const k of literal) expect(plain.has(k) || listed.has(k), `${k} is not a listed commerce key`).toBe(true)
    // COMMERCE_LABEL bases × the three suffixes the resolver appends.
    const bases = [...src.matchAll(/^\s+(\w+): '(v3\.action\.\w+)',$/gm)].map(m => m[2])
    expect(bases.length).toBeGreaterThan(0)
    for (const b of bases) for (const s of ['', 'On', 'LoginOn', 'AppOn']) expect(listed.has(b + s), `${b + s} is not a listed commerce key`).toBe(true)
  })

  it('the web dictionaries carry every listed key in both languages', () => {
    for (const k of fixtures.commerceLabelKeys) {
      expect((viDict as Record<string, string>)[k], `vi ${k}`).toBeTruthy()
      expect((enDict as Record<string, string>)[k], `en ${k}`).toBeTruthy()
    }
  })
})

describe('Android renders every listed key from the wire (no re-derivation)', () => {
  const labels = read(ANDROID_LABELS)
  const en = read(ANDROID_STRINGS_EN)
  const vi = read(ANDROID_STRINGS_VI)
  it('the label resolver maps every listed key to a resource', () => {
    for (const k of fixtures.commerceLabelKeys) {
      expect(labels, `PlaceCard label switch lacks "${leaf(k)}"`).toContain(`"${leaf(k)}"`)
      expect(labels, `no resource for ${k}`).toContain(`R.string.${androidRes(k)}`)
    }
  })
  it('both string catalogues carry the resource, and the Vietnamese one says what web says', () => {
    for (const k of fixtures.commerceLabelKeys) {
      const res = androidRes(k)
      expect(en, `values/strings_chat.xml lacks ${res}`).toMatch(new RegExp(`<string name="${res}">`))
      const m = vi.match(new RegExp(`<string name="${res}">([^<]*)</string>`))
      expect(m, `values-vi/strings_chat.xml lacks ${res}`).toBeTruthy()
      const webVi = (viDict as Record<string, string>)[k].replace('{platform}', '%1$s')
      expect(m![1].replace(/\\'/g, "'"), `${res} differs from web`).toBe(webVi)
    }
  })
  it('the card reads the commerce facts and reports the handoff with the opaque ids on tap', () => {
    const card = read(ANDROID_CARD)
    // Every button opens through the ONE function that reports a commerce handoff; the lead
    // action, the ordering group and the secondary group all route through it.
    expect(card).toContain('openPlaceAction(context, lead, commerce)')
    expect(card).toContain('openPlaceAction(context, a, commerce)')
    expect(card).not.toMatch(/onClick = \{ openUrl\(context, a\.url\) \}/)
    expect(card).toContain('callbacks.onHandoff(it, opened)')
    expect(read('android/app/src/main/java/com/tappyai/app/chat/PlacesLiveView.kt')).toContain('val commerce: LiveCommerceFacts? = null')
    const reporter = read('android/app/src/main/java/com/tappyai/app/chat/data/CommerceHandoffReporter.kt')
    expect(reporter).toContain('api/commerce/handoff')
    expect(reporter).toContain('platform = "android"')
    // Never the URL, never the user.
    expect(reporter).not.toMatch(/val url\b/)
  })
})

describe('iOS renders every listed key from the wire (no re-derivation)', () => {
  const labels = read(IOS_LABELS)
  const strings = JSON.parse(read(IOS_STRINGS)) as { strings: Record<string, { localizations?: Record<string, { stringUnit?: { value?: string } }> }> }
  it('the label resolver maps every listed key to a catalogue entry', () => {
    for (const k of fixtures.commerceLabelKeys) {
      // Platform keys are interpolated ("place.action.(leaf)"); plain keys are listed by their catalogue entry.
      expect(labels, `CommerceActionLabel.swift lacks "${leaf(k)}"`).toContain(`"${leaf(k)}"`)
    }
  })
  it('the catalogue carries vi + en for every key, and the Vietnamese one says what web says', () => {
    for (const k of fixtures.commerceLabelKeys) {
      const entry = strings.strings[iosKey(k)]
      expect(entry, `Localizable.xcstrings lacks ${iosKey(k)}`).toBeTruthy()
      const viValue = entry.localizations?.vi?.stringUnit?.value
      expect(entry.localizations?.en?.stringUnit?.value, `en ${iosKey(k)}`).toBeTruthy()
      expect(viValue, `${iosKey(k)} differs from web`).toBe((viDict as Record<string, string>)[k].replace('{platform}', '%@'))
    }
  })
  it('the card reads the commerce facts and reports the handoff with the opaque ids on tap', () => {
    expect(read(IOS_CARD)).toContain('CommerceHandoffReporter')
    expect(read('ios/TappyAI/Features/Chat/Model/PlacesModels.swift')).toContain('var commerce: LiveCommerceFacts?')
    const reporter = read('ios/TappyAI/Features/Chat/Model/CommerceHandoffReporter.swift')
    expect(reporter).toContain('/api/commerce/handoff')
    expect(reporter).toContain('platform: "ios"')
  })
})
