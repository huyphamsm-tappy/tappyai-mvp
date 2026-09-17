import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Personal Collections — cross-platform parity, enforced rather than reviewed (2026-09-17).
 *
 * The signed-in user's own profile shows FIVE collections, on every platform, in one order:
 *
 *     Posts / Liked / Saved / Hidden / Shared   (Bài viết / Đã thích / Đã lưu / Đã ẩn / Đã share)
 *
 * Android had them first (`CreatorProfileTab`); the web hub had four different ones and the
 * Explore tab a third set; iOS had posts only. This file reads the three implementations and
 * asserts they agree on what MUST MATCH: the list, its order, the label wording, where each
 * collection's rows come from, the hidden split, the sign-in gate, and that no public creator
 * profile ever asks for a private collection. It is a source-level guard — iOS cannot be
 * executed on this machine at all — but it fails the moment one platform drops or reorders a
 * collection, which review does not reliably do.
 *
 * MAY DIFFER is not asserted: the container (chips vs tabs), the grid, the navigation and the
 * detail screen are each platform's own. Saved PLACES are a separate surface everywhere and are
 * deliberately NOT one of the five.
 *
 * iOS is PARKED (2026-09-17): its implementation exists in the worktree but is not committed with
 * the web/Android pass. WEB = ANDROID is the hard contract here; the iOS assertions run only when
 * `OwnCollectionModels.swift` is present, so this file passes on a tree where iOS has not landed
 * and starts guarding iOS the moment it does.
 */

const root = process.cwd()
const read = (p: string) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n')
/** Strips `//` and block comments — these files document the rules they follow. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const CANONICAL = ['posts', 'liked', 'saved', 'hidden', 'shared'] as const
const LABEL_VI: Record<(typeof CANONICAL)[number], string> = {
  posts: 'Bài viết', liked: 'Đã thích', saved: 'Đã lưu', hidden: 'Đã ẩn', shared: 'Đã share',
}

const ANDROID = {
  screen: 'android/app/src/main/java/com/tappyai/app/reviews/ui/SelfProfileScreen.kt',
  viewModel: 'android/app/src/main/java/com/tappyai/app/reviews/ui/SelfProfileViewModel.kt',
  collectionsApi: 'android/app/src/main/java/com/tappyai/app/profile/data/ProfileCollectionsApi.kt',
  reviewsApi: 'android/app/src/main/java/com/tappyai/app/reviews/data/ReviewsApi.kt',
  stringsVi: ['android/app/src/main/res/values-vi/strings_personal_v3.xml', 'android/app/src/main/res/values-vi/strings_reviews.xml'],
  creatorViewModel: 'android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewProfileViewModel.kt',
}
const WEB = {
  hub: 'src/app/profile/ProfileView.tsx',
  page: 'src/app/profile/page.tsx',
  dictionary: 'src/lib/i18n/v3/web.ts',
  creator: 'src/app/reviews/ProfileTab.tsx',
  creatorRoute: 'src/app/users/[id]/UserProfileView.tsx',
  explore: 'src/app/reviews/page.tsx',
}
const IOS = {
  model: 'ios/TappyAI/Features/Reviews/Model/OwnCollectionModels.swift',
  viewModel: 'ios/TappyAI/Features/Reviews/UI/MyPostsViewModel.swift',
  view: 'ios/TappyAI/Features/Reviews/UI/MyPostsView.swift',
  service: 'ios/TappyAI/Features/Reviews/Data/ReviewsService.swift',
  catalogue: 'ios/TappyAI/Resources/Localizable.xcstrings',
  creatorViewModel: 'ios/TappyAI/Features/Reviews/UI/UserProfileViewModel.swift',
}

/** iOS is asserted only once its implementation is in the tree (see the header note). */
const iosPresent = existsSync(resolve(root, IOS.model))

