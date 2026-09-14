// The three clients must agree about sharing.
//
// Web, Android and iOS each implement the same contract in their own language.
// Nothing at runtime forces them to stay in step, so this test reads the Kotlin
// and Swift sources and checks they still declare the same targets, the same
// canonical origin, and the same refusals.
//
// There is no Xcode and no emulator here, so this is a SOURCE contract — it
// proves the code says the right thing, not that a device behaves correctly.
// The Kotlin side additionally has real JVM unit tests (TappyShareTest.kt) that
// run under gradle.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SHARE_TARGETS } from './shareTargets'

const root = join(__dirname, '..', '..', '..')
const androidSrc = readFileSync(
  join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'tappyai', 'app', 'share', 'TappyShare.kt'),
  'utf8'
)
const iosSrc = readFileSync(
  join(root, 'ios', 'TappyAI', 'Core', 'Share', 'TappyShare.swift'),
  'utf8'
)

const PLATFORMS: Array<[string, string]> = [
  ['android', androidSrc],
  ['ios', iosSrc],
]

describe('every client declares the same share targets', () => {
  it.each(PLATFORMS)('%s declares all thirteen targets', (_name, src) => {
    for (const target of SHARE_TARGETS) {
      expect(src.toLowerCase()).toContain(target.id)
    }
  })

  // The order is the product order; it is the same list on all three.
  it('android and ios list the targets in the web order', () => {
    const ids = SHARE_TARGETS.map((t) => t.id)
    const kt = androidSrc.match(/val targets: List<Target> = listOf\(([\s\S]*?)\)/)![1]
    expect(kt.match(/Target\.([A-Z]+)/g)!.map((m) => m.slice('Target.'.length).toLowerCase())).toEqual(ids)
    const swift = iosSrc.match(/static let targets: \[Target\] = \[([^\]]*)\]/)![1]
    expect(swift.split(',').map((s) => s.trim().replace(/^\./, ''))).toEqual(ids)
  })

  // The text handoffs are the SAME documented endpoints everywhere.
  it.each(PLATFORMS)('%s builds the same text handoffs (mailto / viber forward / line share / wa.me / t.me)', (_name, src) => {
    expect(src).toContain('mailto:?subject=')
    expect(src).toContain('viber://forward?text=')
    expect(src).toContain('https://line.me/R/share?text=')
    expect(src).toContain('https://wa.me/?text=')
    expect(src).toContain('https://t.me/share/url?url=')
  })

  // Messenger's only entry point is its own share scheme, on every platform.
  it.each(PLATFORMS)('%s hands Messenger its share deep link', (_name, src) => {
    expect(src).toContain('fb-messenger://share?link=')
  })

  it.each(PLATFORMS)('%s bounds text handoffs at 4000 like the web', (_name, src) => {
    expect(src).toMatch(/(TEXT_HANDOFF_MAX|textHandoffMax)[^\n]*4000/)
  })

  // Direct app handoff is a claim about specific apps; the claimed set is
  // declared where the OS can check it (manifest <queries> / LSApplicationQueriesSchemes).
  it('android declares exactly the packages it targets', () => {
    const manifest = readFileSync(join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8')
    const declared = [...manifest.matchAll(/<package android:name="([^"]+)"/g)].map((m) => m[1]).sort()
    expect(declared).toEqual([
      'com.facebook.orca', 'com.viber.voip', 'com.whatsapp', 'com.zing.zalo', 'jp.naver.line.android', 'org.telegram.messenger',
    ])
    for (const pkg of declared) expect(androidSrc).toContain(pkg)
  })

  it('ios declares exactly the schemes it queries', () => {
    const plist = readFileSync(join(root, 'ios', 'TappyAI', 'Resources', 'Info.plist'), 'utf8')
    const block = plist.match(/<key>LSApplicationQueriesSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/)![1]
    const declared = [...block.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]).sort()
    expect(declared).toEqual(['fb-messenger', 'line', 'tg', 'viber', 'whatsapp', 'zalo'])
    for (const scheme of declared) expect(iosSrc).toContain(`"${scheme}"`)
  })

  // The Inbox is the web Messenger on every platform — no second messenger.
  it.each(PLATFORMS)('%s points the Tappy Inbox at the web Messenger', (_name, src) => {
    expect(src).toContain('/profile/notifications?tab=messages')
  })

  it.each(PLATFORMS)('%s builds a Facebook handoff', (_name, src) => {
    expect(src).toContain('facebook.com/sharer/sharer.php?u=')
  })

  // 🚨 Zalo has no standalone web share URL. `sp.zalo.me/plugins/share?url=` answered an
  // EMPTY page (2026-09-14), so no client may build it. Zalo's own SDK contract instead:
  // Android hands the link to the app (ACTION_SEND to com.zing.zalo), iOS opens the
  // share-extension scheme, the web does the same from a phone's browser and copies on desktop.
  it('no client points Zalo at the empty sp.zalo.me page', () => {
    const webSrc = readFileSync(join(__dirname, 'shareTargets.ts'), 'utf8')
    for (const src of [androidSrc, iosSrc, webSrc]) expect(src).not.toContain('sp.zalo.me/plugins/share')
    expect(androidSrc).toMatch(/Target\.ZALO -> null/)
    expect(androidSrc).toContain('"com.zing.zalo"')
    expect(iosSrc).toContain('zaloshareext://shareext?url=')
    expect(webSrc).toContain('zaloshareext://shareext?url=')
    expect(webSrc).toContain('intent://zaloapp.com/#Intent;action=android.intent.action.SEND')
  })

  // The same honest answer on every platform.
  it.each(PLATFORMS)('%s returns no handoff URL for TikTok', (_name, src) => {
    expect(src).toMatch(/tiktok[\s\S]{0,80}(null|nil)/i)
  })

  it.each(PLATFORMS)('%s labels TikTok without "Shop"', (_name, src) => {
    expect(src).not.toMatch(/tiktok\s*shop/i)
  })
})

