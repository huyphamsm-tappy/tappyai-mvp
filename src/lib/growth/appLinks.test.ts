import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  assetLinks, androidFingerprints, appleAppSiteAssociation, isPlaceholderFingerprint,
  ANDROID_PACKAGE, LEGACY_TWA_FINGERPRINT,
  APPLE_TEAM_ID, IOS_BUNDLE_ID, IOS_APP_ID, IOS_UNIVERSAL_LINK_COMPONENTS,
} from './appLinks'
import { GET as getAasa } from '@/app/.well-known/apple-app-site-association/route'
import { GET as getAssetLinks } from '@/app/.well-known/assetlinks.json/route'

/**
 * A made-up fingerprint (SHA-256 of a fixture string), NOT a real certificate — shaped like a
 * real one on purpose, because the code rejects the hand-typed `AA:BB:CC:…` kind.
 */
const FP = '40:D2:36:46:8D:03:DC:82:F3:EF:2C:CE:A6:37:E2:57:9D:CA:50:F9:91:2C:C5:43:02:F3:40:69:34:98:0A:C9'
const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv
const read = (p: string) => fs.readFileSync(p, 'utf8')
const FINGERPRINT_RE = /([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}/

describe('App Links (Android) — inert until configured', () => {
  it('serves nothing without configuration', () => {
    expect(assetLinks(env({}))).toBeNull()
    expect(assetLinks(env({ ANDROID_APP_LINKS_SHA256: 'not-a-fingerprint' }))).toBeNull()
  })
  it('produces the standard statement once configured', () => {
    expect(androidFingerprints(env({ ANDROID_APP_LINKS_SHA256: `${FP.toLowerCase()}, junk` }))).toEqual([FP])
    expect(assetLinks(env({ ANDROID_APP_LINKS_SHA256: FP }))).toEqual([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.tappyai.app', sha256_cert_fingerprints: [FP] } }])
  })
  it('never publishes a placeholder, or the legacy TWA certificate', () => {
    const samples = [
      'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
      Array(32).fill('00').join(':'),
      Array(32).fill('FF').join(':'),
      Array.from({ length: 32 }, (_, i) => ['12', '34', '56', '78'][i % 4]).join(':'),
    ]
    for (const s of samples) {
      expect(isPlaceholderFingerprint(s), s).toBe(true)
      expect(assetLinks(env({ ANDROID_APP_LINKS_SHA256: s })), s).toBeNull()
    }
    expect(isPlaceholderFingerprint(FP)).toBe(false)
    expect(assetLinks(env({ ANDROID_APP_LINKS_SHA256: LEGACY_TWA_FINGERPRINT }))).toBeNull()
    // A real fingerprint next to a rejected one still publishes the real one only.
    expect(androidFingerprints(env({ ANDROID_APP_LINKS_SHA256: `${samples[0]},${FP}` }))).toEqual([FP])
  })
  it('the route is 404 without configuration and 200 application/json with it', async () => {
    const saved = process.env.ANDROID_APP_LINKS_SHA256
    try {
      delete process.env.ANDROID_APP_LINKS_SHA256
      expect(getAssetLinks().status).toBe(404)
      process.env.ANDROID_APP_LINKS_SHA256 = FP
      const res = getAssetLinks()
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toMatch(/^application\/json/)
      expect(await res.json()).toEqual(assetLinks(env({ ANDROID_APP_LINKS_SHA256: FP })))
    } finally {
      if (saved === undefined) delete process.env.ANDROID_APP_LINKS_SHA256
      else process.env.ANDROID_APP_LINKS_SHA256 = saved
    }
  })
  it('no static file in public/ shadows the route (the legacy com.tappyai.twa statement did)', () => {
    expect(fs.existsSync('public/.well-known/assetlinks.json')).toBe(false)
  })
  it('no fingerprint is hard-coded into anything the site serves', () => {
    const walk = (dir: string): string[] => fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name)
        return e.isDirectory() ? walk(p) : /\.(json|txt|html|xml|js|webmanifest)$|^[^.]+$/.test(e.name) ? [p] : []
      })
      : []
    for (const f of walk('public')) expect(read(f), f).not.toMatch(FINGERPRINT_RE)
  })
})

describe('App Links — the Android side is prepared and matches the server statement', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  const gradle = read('android/app/build.gradle.kts')
  it('the package the statement names is the applicationId the app builds with', () => {
    const applicationId = gradle.match(/^\s*applicationId = "([^"]+)"/m)?.[1]
    expect(applicationId).toBe('com.tappyai.app')
    expect(ANDROID_PACKAGE).toBe(applicationId)
    expect(ANDROID_PACKAGE).not.toBe('com.tappyai.twa')
    expect(assetLinks(env({ ANDROID_APP_LINKS_SHA256: FP }))![0]).toMatchObject({ target: { package_name: applicationId } })
  })
  it('the app claims /r/ only, through an alias that is disabled unless the build enables it', () => {
    const alias = manifest.split('<activity-alias')[1]?.split('</activity-alias>')[0] ?? ''
    expect(alias).toContain('android:autoVerify="true"')
    expect(alias).toContain('android:pathPrefix="/r/"')
    expect(alias).toContain('android:enabled="@bool/tappy_app_links_enabled"')
    expect(gradle).toMatch(/resValue\("bool", "tappy_app_links_enabled", \(project\.findProperty\("TAPPYAI_APP_LINKS_ENABLED"\)\?\.toString\(\) == "true"\)\.toString\(\)\)/)
  })
})

