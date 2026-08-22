import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The four iOS screens the V2 parity audit found MISSING — review detail, public profile, native
 * group dining, copyright policy — plus the navigation that reaches them.
 *
 * ============================================================================
 * WHAT THIS CAN AND CANNOT PROVE
 * ============================================================================
 * There is no Mac and CI runs no Xcode. Nothing here compiles Swift, so the evidence level is
 * SOURCE and the report says so. What a source check CAN hold is precisely the class of defect
 * that produced this gap in the first place, and every assertion below is aimed at one:
 *
 *   • a screen that exists but nothing references (Deals shipped as "Coming soon" that way)
 *   • a navigation destination declared and never registered
 *   • a tap handler wired to `{}` or to a constant that ignores its argument
 *   • a "feature" that is a link out of the app
 *   • a key the code asks for that the catalogue does not have
 *
 * None of those is visible at runtime until a user walks into it, and all of them are visible here.
 */

const IOS = 'ios/TappyAI'
const SHELL = `${IOS}/App/Shell/PlaceholderShellView.swift`
const ROUTER = `${IOS}/Core/Navigation/AppRouter.swift`
const DEEPLINK = `${IOS}/Core/Navigation/DeepLinkHandler.swift`
const read = (p: string) => readFileSync(p, 'utf8')

/**
 * Source with comments stripped.
 *
 * 🚨 Load-bearing, and learned the hard way: each fix left a comment quoting the construct it
 * removed, so a raw-text guard passes on its own explanation. Three guards went green that way
 * while proving nothing.
 */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function swiftFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) swiftFiles(p, out)
    else if (entry.endsWith('.swift')) out.push(p)
  }
  return out
}

/** Files that mention `name` other than the file that declares it. */
function referencesTo(name: string, declaringFile: string): string[] {
  return swiftFiles(IOS).filter((f) => !f.endsWith(declaringFile) && read(f).includes(name))
}

const SCREENS = [
  { view: 'ReviewDetailView', file: `${IOS}/Features/Reviews/UI/ReviewDetailView.swift` },
  { view: 'UserProfileView', file: `${IOS}/Features/Reviews/UI/UserProfileView.swift` },
  { view: 'GroupDiningView', file: `${IOS}/Features/GroupDining/UI/GroupDiningView.swift` },
  { view: 'GroupDetailView', file: `${IOS}/Features/GroupDining/UI/GroupDetailView.swift` },
  { view: 'CopyrightPolicyView', file: `${IOS}/Features/Music/UI/CopyrightPolicyView.swift` },
]

describe('the four missing iOS screens exist', () => {
  for (const { view, file } of SCREENS) {
    it(`${view} is a real SwiftUI view`, () => {
      expect(existsSync(file), `${file} does not exist`).toBe(true)
      const src = code(file)
      expect(src, `${view} is not declared`).toMatch(new RegExp(`struct ${view}\\s*:\\s*View`))
      expect(src, `${view} has no body`).toMatch(/var body: some View/)
    })

    it(`${view} is referenced by something`, () => {
      // The check that would have caught Deals: a screen nothing mentions is a screen nobody ships.
      expect(referencesTo(view, `${view}.swift`).length, `${view} is dead code`).toBeGreaterThan(0)
    })
  }
})