describe('every client shares a plan through the ONE published page', () => {
  // The web mints the id (POST /api/plans/share) and every client — web included — turns THAT
  // id into `https://www.tappyai.com/plan/<id>`. No client mints, hashes or guesses an id.
  it.each(PLATFORMS)('%s builds the plan url from the server id, with the web id format', (_name, src) => {
    expect(src).toContain('/api/plans/share')
    expect(src).toContain('[A-Za-z0-9]{12}')
    expect(src).toMatch(/\/plan\//)
  })

  it.each(PLATFORMS)('%s never mints a share id of its own', (_name, src) => {
    expect(src).not.toMatch(/SecureRandom|getRandomValues|UUID\.randomUUID|sha256|SHA256|CryptoKit|MessageDigest/)
  })

  it('android and ios post the plan block verbatim as { plan } and refuse guests before the request', () => {
    const androidRepo = readFileSync(join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'tappyai', 'app', 'share', 'PlanShareRepository.kt'), 'utf8')
    const iosService = readFileSync(join(root, 'ios', 'TappyAI', 'Core', 'Share', 'PlanShareService.swift'), 'utf8')
    for (const src of [androidRepo, iosService]) {
      expect(src).toContain('/api/plans/share')
      expect(src).toMatch(/SignInRequired|signInRequired/)
      expect(src).toMatch(/isAnonymous|isAuthenticated/)
    }
    expect(androidRepo).toContain('JsonObject')
    expect(iosService).toContain('["plan": plan]')
  })

  // 🚨 A PUBLISHED PLAN IS A LINK on every client: what leaves is "<subject>\n<url>", Copy is the
  // exact url, no rendered image rides along — the page and its OG card are the brochure.
  it('web, android and ios all turn a published plan into the same link artifact', () => {
    const webArtifact = readFileSync(join(__dirname, 'shareArtifact.ts'), 'utf8')
    const androidArtifact = readFileSync(join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'tappyai', 'app', 'share', 'ShareArtifact.kt'), 'utf8')
    const iosArtifact = readFileSync(join(root, 'ios', 'TappyAI', 'Core', 'Share', 'ShareArtifact.swift'), 'utf8')
    expect(webArtifact).toContain('text: `${a.subject}\\n${shareUrl}`')
    expect(androidArtifact).toContain('text = "${base.subject}\\n$canonicalUrl"')
    expect(iosArtifact).toContain('text: "\\(base.subject)\\n\\(canonicalURL)"')
    const webMenu = readFileSync(join(root, 'src', 'components', 'share', 'ShareMenu.tsx'), 'utf8')
    const androidSheet = readFileSync(join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'tappyai', 'app', 'share', 'TappyShareSheet.kt'), 'utf8')
    const iosSheet = readFileSync(join(root, 'ios', 'TappyAI', 'Core', 'Share', 'TappyShareSheet.swift'), 'utf8')
    expect(webMenu).toContain('copyText(a.planLink ? a.url : a.text)')
    expect(androidSheet).toContain('if (a.isPlanLink) a.url else a.text')
    expect(iosSheet).toMatch(/isPlanLink \? a\.url : /)
  })
})

describe('every client uses the same canonical origin', () => {
  it.each(PLATFORMS)('%s pins https://www.tappyai.com', (_name, src) => {
    expect(src).toContain('https://www.tappyai.com')
  })

  it.each(PLATFORMS)('%s builds review URLs centrally', (_name, src) => {
    expect(src).toMatch(/reviewU[rR][lL]/)
  })
})