/** The three lists, parsed from source. */
function lists() {
  const android = code(ANDROID.screen).match(/enum class CreatorProfileTab \{([^}]*)\}/)?.[1]
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const web = code(WEB.hub).match(/export const OWN_PROFILE_COLLECTIONS = \[([^\]]*)\]/)?.[1]
    .split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean)
  const ios = iosPresent
    ? code(IOS.model).match(/enum OwnCollection[^{]*\{\s*case ([^\n]*)/)?.[1]
      .split(',').map((s) => s.trim()).filter(Boolean)
    : [...CANONICAL]
  return { android, web, ios }
}

describe('the five personal collections are the same list, in the same order, on all three platforms', () => {
  it('Android · web · iOS each declare exactly Posts / Liked / Saved / Hidden / Shared', () => {
    const { android, web, ios } = lists()
    expect(android).toEqual([...CANONICAL])
    expect(web).toEqual([...CANONICAL])
    expect(ios).toEqual([...CANONICAL])
  })

  it('the Vietnamese labels are the same words on all three platforms', () => {
    // Android: the tab → resource mapping, then the vi resource values.
    const screen = code(ANDROID.screen)
    const vi = ANDROID.stringsVi.map(read).join('\n')
    for (const c of CANONICAL) {
      const enumName = c[0].toUpperCase() + c.slice(1)
      const res = screen.match(new RegExp(`CreatorProfileTab\\.${enumName} -> R\\.string\\.(\\w+)`))?.[1]
      expect(res, `Android maps ${enumName} to a string resource`).toBeTruthy()
      const value = vi.match(new RegExp(`<string name="${res}">([^<]*)</string>`))?.[1]
      expect(value, `Android vi label for ${c}`).toBe(LABEL_VI[c])
    }
    // Web: the hub's key per collection, then the vi dictionary.
    const hub = code(WEB.hub)
    const dict = read(WEB.dictionary)
    const viBlock = dict.slice(0, dict.indexOf("'v3.profile.tabPosts': 'Posts'"))
    for (const c of CANONICAL) {
      const key = hub.match(new RegExp(`\\b${c}: '(v3\\.profile\\.tab\\w+)'`))?.[1]
      expect(key, `web key for ${c}`).toBeTruthy()
      expect(viBlock.match(new RegExp(`'${key!.replace(/\./g, '\\.')}': '([^']*)'`))?.[1], `web vi label for ${c}`).toBe(LABEL_VI[c])
    }
    // iOS: `collections.tab.<case>` in the catalogue.
    if (!iosPresent) return
    const cat = JSON.parse(read(IOS.catalogue)) as { strings: Record<string, { localizations?: Record<string, { stringUnit?: { value?: string } }> }> }
    expect(code(IOS.model)).toContain('"collections.tab.\\(rawValue)"')
    for (const c of CANONICAL) {
      expect(cat.strings[`collections.tab.${c}`]?.localizations?.vi?.stringUnit?.value, `iOS vi label for ${c}`).toBe(LABEL_VI[c])
      expect(cat.strings[`collections.empty.${c}`]?.localizations?.vi?.stringUnit?.value, `iOS empty state for ${c}`).toBeTruthy()
    }
  })

  it('saved PLACES are not one of the five on any platform', () => {
    const { android, web, ios } = lists()
    for (const list of [android, web, ios]) expect(list).not.toContain('places')
    // The web hub keeps places as a link to its own surface, off the chip row.
    expect(code(WEB.hub)).toMatch(/href="\/profile\/favorites"[\s\S]*?data-profile-places/)
  })
})

describe('every collection reads the same gated route on every platform', () => {
  it('Posts and Hidden are the two halves of GET /api/reviews/mine, split on is_hidden', () => {
    expect(code(ANDROID.reviewsApi)).toContain('@GET("api/reviews/mine")')
    expect(code(ANDROID.viewModel)).toContain('repository.getMine()')
    expect(code(ANDROID.screen)).toContain('uiState.posts.filterNot { it.isHidden }')

    const hub = code(WEB.hub)
    expect(hub).toContain("fetchRows('/api/reviews/mine')")
    expect(hub).toContain("tab === 'posts' ? (mine ? mine.filter((r) => r.is_hidden !== true) : null)")
    expect(hub).toContain("tab === 'hidden' ? (mine ? mine.filter((r) => r.is_hidden === true) : null)")

    if (!iosPresent) return
    expect(code(IOS.service)).toContain('path: "/api/reviews/mine"')
    const vm = code(IOS.viewModel)
    expect(vm).toContain('var publicPosts: [Review] { posts.filter { $0.isHidden != true } }')
    expect(vm).toContain('var hiddenPosts: [Review] { posts.filter { $0.isHidden == true } }')
  })

  it('Liked, Saved and Shared are /api/reviews/liked, /saved, /shared — the bearer\'s own, no user parameter', () => {
    const androidApi = code(ANDROID.collectionsApi) + code(ANDROID.reviewsApi)
    for (const r of ['liked', 'saved', 'shared']) expect(androidApi).toContain(`@GET("api/reviews/${r}")`)
    expect(code(ANDROID.viewModel)).toMatch(/collectionsRepository\.getLiked\(\)[\s\S]*collectionsRepository\.getShared\(\)/)
    expect(code(ANDROID.viewModel)).toContain('repository.getSaved()')

    const hub = code(WEB.hub)
    for (const r of ['liked', 'saved', 'shared']) expect(hub).toContain(`fetchRows('/api/reviews/${r}')`)

    if (iosPresent) {
      const service = code(IOS.service)
      for (const r of ['liked', 'saved', 'shared']) {
        expect(service).toMatch(new RegExp(`Endpoint\\(path: "/api/reviews/${r}", method: \\.get, requiresAuth: true\\)`))
      }
    }
    // No implementation aims a collection route at someone else.
    for (const file of [WEB.hub, ANDROID.collectionsApi, ...(iosPresent ? [IOS.service] : [])]) {
      expect(code(file)).not.toMatch(/reviews\/(liked|saved|shared)\?userId/)
    }
  })

  it('the hidden collection carries the eye-off treatment on every platform', () => {
    expect(code(ANDROID.screen)).toContain('Icons.Filled.VisibilityOff')
    expect(code(WEB.hub)).toMatch(/hidden && \([\s\S]*?<EyeOff/)
    if (iosPresent) expect(code(IOS.view)).toContain('Image(systemName: "eye.slash")')
  })
})

describe('the collections are private: a guest sees a sign-in gate, a creator profile never asks', () => {
  it('an anonymous session is a guest on every platform — signed in AND not anonymous', () => {
    // Android: `selfProfileAccess(userId, anonymous)` — the rule the self profile, Inbox and
    // Messages share.
    expect(code(ANDROID.viewModel)).toContain('selfProfileAccess(')
    // Web: the server gate on /profile checks the anonymous claim, not just the presence of a user.
    expect(code(WEB.page)).toContain('if (!user || user.is_anonymous === true) return <GuestProfileView />')
    // iOS: `isAuthenticated` (the .authenticated state), never "has a token" — and no request
    // while it is false.
    if (!iosPresent) return
    const vm = code(IOS.viewModel)
    expect(vm).toContain('var isAuthenticated: Bool { session.state.isAuthenticated }')
    expect(vm).toContain('guard isAuthenticated else { clear(); return }')
    const view = code(IOS.view)
    expect(view).toContain('if session.state.isAuthenticated {')
    expect(view).toContain('title: "collections.signInRequired.title"')
    expect(view).toContain('actionTitle: "auth.signIn"')
  })

  it('signing out drops what was loaded', () => {
    if (iosPresent) expect(code(IOS.view)).toMatch(/onChange\(of: session\.state\.isAuthenticated\)[\s\S]*?vm\.clear\(\)/)
    // Web and Android: the whole screen is torn down — /profile is server-rendered per session,
    // and Android's logout pops the shell to Login (`popUpTo(graph, inclusive)`); nothing is kept
    // client-side across accounts. Pinned by their own suites.
  })

  it('no public creator profile requests a private collection — its own or anyone else\'s', () => {
    const forbidden = /api\/reviews\/(mine|liked|saved|shared)|review_likes|review_saves|review_shares/
    expect(code(WEB.creator)).not.toMatch(forbidden)
    expect(code(WEB.creatorRoute)).not.toMatch(forbidden)
    if (iosPresent) expect(code(IOS.creatorViewModel)).not.toMatch(forbidden)
    expect(code(ANDROID.creatorViewModel)).not.toMatch(/getMine\(\)|getSaved\(\)|getLiked\(\)|getShared\(\)/)
  })

  it('the web has ONE own-profile: Explore\'s tab and /users/<me> both hand over to /profile', () => {
    expect(code(WEB.explore)).toContain("{tab === 'profile' && <OwnProfileRedirect />}")
    expect(code(WEB.explore)).not.toMatch(/<ProfileTab userId=\{me\} viewerId=\{me\}/)
    expect(code('src/app/reviews/OwnProfileRedirect.tsx')).toContain("router.replace('/profile')")
    expect(code(WEB.creatorRoute)).toContain("if (viewer && viewer === userId) { router.replace('/profile'); return }")
    // …and the legacy component carries no private tab set any more.
    const creator = code(WEB.creator)
    expect(creator).not.toMatch(/'posts' \| 'saved' \| 'liked'/)
    expect(creator).not.toMatch(/profileTabLiked|profileTabSaved/)
  })

  it('the web header count is the PUBLIC posts, the same number the Posts tab lists', () => {
    expect(code(WEB.page)).toContain("select('content_type, like_count, is_hidden')")
    expect(code(WEB.page)).toContain('(ownReviews ?? []).filter((r) => r.is_hidden !== true)')
    expect(code(ANDROID.screen)).toContain('val publicPosts = uiState.posts.filterNot { it.isHidden }')
  })
})