describe('every ReviewsDestination case is registered in the shell', () => {
  const DEST = `${IOS}/Features/Reviews/Model/ReviewsDestination.swift`

  it('the destination enum is registered at all', () => {
    expect(code(SHELL)).toMatch(/navigationDestination\(for: ReviewsDestination\.self\)/)
  })

  it('every case has a view, and no case falls through to a placeholder', () => {
    const cases = [...code(DEST).matchAll(/^\s*case\s+(\w+)/gm)].map((m) => m[1])
    expect(cases.length, 'the enum parser found nothing — this test would be vacuous')
      .toBeGreaterThanOrEqual(4)
    const shell = code(SHELL)
    for (const c of cases) {
      // 🚨 A regex with a DELIMITER, not `toContain(\`case .${c}\`)`. A substring check passes on
      // `case .groupDining:` when looking for `case .group`, and on a typo'd `case .groupXX(`
      // — a mutation proved exactly that, and the guard reported green while the case was gone.
      expect(shell, `ReviewsDestination.${c} has no case in the shell`)
        .toMatch(new RegExp(`case \\.${c}\\s*[(:]`))
    }
    expect(shell, 'a ReviewsDestination case must not render PlaceholderTabView')
      .not.toMatch(/case \.(reviewDetail|userProfile|group|copyrightPolicy)[^\n]*\n\s*PlaceholderTabView/)
  })

  it('🚨 it is registered for EVERY tab, not just one', () => {
    // A destination registered inside one tab's `case` can only be pushed on that tab. A review
    // detail is opened from Explore, Profile AND Home; registering it on one of them makes the
    // other two silently do nothing. It belongs on the NavigationStack shared by the ForEach.
    const shell = code(SHELL)
    const registration = shell.indexOf('navigationDestination(for: ReviewsDestination.self)')
    const tabSwitch = shell.indexOf('private func tabRoot')
    expect(registration, 'ReviewsDestination is not registered').toBeGreaterThan(-1)
    expect(registration, 'the registration is inside tabRoot, so it applies to one tab only')
      .toBeLessThan(tabSwitch)
  })

  it('every ProfileDestination case still has a view — including the new one', () => {
    const cases = [...code(`${IOS}/Features/Profile/Model/ProfileModels.swift`)
      .slice(code(`${IOS}/Features/Profile/Model/ProfileModels.swift`).indexOf('enum ProfileDestination'))
      .matchAll(/^\s*case\s+(\w+)/gm)].map((m) => m[1])
    expect(cases).toContain('groupDining')
    const shell = code(SHELL)
    for (const c of cases) {
      expect(shell, `ProfileDestination.${c} has no case in the shell`)
        .toMatch(new RegExp(`case \\.${c}\\s*:`))
    }
  })
})

describe('a shared link resolves to the thing that was shared', () => {
  it('review, profile and group links keep their id', () => {
    // Every one of these used to be discarded. `/reviews/abc` matched the Explore tab's `/reviews`
    // prefix and opened the feed; `/users/xyz` matched nothing; `/group/g1` — the link a group's
    // whole mechanism depends on — did nothing at all.
    const src = code(DEEPLINK)
    expect(src).toMatch(/case review\(id: String\)/)
    expect(src).toMatch(/case userProfile\(id: String\)/)
    expect(src).toMatch(/case group\(id: String\)/)
    expect(src).toMatch(/case "reviews": return \.review\(id: id\)/)
    expect(src).toMatch(/case "users": return \.userProfile\(id: id\)/)
  })

  it('🚨 content paths are matched BEFORE the tab prefixes', () => {
    // `/reviews/{id}` also carries the Explore tab's `/reviews` prefix. Whichever check runs
    // first wins, and running the tab check first IS the original bug. Order is the fix.
    const src = code(DEEPLINK)
    const contentMatch = src.indexOf('case "reviews": return .review')
    const tabMatch = src.indexOf('tab.webPath != "/" && normalized.hasPrefix')
    expect(contentMatch).toBeGreaterThan(-1)
    expect(tabMatch).toBeGreaterThan(-1)
    expect(contentMatch, 'the tab prefix match runs first, so ids are still discarded')
      .toBeLessThan(tabMatch)
  })

  it('/group/new is the create screen, not a room called "new"', () => {
    expect(code(DEEPLINK)).toMatch(/id == "new" \? \.groupCreate/)
  })

  it('every DeepLinkTarget case is routed by AppRouter', () => {
    const cases = [...code(DEEPLINK)
      .slice(code(DEEPLINK).indexOf('enum DeepLinkTarget'), code(DEEPLINK).indexOf('struct DeepLinkHandler'))
      .matchAll(/^\s*case\s+(\w+)/gm)].map((m) => m[1])
    expect(cases.length).toBeGreaterThanOrEqual(5)
    const router = code(ROUTER)
    const handle = router.slice(router.indexOf('func handle('))
    for (const c of cases) {
      // Same delimiter rule as the shell check above: `.review` must not match `.reviewXX`.
      expect(handle, `DeepLinkTarget.${c} is not routed`)
        .toMatch(new RegExp(`case \\.${c}\\s*[(:]`))
    }
  })
})