describe('Universal Links (iOS) — apple-app-site-association', () => {
  type Aasa = {
    applinks: { details: { appIDs: string[]; components: { '/': string; exclude?: boolean }[] }[] }
    webcredentials: { apps: string[] }
  }
  const aasa = appleAppSiteAssociation() as Aasa
  const includes = IOS_UNIVERSAL_LINK_COMPONENTS.filter(c => !c.exclude).map(c => c['/'])

  it('names the real app — never the placeholder production served until 2026-09-27', () => {
    expect(APPLE_TEAM_ID).toMatch(/^[A-Z0-9]{10}$/)
    expect(IOS_APP_ID).toBe('6UAG75G2US.com.tappyai.ios')
    expect(aasa.applinks.details[0].appIDs).toEqual([IOS_APP_ID])
    expect(aasa.webcredentials.apps).toEqual([IOS_APP_ID])
    expect(JSON.stringify(aasa)).not.toContain('APPLE_TEAM_ID')
  })

  it('no static file in public/ shadows the route (that is how the placeholder reached production)', () => {
    expect(fs.existsSync('public/.well-known/apple-app-site-association')).toBe(false)
    expect(fs.existsSync('public/.well-known/apple-app-site-association.json')).toBe(false)
  })

  it('the route answers 200 application/json with the same document', async () => {
    const res = getAasa()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^application\/json/)
    expect(await res.json()).toEqual(aasa)
  })

  it('matches what the iOS app is built with: bundle id and Associated Domains', () => {
    expect(read('ios/Config/Release.xcconfig')).toMatch(new RegExp(`^PRODUCT_BUNDLE_IDENTIFIER = ${IOS_BUNDLE_ID.replace(/\./g, '\\.')}\\s*$`, 'm'))
    const entitlements = read('ios/TappyAI/TappyAI.entitlements')
    expect(entitlements).toContain('<string>applinks:www.tappyai.com</string>')
    expect(entitlements).toContain('<string>webcredentials:www.tappyai.com</string>')
  })

  it('claims no catch-all and no private, auth or web-only surface', () => {
    for (const p of includes) {
      expect(p).not.toBe('/*')
      expect(p).not.toMatch(/^\/(chat|api|admin|profile|login|register|auth|r|plan|\.well-known)(\/|$)/)
    }
  })

  it('every claimed path is one the iOS DeepLinkHandler routes natively', () => {
    const handler = read('ios/TappyAI/Core/Navigation/DeepLinkHandler.swift')
    const tabs = read('ios/TappyAI/Core/Navigation/AppTab.swift')
    for (const p of includes) {
      if (p === '/') {
        expect(handler).toContain('if normalized == "/" { return .tab(.home) }')
      } else if (p.endsWith('/*')) {
        const segment = p.slice(1, -2)
        expect(handler, p).toContain(`case "${segment}":`)
      } else {
        expect(tabs, p).toContain(`return "${p}"`)
      }
    }
  })

  it('every web page under a claimed prefix is either excluded or handled by the app', () => {
    // A web page at /reviews/new under a claimed /reviews/* would open the app, which reads "new"
    // as a review id. So each static child route must be excluded — or handled by name in Swift
    // (`/group/new` is: `id == "new" ? .groupCreate`).
    const handler = read('ios/TappyAI/Core/Navigation/DeepLinkHandler.swift')
    const excluded = IOS_UNIVERSAL_LINK_COMPONENTS.filter(c => c.exclude).map(c => c['/'])
    const staticChildren = (segment: string): string[] => {
      const found = new Set<string>()
      const walk = (dir: string, url: string[]) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (!e.isDirectory()) continue
          const isGroup = /^\(.*\)$/.test(e.name)
          const next = isGroup ? url : [...url, e.name]
          if (next[0] === 'api') continue
          if (next.length === 2 && next[0] === segment && !e.name.startsWith('[')) found.add(e.name)
          walk(path.join(dir, e.name), next)
        }
      }
      walk('src/app', [])
      return [...found]
    }
    for (const p of includes.filter(p => p.endsWith('/*'))) {
      const segment = p.slice(1, -2)
      for (const child of staticChildren(segment)) {
        const isExcluded = excluded.some(x => x === `/${segment}/${child}` || x === `/${segment}/${child}/*`)
        const isHandled = handler.includes(`id == "${child}"`)
        expect(isExcluded || isHandled, `/${segment}/${child}`).toBe(true)
      }
    }
  })

  it('exclusions come before the entries they carve out of (iOS takes the first match)', () => {
    const order = IOS_UNIVERSAL_LINK_COMPONENTS.map(c => c['/'])
    for (const c of IOS_UNIVERSAL_LINK_COMPONENTS.filter(c => c.exclude)) {
      const parent = '/' + c['/'].split('/')[1] + '/*'
      expect(order.indexOf(c['/']), c['/']).toBeLessThan(order.indexOf(parent))
    }
  })
})
