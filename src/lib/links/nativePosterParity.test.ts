import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { youTubeThumbnail } from './platforms'

// ── Cross-client YouTube poster parity ───────────────────────────────────────
//
// `youTubeThumbnail` (src/lib/links/platforms.ts) is the authoritative poster derivation. It uses
// `hqdefault.jpg` on purpose: it exists for EVERY public video, while `maxresdefault.jpg` 404s for
// many videos and most Shorts. Android and iOS build the poster locally in their composers — they
// never call POST /api/links/resolve — so the derivation is reimplemented in Kotlin and Swift.
// A reimplementation is allowed to exist; it is NOT allowed to disagree.
//
// This guard exists because both composers disagreed: they built `maxresdefault.jpg`, so a review
// attached from a Short was stored with a poster URL that 404s, and the tile fell back to the
// placeholder with no error anywhere. Nothing failed loudly — the review posted fine.
//
// Static source comparison is the mechanism on purpose: there is no Swift toolchain on the build
// machine, so a text-level contract check is the only thing that can run in CI at all.
//
// The expectation is DERIVED from `youTubeThumbnail` rather than spelling out `hqdefault`, so
// changing the web derivation flags the native clients instead of quietly leaving them behind.

const ANDROID_COMPOSER =
  'android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewComposerViewModel.kt'
const IOS_VIEWMODEL = 'ios/TappyAI/Features/Reviews/UI/CreateReviewViewModel.swift'

const read = (p: string) => readFileSync(p, 'utf8')

/** A stand-in video id, substituted for each client's own interpolation syntax. */
const ID = 'VIDEOID'

/**
 * The body of a declaration, from its signature up to the next declaration at the same level.
 * Same slicing technique as clientProviderParity.test.ts — good enough for a contract check, and it
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

/**
 * The single ytimg URL a native composer builds, with the client's id interpolation replaced by
 * [ID] so it can be compared against the web derivation. Throws unless there is exactly one — a
 * second poster URL would mean a branch this guard does not cover.
 */
function posterUrl(body: string, interpolation: RegExp, label: string): string {
  const urls = [...body.matchAll(/"(https:\/\/[^"]*ytimg\.com[^"]*)"/g)].map(m => m[1])
  if (urls.length !== 1) {
    throw new Error(`expected exactly 1 ytimg URL in the ${label} composer, found ${urls.length}`)
  }
  return urls[0].replace(interpolation, ID)
}

describe('native composers derive the YouTube poster the way the web resolver does', () => {
  it('the Android composer builds the authoritative poster URL', () => {
    const body = declarationBody(read(ANDROID_COMPOSER), 'fun onLinkUrlChanged(', [
      '\n    /**',
      '\n    private fun ',
      '\n    private companion object',
    ])
    // Kotlin interpolates the id as `$id`.
    expect(posterUrl(body, /\$id\b/, 'Android')).toBe(youTubeThumbnail(ID))
  })

  it('the iOS composer builds the authoritative poster URL', () => {
    const body = declarationBody(read(IOS_VIEWMODEL), 'func handleURLChange(', [
      '\n    private func ',
      '\n    func ',
    ])
    // Swift interpolates the id as `\(id)`.
    expect(posterUrl(body, /\\\(id\)/, 'iOS')).toBe(youTubeThumbnail(ID))
  })
})

describe('no native composer may reintroduce an unreliable poster size', () => {
  // Belt-and-braces on the derivation check above: it catches a `maxresdefault` URL built anywhere
  // in these files, including a helper the declaration slices would not reach. Comments are exempt
  // — explaining WHY maxresdefault is wrong is exactly what the code should do.
  const isComment = (line: string) => /^\s*(\/\/|\/\*|\*)/.test(line)

  for (const [label, file] of [
    ['Android', ANDROID_COMPOSER],
    ['iOS', IOS_VIEWMODEL],
  ] as const) {
    it(`the ${label} composer builds no maxresdefault URL`, () => {
      const offending = read(file)
        .split(/\r?\n/)
        .filter(l => !isComment(l))
        .filter(l => /maxresdefault/i.test(l))
        .map(l => l.trim())
      expect(offending, `${label} composer builds a poster URL that 404s`).toEqual([])
    })
  }
})