describe('taps go where the UI says they go', () => {
  it('the feed author row is no longer a no-op', () => {
    // `onCreatorTap: {}` — the avatar and name were tappable and did nothing.
    const src = code(`${IOS}/Features/Reviews/UI/ReviewsFeedView.swift`)
    expect(src).not.toMatch(/onCreatorTap:\s*\{\s*\}/)
    expect(src).toMatch(/ReviewsDestination\.userProfile\(id: uid\)/)
  })

  it('user search opens the person who was tapped', () => {
    const src = code(`${IOS}/Features/Reviews/UI/UserSearchView.swift`)
    expect(src).not.toMatch(/router\.push\(ProfileDestination\.account/)
    expect(src).toMatch(/ReviewsDestination\.userProfile\(id: user\.id\)/)
  })

  it('the review detail author row carries the review\'s user id', () => {
    const src = code(`${IOS}/Features/Reviews/UI/ReviewDetailView.swift`)
    expect(src).toMatch(/ReviewsDestination\.userProfile\(id: userId\)/)
  })

  it('a post tile opens that post', () => {
    const src = code(`${IOS}/Features/Reviews/UI/MyPostsView.swift`)
    expect(src).toMatch(/ReviewsDestination\.reviewDetail\(id: post\.id\)/)
  })
})

describe('group dining is native, not a link out of the app', () => {
  it('🚨 nothing opens an external group URL any more', () => {
    // The whole iOS "feature" was `UIApplication.shared.open("https://tappyai.vn/group/new")`:
    // it left the app, landed on a domain that is not the canonical origin, and arrived
    // signed-out — where /group/new redirects to /login. A row, and nothing behind it.
    for (const file of swiftFiles(IOS)) {
      expect(code(file), `${file} still opens the group page in a browser`)
        .not.toMatch(/UIApplication\.shared\.open\([^)]*group/)
    }
  })

  it('the profile row pushes the native destination', () => {
    expect(code(`${IOS}/Features/Profile/UI/ProfileMainView.swift`))
      .toMatch(/profile\.row\.groupDining[^\n]*dest: \.groupDining/)
  })

  it('all four group endpoints are called', () => {
    const src = code(`${IOS}/Features/GroupDining/Data/GroupService.swift`)
    expect(src).toContain('/api/group')
    expect(src).toMatch(/\/api\/group\/\\\(id\)\/join/)
    expect(src).toMatch(/\/api\/group\/\\\(id\)\/suggest/)
    expect(src).toMatch(/method: \.post/)
  })

  it('🚨 the join body uses the server\'s snake_case field names', () => {
    // The response decoder converts snake→camel on the way IN. Nothing converts on the way OUT,
    // so a camelCase body reaches the server as fields it does not read: `food_preferences` would
    // arrive empty and the AI would suggest for a group whose preferences it was never told.
    const src = code(`${IOS}/Features/GroupDining/Data/GroupService.swift`)
    for (const field of ['food_preferences', 'dietary_restrictions']) {
      expect(src, `join sends the wrong field name for ${field}`).toContain(`"${field}"`)
    }
    expect(src).not.toMatch(/"foodPreferences"/)
  })

  it('writes require auth, because the server refuses anonymous social writes', () => {
    const src = code(`${IOS}/Features/GroupDining/Data/GroupService.swift`)
    const writes = src.split('func ').filter((f) => f.includes('method: .post'))
    expect(writes.length, 'no POST found — this test would be vacuous').toBeGreaterThanOrEqual(3)
    for (const w of writes) {
      expect(w, `a group write does not require auth: ${w.slice(0, 40)}`).toMatch(/requiresAuth: true/)
    }
  })

  it('the suggestion button is creator-only, as the server enforces', () => {
    const vm = code(`${IOS}/Features/GroupDining/UI/GroupDetailViewModel.swift`)
    expect(vm).toMatch(/var isCreator: Bool/)
    expect(vm).toMatch(/canSuggest.*isCreator/)
  })
})

describe('the review detail fetches rather than reading a cache', () => {
  it('it calls the single-review endpoint', () => {
    const src = code(`${IOS}/Features/Reviews/Data/ReviewsService.swift`)
    expect(src).toMatch(/func fetchReview\(id: String\)/)
    expect(src).toMatch(/path: "\/api\/reviews\/\\\(id\)"/)
  })

  it('🚨 the endpoint it calls exists on the server', () => {
    // The reason Android's detail screen reads a cache is that this route did not exist. If it
    // is ever removed, iOS's detail screen becomes a permanent "not available".
    const route = readFileSync('src/app/api/reviews/[id]/route.ts', 'utf8')
    expect(route, 'GET /api/reviews/[id] is gone — the iOS detail screen depends on it')
      .toMatch(/export async function GET/)
  })

  it('the public read does not require auth, so a shared link opens signed-out', () => {
    const src = code(`${IOS}/Features/Reviews/Data/ReviewsService.swift`)
    const fn = src.slice(src.indexOf('func fetchReview'), src.indexOf('func fetchUserProfile'))
    expect(fn).not.toMatch(/requiresAuth: true/)
  })

  it('404 is a "not available" state, not a retry loop', () => {
    // A deleted, hidden or held review can never load. Offering Retry invites the user to press
    // it forever.
    const vm = code(`${IOS}/Features/Reviews/UI/ReviewDetailViewModel.swift`)
    expect(vm).toMatch(/status == 404/)
    expect(vm).toMatch(/state = \.notFound/)
  })
})

describe('the public profile shows what a stranger would see', () => {
  it('🚨 it uses the public feed, not the author-only endpoint', () => {
    // `/api/reviews/mine` returns hidden and unpublished posts. Using it here would show a
    // visitor content the platform has withheld from them.
    const src = code(`${IOS}/Features/Reviews/Data/ReviewsService.swift`)
    const fn = src.slice(src.indexOf('func fetchUserReviews'))
    const body = fn.slice(0, fn.indexOf('\n    }'))
    expect(body).toContain('/api/reviews/feed')
    expect(body).not.toContain('/api/reviews/mine')
    // The closing quote is part of the pattern: `name: "userId"` also matches `"userIdXX"`, and
    // a query parameter the server does not read would return that person's ENTIRE public feed
    // — everyone's posts — under their name.
    expect(body).toMatch(/name: "userId",\s*value: userId/)
  })

  it('the follow button cannot be double-fired', () => {
    const vm = code(`${IOS}/Features/Reviews/UI/UserProfileViewModel.swift`)
    expect(vm).toMatch(/!isTogglingFollow/)
    expect(vm).toMatch(/isSelf/)
  })
})

describe('the copyright policy is readable in both languages', () => {
  it('the screen has no hardcoded policy prose', () => {
    // The WEB version is hardcoded Vietnamese — that is the defect this must not repeat.
    const src = code(`${IOS}/Features/Music/UI/CopyrightPolicyView.swift`)
    const vietnamese = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i
    expect(vietnamese.test(src), 'Vietnamese prose is hardcoded in the view').toBe(false)
  })

  it('every copyright key is in the catalogue, in both languages', () => {
    const cat = JSON.parse(read(`${IOS}/Resources/Localizable.xcstrings`))
    const keys = Object.keys(cat.strings).filter((k) => k.startsWith('copyright.'))
    expect(keys.length, 'no copyright keys were added').toBeGreaterThanOrEqual(10)
    for (const k of keys) {
      const loc = cat.strings[k].localizations
      expect(loc.en?.stringUnit?.value, `EN ${k}`).toBeTruthy()
      expect(loc.vi?.stringUnit?.value, `VI ${k}`).toBeTruthy()
      expect(loc.en.stringUnit.value, `${k} is the same in both languages`)
        .not.toBe(loc.vi.stringUnit.value)
    }
  })

  it('the agent address matches the one published on the web', () => {
    // U04 moved the web address into `landing/config.ts` — a Next.js page module may export only
    // its own reserved names, so the constant could not live in the route. The cross-client
    // comparison follows it there rather than asserting against the page it no longer sits in.
    const ios = read(`${IOS}/Features/Music/UI/CopyrightPolicyView.swift`)
    const config = readFileSync('src/components/landing/config.ts', 'utf8')
    const address = 'copyright@tappyai.com'
    expect(ios, 'the iOS policy names a different agent address').toContain(address)
    expect(config, 'the web policy address changed — iOS now points somewhere else').toContain(address)
  })
})
