import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LINK_VIDEO_PROVIDERS } from '@/lib/config/product'

// ── Cross-client link-video provider parity ──────────────────────────────────
//
// LINK_VIDEO_PROVIDERS (src/lib/config/product.ts) is the ONLY list of providers a user may
// import a video from. It is served to native clients as `video.linkProviders` by GET /api/config.
// Web consumes it directly. Android and iOS reimplement the composer in Kotlin/Swift, and a
// reimplementation is allowed to exist — it is NOT allowed to carry a provider list of its own.
//
// This guard exists because both native composers did exactly that: Android's `detectSource`
// recognized `tiktok.com`/`facebook.com` and iOS rendered a source selector from
// `ExternalSource.allCases`, so a user could attach a TikTok link and post it. Neither client
// calls POST /api/links/resolve (the endpoint that 400s an unsupported source) — they post
// `source_type` straight to POST /api/reviews, which stores it verbatim, and the DB CHECK still
// permits 'tiktok' for backward compatibility. So the drift did not fail loudly; it silently
// wrote rows no client can play.
//
// Static source comparison is the mechanism on purpose: there is no Swift toolchain on the build
// machine, so a text-level contract check is the only thing that can run in CI at all.
//
// The unsupported set is DERIVED from LINK_VIDEO_PROVIDERS below rather than hardcoded, so
// re-enabling a provider in config/product.ts relaxes this guard automatically instead of
// turning it into a third contract that must be edited in lockstep.

const ANDROID_COMPOSER =
  'android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewComposerViewModel.kt'
const ANDROID_ENUMS = 'android/app/src/main/java/com/tappyai/app/reviews/data/ReviewEnums.kt'
const ANDROID_DTOS = 'android/app/src/main/java/com/tappyai/app/reviews/data/ReviewNetworkDtos.kt'
const ANDROID_SURFACE = 'android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewVideoSurface.kt'
const IOS_MODELS = 'ios/TappyAI/Features/Reviews/Model/CreateReviewModels.swift'
const IOS_VIEW = 'ios/TappyAI/Features/Reviews/UI/CreateReviewView.swift'
const IOS_VIEWMODEL = 'ios/TappyAI/Features/Reviews/UI/CreateReviewViewModel.swift'
const IOS_CONFIG = 'ios/TappyAI/Core/Config/AppConfigService.swift'

const read = (p: string) => readFileSync(p, 'utf8')

/** URL fragments that identify a provider in client-side detection code. */
const PROVIDER_DOMAINS: Record<string, string[]> = {
  youtube: ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
  facebook: ['facebook.com', 'fb.com', 'fb.watch'],
  instagram: ['instagram.com'],
}

/** Domains for providers the backend does NOT support — derived, never hardcoded. */
const UNSUPPORTED_DOMAINS = Object.entries(PROVIDER_DOMAINS)
  .filter(([id]) => !(LINK_VIDEO_PROVIDERS as readonly string[]).includes(id))
  .flatMap(([, domains]) => domains)

/**
 * The body of a declaration, from its signature up to the next declaration at the same level.
 * Same slicing technique as crossClientParity.test.ts — good enough for a contract check, and it
 * fails loudly (throws) if the declaration is renamed rather than silently passing.
 */
function declarationBody(source: string, signature: string, nextDeclarations: string[]): string {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error(`"${signature}" not found — was it renamed?`)
  const ends = nextDeclarations
    .map(d => source.indexOf(d, start + signature.length))
    .filter(i => i !== -1)
  return source.slice(start, ends.length ? Math.min(...ends) : source.length)
}

/** Unsupported provider domains mentioned in a slice of client code. */
const unsupportedDomainsIn = (code: string) =>
  UNSUPPORTED_DOMAINS.filter(d => code.toLowerCase().includes(d))

