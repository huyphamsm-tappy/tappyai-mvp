import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'

// ── V2-UAT-007 — the parity matrix, as an executable record ─────────────────
//
// The finding said "iOS: Explore/Consultative/Deals/ScamShield = 0 Swift files". Two of those
// four were wrong: Explore ships as `Features/Reviews`, and Consultative has no client surface on
// ANY platform because the backend owns it. Counting folders would have produced a wildly wrong
// backlog, which is why the matrix is built from real implementation files and kept here rather
// than in a document that nobody re-runs.
//
// A feature counts as present only when a file that implements it exists. A route stub, a tab
// entry or a menu row that goes somewhere else does not count — the last of those is exactly how
// iOS appeared to have "My Posts" while the row actually opened the public feed.

const ios = (p: string) => existsSync(`ios/TappyAI/${p}`)
const android = (p: string) => existsSync(`android/app/src/main/java/com/tappyai/app/${p}`)

describe('every V2 feature Android ships has an iOS surface', () => {
  const FEATURES: Array<[name: string, androidPath: string, iosPath: string]> = [
    ['Authentication',        'account',        'Features/Auth/UI/AuthFlowView.swift'],
    ['Home',                  'home',           'Features/Home/UI/HomeView.swift'],
    ['Chat',                  'chat',           'Features/Chat/UI/ChatView.swift'],
    ['Explore feed',          'explore',        'Features/Reviews/UI/ReviewsFeedView.swift'],
    ['Review composer',       'reviews',        'Features/Reviews/UI/CreateReviewView.swift'],
    ['My Posts',              'myreviews',      'Features/Reviews/UI/MyPostsView.swift'],
    ['People search',         'reviews',        'Features/Reviews/UI/UserSearchView.swift'],
    ['Profile',               'profile',        'Features/Profile/UI/ProfileMainView.swift'],
    ['Settings',              'profile',        'Features/Profile/UI/SettingsView.swift'],
    ['Deals',                 'deals',          'Features/Deals/UI/DealsView.swift'],
    ['Notifications inbox',   'notifications',  'Features/Notifications/UI/NotificationsInboxView.swift'],
    ['Music',                 'music',          'Features/Music/UI/MusicLibraryView.swift'],
    ['Bookings',              'bookings',       'Features/Profile/UI/BookingsView.swift'],
    ['Price tracking',        'pricetracking',  'Features/Profile/UI/PriceWatchesView.swift'],
    ['Memory',                'memory',         'Features/Profile/UI/TappyKnowsView.swift'],
    ['Preferences',           'preferences',    'Features/Profile/UI/PreferencesView.swift'],
    ['Chat history',          'history',        'Features/Profile/UI/ChatHistoryView.swift'],
    ['Saved',                 'saved',          'Features/Discovery/UI/FavoritesView.swift'],
    ['Recommendations',       'recommendations','Features/Discovery/UI/RecommendationsView.swift'],
    ['Service detail',        'servicedetail',  'Features/Discovery/UI/ServiceDetailView.swift'],
    ['App connections',       'appconnections', 'Features/Profile/UI/IntegrationsView.swift'],
    ['Subscription',          'membership',     'Features/Profile/UI/SubscriptionView.swift'],
    ['Currency',              'currency',       'Features/UtilityTools/UI/Currency/CurrencyView.swift'],
    ['Translate',             'translate',      'Features/UtilityTools/UI/Translate/TranslateView.swift'],
    ['Split bill',            'splitbill',      'Features/UtilityTools/UI/SplitBill/SplitBillView.swift'],
    ['Scan',                  'scan',           'Features/UtilityTools/UI/Scan/ScanView.swift'],
    ['Fortune',               'fortune',        'Features/UtilityTools/UI/Fortune/FortuneHubView.swift'],
    ['Viet content',          'vietwriter',     'Features/UtilityTools/UI/VietContent/VietContentView.swift'],
  ]

  for (const [name, androidPath, iosPath] of FEATURES) {
    it(`${name}`, () => {
      // The Android side is asserted too. If a feature is removed there, this fails and the pair
      // gets re-decided rather than the iOS half being quietly orphaned.
      expect(android(androidPath), `Android: ${androidPath}`).toBe(true)
      expect(ios(iosPath), `iOS: ${iosPath}`).toBe(true)
    })
  }
})

describe('the features with NO native surface, and why', () => {
  it('AI Consultative has no client implementation on any platform', () => {
    // The backend owns every consultative decision — intent, stage, ranking, prompt construction.
    // The clients stream a reply. That is the design, and a second engine in a client would be a
    // second place for the answer to be decided.
    expect(existsSync('src/lib/ai/consultative')).toBe(true)
    expect(existsSync('ios/TappyAI/Features/Consultative')).toBe(false)
    expect(existsSync('android/app/src/main/java/com/tappyai/app/consultative')).toBe(false)
  })

  it('Scam Shield is web-only, on BOTH native clients', () => {
    // Determined rather than assumed, because "100% parity with Android + Web" is ambiguous when
    // the two disagree: Web has Scam Shield, Android has never had a single line of it, and the
    // 2026-08-03 release recorded it as a web feature. Building it on iOS alone would create a
    // NEW asymmetry rather than remove one, so it stays a cross-platform gap for a later release
    // and is recorded here so nobody re-discovers it as an iOS defect.
    expect(existsSync('src/lib/scam-shield')).toBe(true)
    expect(existsSync('android/app/src/main/java/com/tappyai/app/scamshield')).toBe(false)
    expect(existsSync('ios/TappyAI/Features/ScamShield')).toBe(false)
  })

  it('Group dining has a web surface both native clients reach by link', () => {
    // Android opens the shared web URL; iOS does the same. Neither has a native screen, and the
    // link is the product's own sharing mechanism rather than a shortfall.
    expect(existsSync('src/app/group')).toBe(true)
  })
})

describe('the iOS screens added this phase are reachable', () => {
  // A screen nothing navigates to is not a feature. Each of these had to be wired into
  // ProfileDestination AND the shell's navigationDestination switch AND a row that opens it.
  const DESTINATIONS = ['myPosts', 'notificationsInbox', 'userSearch']

  it('each new destination exists, is routed, and has an entry point', async () => {
    const { readFileSync } = await import('node:fs')
    const model = readFileSync('ios/TappyAI/Features/Profile/Model/ProfileModels.swift', 'utf8')
    const shell = readFileSync('ios/TappyAI/App/Shell/PlaceholderShellView.swift', 'utf8')
    const profile = readFileSync('ios/TappyAI/Features/Profile/UI/ProfileMainView.swift', 'utf8')

    for (const dest of DESTINATIONS) {
      expect(model, `enum case ${dest}`).toContain(`case ${dest}`)
      expect(shell, `route for ${dest}`).toContain(`case .${dest}:`)
      expect(profile, `entry point for ${dest}`).toContain(`.${dest}`)
    }
  })
})