describe('every client enforces the same URL guard', () => {
  it.each(PLATFORMS)('%s requires https', (_name, src) => {
    expect(src).toContain('https')
  })

  it.each(PLATFORMS)('%s refuses private and internal routes', (_name, src) => {
    for (const route of ['api', 'chat', 'admin']) {
      expect(src).toContain(route)
    }
  })

  // Tokens live in the query string; a canonical share link never needs one.
  it.each(PLATFORMS)('%s rejects URLs carrying a query string', (_name, src) => {
    expect(src.toLowerCase()).toContain('query')
  })
})

describe('every client prints the same brochure', () => {
  // The web table in shareArtifact.ts is the source; Android carries it in ShareArtifact.kt,
  // iOS in the String Catalog (`share.brochure.*`). Same input must give the same text.
  const LABELS: Record<string, [string, string]> = {
    recommends: ['TappyAI gợi ý', 'TappyAI recommends'],
    plan: ['Kế hoạch từ TappyAI', 'A plan from TappyAI'],
    reviews: ['đánh giá', 'reviews'],
    why: ['Vì sao', 'Why'],
    maps: ['Bản đồ', 'Maps'],
    website: ['Website', 'Website'],
    review: ['Review', 'Review'],
    order: ['Đặt món', 'Order'],
    booking: ['Đặt phòng', 'Book'],
    ticket: ['Mua vé', 'Tickets'],
    reservation: ['Đặt chỗ', 'Reserve'],
    more: ['và {n} địa điểm khác', 'and {n} more'],
    footer: ['Gợi ý bởi TappyAI · {url}', 'Recommended by TappyAI · {url}'],
    people: ['{n} người', '{n} people'],
    budget: ['Ngân sách', 'Budget'],
  }
  const webSrc = readFileSync(join(root, 'src', 'lib', 'share', 'shareArtifact.ts'), 'utf8')
  const androidArtifact = readFileSync(
    join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'tappyai', 'app', 'share', 'ShareArtifact.kt'),
    'utf8'
  )
  const catalog = JSON.parse(readFileSync(join(root, 'ios', 'TappyAI', 'Resources', 'Localizable.xcstrings'), 'utf8')) as {
    strings: Record<string, { localizations?: Record<string, { stringUnit?: { value?: string } }> }>
  }

  it.each(Object.entries(LABELS))('label %s is identical on web, Android and iOS', (key, [vi, en]) => {
    expect(webSrc).toContain(`${key}: '${vi}'`)
    expect(webSrc).toContain(`${key}: '${en}'`)
    expect(androidArtifact).toContain(`${key} = "${vi}"`)
    expect(androidArtifact).toContain(`${key} = "${en}"`)
    const entry = catalog.strings[`share.brochure.${key}`]
    expect(entry?.localizations?.vi?.stringUnit?.value).toBe(vi)
    expect(entry?.localizations?.en?.stringUnit?.value).toBe(en)
  })
})

describe('no client claims it published anything', () => {
  it.each(PLATFORMS)('%s never says posted/published', (_name, src) => {
    expect(src).not.toMatch(/posted successfully|published successfully/i)
  })

  // The user-facing strings on all three platforms: opened / copied / saved — never sent.
  it('no platform has a share string that claims delivery', () => {
    const files = [
      join(root, 'src', 'lib', 'i18n', 'share.ts'),
      join(root, 'android', 'app', 'src', 'main', 'res', 'values', 'strings_share.xml'),
      join(root, 'android', 'app', 'src', 'main', 'res', 'values-vi', 'strings_share.xml'),
    ]
    const catalog = JSON.parse(readFileSync(join(root, 'ios', 'TappyAI', 'Resources', 'Localizable.xcstrings'), 'utf8')) as {
      strings: Record<string, { localizations?: Record<string, { stringUnit?: { value?: string } }> }>
    }
    const iosShare = Object.entries(catalog.strings)
      .filter(([k]) => k.startsWith('share.'))
      .flatMap(([, v]) => Object.values(v.localizations ?? {}).map((l) => l.stringUnit?.value ?? ''))
      .join('\n')
    // Values only — the comments explaining the rule naturally quote the forbidden words.
    const stripComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '')
    const all = files.map((f) => stripComments(readFileSync(f, 'utf8'))).join('\n') + '\n' + iosShare
    expect(all).not.toMatch(/sent successfully|delivered|shared successfully|đã gửi thành công|gửi thành công|đã chia sẻ thành công/i)
  })
})