describe('the backend owns the link-video provider list', () => {
  it('serves exactly the V1 contract', () => {
    // Anchors the derivation above. If this changes, the guard relaxes/tightens with it.
    expect([...LINK_VIDEO_PROVIDERS]).toEqual(['youtube'])
  })
})

describe('no native composer may detect an unsupported provider', () => {
  it('the Android composer detects only backend-supported providers', () => {
    const body = declarationBody(read(ANDROID_COMPOSER), 'private fun detectSource(', [
      '\n    /**',
      '\n    private fun ',
      '\n    private companion object',
    ])
    expect(unsupportedDomainsIn(body)).toEqual([])
  })

  it('the iOS composer detects only backend-supported providers', () => {
    const body = declarationBody(read(IOS_MODELS), 'static func detect(url: String)', [
      '\n    static func ',
      '\n}',
    ])
    expect(unsupportedDomainsIn(body)).toEqual([])
  })

  it('the iOS source selector is not rendered from every enum case', () => {
    // `ExternalSource.allCases` includes the legacy-only cases, so rendering the selector from it
    // offers TikTok/Facebook buttons regardless of what the backend supports.
    expect(read(IOS_VIEW)).not.toContain('ExternalSource.allCases')
  })

  it('no native composer hardcodes an unsupported provider in its UI copy', () => {
    // Comments may still discuss a removed provider — explaining why the legacy cases exist is
    // exactly what the code SHOULD do. Only live code and user-facing strings are the contract.
    const isComment = (line: string) => /^\s*(\/\/|\/\*|\*)/.test(line)
    const unsupportedNames = Object.keys(PROVIDER_DOMAINS).filter(
      id => !(LINK_VIDEO_PROVIDERS as readonly string[]).includes(id),
    )

    for (const [label, file] of [
      ['Android', ANDROID_COMPOSER],
      ['iOS view', IOS_VIEW],
    ] as const) {
      const offending = read(file)
        .split(/\r?\n/)
        .filter(l => !isComment(l))
        .filter(l => unsupportedNames.some(n => new RegExp(`\\b${n}\\b`, 'i').test(l)))
        .map(l => l.trim())
      expect(offending, `${label} composer names an unsupported provider in live code`).toEqual([])
    }
  })
})

describe('native clients read the provider list from the backend', () => {
  it('Android decodes video.linkProviders from /api/config', () => {
    const kotlin = read(ANDROID_COMPOSER)
    expect(kotlin).toContain('supportedLinkProviders')
  })

  it('iOS decodes video.linkProviders from /api/config', () => {
    expect(read(IOS_CONFIG)).toContain('linkProviders')
  })

  it('the iOS composer drives its selector from the backend list', () => {
    expect(read(IOS_VIEWMODEL)).toContain('supportedSources')
  })
})

// The composer must stop OFFERING removed providers; the read path must keep UNDERSTANDING them.
// Rows created before the 2026-07-26 decision still carry source_type='tiktok'/'facebook' (the DB
// CHECK permits both), so a client that dropped the cases entirely would fail to decode a legacy
// row instead of degrading to the generic `video` treatment.
describe('legacy rows from removed providers still degrade gracefully', () => {
  it('the Android enum keeps the legacy cases', () => {
    const enums = read(ANDROID_ENUMS)
    expect(enums).toContain('TikTok')
    expect(enums).toContain('Facebook')
  })

  it('Android still decodes legacy source_type values off the wire', () => {
    const dtos = read(ANDROID_DTOS)
    expect(dtos).toContain('"tiktok" -> ReviewSourceType.TikTok')
    expect(dtos).toContain('"facebook" -> ReviewSourceType.Facebook')
  })

  it('Android still renders a legacy external clip', () => {
    expect(read(ANDROID_SURFACE)).toContain('ReviewSourceType.TikTok')
  })

  it('the iOS enum keeps the legacy cases', () => {
    expect(read(IOS_MODELS)).toMatch(/case\s+youtube,\s*tiktok,\s*facebook/)
  })
})
