// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { SHOW_MUSIC } from '@/lib/config/product'
import { smartTools, smartToolGroups } from '@/lib/tools/registry'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

import V3Shell from './V3Shell'

// ── Music is hidden on every platform, and the underlying code is untouched ──
//
// 🚨 THE LICENSING DECISION IS STILL OPEN. The catalogue served in production is Jamendo API
// hotlinks; Jamendo's API terms are non-commercial without an agreement and TappyAI is monetised
// (`docs/uat/PHASE7-AUDIT.md` R5). Until that is settled a user must not be able to reach Music
// through normal product navigation — on Web, Android or iOS.
//
// 🚨 ONE HIDDEN SIDEBAR ROW IS NOT A HIDDEN FEATURE, which is the whole reason this file scans
// rather than clicks. The entry points were: the sidebar row, the Smart Tools tile, the Explore
// top-bar tab, the same tab on a public profile, the legacy Home card, the composer's Add-music
// chip, the clip's spinning disc, the sound-page overlay it opens, the attached-track card on a
// review, and three direct routes. Each one is asserted below.
//
// 🔑 HIDDEN, NOT DELETED. `src/modules/music`, `/api/music/*`, `/api/sound/*`, the catalogue and
// every migration stay exactly where they are; this file asserts the ENTRY POINTS are gone. One
// boolean per platform brings the feature back whole.

const read = (p: string) => readFileSync(p, 'utf8')

afterEach(cleanup)

describe('the flag is off, and it is the same flag on every platform', () => {
  it('SHOW_MUSIC is false', () => {
    expect(SHOW_MUSIC).toBe(false)
  })

  it('GET /api/config serves it to native as flags.showMusic', () => {
    const route = read('src/app/api/config/route.ts')
    expect(route).toContain('SHOW_MUSIC')
    expect(route).toContain('showMusic: SHOW_MUSIC')
  })

  it('Android carries the mirror, set to the same value', () => {
    const kt = read('android/app/src/main/java/com/tappyai/app/ProductFlags.kt')
    expect(kt).toContain('const val SHOW_MUSIC = false')
  })

  it('iOS carries the mirror, set to the same value', () => {
    expect(read('ios/TappyAI/Core/Config/ProductFlags.swift')).toContain('static let showMusic = false')
    // …and the config contract can decode the server's value when a later pass wants it.
    expect(read('ios/TappyAI/Core/Config/AppConfigService.swift')).toContain('let showMusic: Bool?')
  })
})

describe('web — no navigation offers Music', () => {
  it('the sidebar has no Music row', () => {
    render(<V3Shell title="Home"><div /></V3Shell>)
    expect(screen.queryByRole('link', { name: /nhạc|music/i })).toBeNull()
    for (const link of screen.queryAllByRole('link')) {
      expect(link.getAttribute('href')).not.toMatch(/^\/(music|sound)/)
    }
  })

  it('the Smart Tools registry does not offer it — so neither Home nor /tools can', () => {
    expect(smartTools().some((t) => t.id === 'music')).toBe(false)
    expect(smartToolGroups().flatMap((g) => g.tools).some((t) => t.id === 'music')).toBe(false)
  })

  it('the shell row and the registry row are gated, not deleted', () => {
    // Deleting them would make this a rewrite; the point is that one boolean restores both.
    expect(read('src/components/v3/V3Shell.tsx')).toContain("{ href: '/music', labelKey: 'v3.tool.music', icon: Music2 }")
    expect(read('src/lib/tools/registry.ts')).toContain("id: 'music', href: '/music'")
  })
})

describe('web — no surface offers a way into Music', () => {
  // 🔧 RECONCILED TO THE PHASE7 WEB ARCHITECTURE (merge 2026-09-24, owner Huong 1). rc's b72f5cc
  // gated the REUSE surfaces (the spinning ReviewMusicDisc, the SoundSheet overlay, the legacy
  // HomeView tile). phase7 (F-024 + Session A) had ALREADY removed the reuse path and ships the
  // licensed LIBRARY instead — so those exact markers do not exist here. Each entry below asserts
  // phase7's real gated surface with the SAME flag; the surfaces phase7 removed outright are
  // asserted ABSENT in the block that follows. Intent is unchanged: no navigation reaches Music.
  const gated: [string, string][] = [
    // Explore's top bar and the same bar on a public profile (unchanged — phase7 gates these).
    ['src/app/reviews/ExploreStage.tsx', "...(SHOW_MUSIC ? [{ href: '/music'"],
    ['src/app/users/[id]/PublicProfileView.tsx', "...(SHOW_MUSIC ? [{ href: '/music'"],
    // The composer: the Add-music chip, the selected-track card, the picker, and the payload
    // (unchanged — phase7's LIBRARY picker uses the identical SHOW_MUSIC markers).
    ['src/app/(app)/reviews/new/page.tsx', '{SHOW_MUSIC && !music && ('],
    ['src/app/(app)/reviews/new/page.tsx', '{SHOW_MUSIC && music && ('],
    ['src/app/(app)/reviews/new/page.tsx', '{SHOW_MUSIC && hasOpenedMusicPicker && ('],
    ['src/app/(app)/reviews/new/page.tsx', 'if (SHOW_MUSIC && music) {'],
    // 🔧 CHANGED: phase7's feed shows the LIBRARY soundtrack CREDIT (attached track), not rc's
    // reuse disc. Same gate (SHOW_MUSIC), phase7's marker (origin === 'attached').
    ['src/app/reviews/feedShared.tsx', "{SHOW_MUSIC && r.music?.origin === 'attached'"],
    // 🔧 CHANGED: phase7's detail card is the attached-library credit (origin === 'attached'),
    // not rc's `review.music`. Same gate, phase7's marker.
    ['src/app/reviews/[id]/ReviewDetailView.tsx', "{SHOW_MUSIC && review.music?.origin === 'attached' && ("],
  ]

  it.each(gated)('%s gates its entry point', (file, marker) => {
    const src = read(file)
    expect(src).toContain(marker)
    expect(src).toContain("from '@/lib/config/product'")
  })

  // 🔧 CHANGED: these reuse entry points are DELETED in phase7 (F-024), not gated — the strongest
  // hide. rc's b72f5cc gated them behind SHOW_MUSIC; phase7 removed them, so there is nothing to
  // bring back with the flag. Asserted ABSENT rather than gated. (The legacy Home tile, and the
  // SoundSheet overlay on the feed and the profile grid.)
  it('the legacy HomeView music tile is absent (F-024 removed it)', () => {
    expect(read('src/app/HomeView.tsx')).not.toMatch(/href=["']\/music["']/)
  })
  it('the feed and profile grids carry no SoundSheet reuse overlay (F-024 removed it)', () => {
    expect(read('src/app/reviews/page.tsx')).not.toContain('SoundSheet')
    expect(read('src/app/reviews/ProfileTab.tsx')).not.toContain('SoundSheet')
  })
})

describe('web — a direct visit is not a product surface', () => {
  // phase7's /music is the restored LIBRARY, so it 404s via notFound() while the flag is off —
  // the same answer `/marketplace` uses under `SHOW_MARKETPLACE`.
  it('src/app/(app)/music/page.tsx calls notFound() while the flag is off', () => {
    const src = read('src/app/(app)/music/page.tsx')
    expect(src).toContain('if (!SHOW_MUSIC) notFound()')
    expect(src).toContain("from 'next/navigation'")
  })

  // 🔧 CHANGED: /music/upload and /sound/[trackId] were part of the REUSE path, which phase7
  // withdrew UNCONDITIONALLY (F-024) — a permanent "feature removed" notice, stronger than a flag
  // gate and not dependent on SHOW_MUSIC. Asserted as the removed-notice stub.
  it.each([
    'src/app/(app)/music/upload/page.tsx',
    'src/app/sound/[trackId]/page.tsx',
  ])('%s is the F-024 removed-notice stub (reuse withdrawn unconditionally)', (file) => {
    expect(read(file)).toContain('MusicFeatureRemoved')
  })
})

describe('android — Music is ABSENT, not gated (phase7 removed the surface; Huong 2)', () => {
  // 🔧 REWRITTEN 2026-09-24 (merge Huong 2). rc's b72f5cc GATED a music surface behind
  // ProductFlags.SHOW_MUSIC. This build took phase7's Android instead, which had already REMOVED the
  // Android music surface OUTRIGHT — so there is nothing to gate, which is a stronger hide than a
  // flag. Each assertion below verifies a surface is ABSENT rather than gated. The flag mirror
  // (ProductFlags.SHOW_MUSIC = false) is still asserted present in the first describe, so the
  // cross-platform contract stays symmetric.
  const missing = (p: string) => { try { readFileSync(p, 'utf8'); return false } catch { return true } }

  it('the com.tappyai.app.music package does not exist', () => {
    // The whole library/reuse package (screens, viewmodels, DTOs, repository) was removed on phase7.
    expect(missing('android/app/src/main/java/com/tappyai/app/music/MusicLibraryScreen.kt')).toBe(true)
    expect(missing('android/app/src/main/java/com/tappyai/app/music/SoundDetailScreen.kt')).toBe(true)
    expect(missing('android/app/src/main/java/com/tappyai/app/music/MusicPickerSheet.kt')).toBe(true)
  })

  it('the Smart Tools registry has no Music entry', () => {
    // rc gated it (`it.id != SmartToolId.Music || ProductFlags.SHOW_MUSIC`); phase7 dropped it.
    expect(read('android/app/src/main/java/com/tappyai/app/home/SmartTools.kt')).not.toContain('SmartToolId.Music')
  })

  it('the composer has no Add-music button and the screen no picker wiring', () => {
    expect(read('android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewComposerScreen.kt')).not.toContain('AddMusicButton')
    expect(read('android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt')).not.toContain('showMusicPicker')
  })

  it('no feed/profile sound pill navigates to a SoundSheet route', () => {
    expect(read('android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewsNavHost.kt')).not.toContain('ReviewsRoute.SoundSheet')
    expect(read('android/app/src/main/java/com/tappyai/app/profile/ProfileTab.kt')).not.toContain('ProfileRoute.SoundSheet')
  })

  it('the sound-sheet route variants are not declared', () => {
    expect(read('android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewsRoute.kt')).not.toContain('SoundSheet')
    expect(read('android/app/src/main/java/com/tappyai/app/profile/ProfileRoute.kt')).not.toContain('SoundSheet')
  })
})

describe('ios — the same entry points are gated', () => {
  const gated: [string, string][] = [
    // The composer section (Add-music button + selected-track card) and its picker sheet.
    ['ios/TappyAI/Features/Reviews/UI/CreateReviewView.swift', 'if ProductFlags.showMusic {'],
    ['ios/TappyAI/Features/Reviews/UI/CreateReviewView.swift', 'get: { ProductFlags.showMusic && vm.musicPickerOpen }'],
    // The clip's disc and the sound page it opens.
    ['ios/TappyAI/Features/Reviews/UI/ReviewActionRail.swift', 'if ProductFlags.showMusic {'],
    ['ios/TappyAI/Features/Reviews/UI/ReviewsFeedView.swift', 'ProductFlags.showMusic ? soundPageTrackId.map'],
  ]

  it.each(gated)('%s gates its entry point', (file, marker) => {
    expect(read(file)).toContain(marker)
  })

  it('the library and upload screens have no presenter, so there is nothing to gate', () => {
    // Measured: `MusicLibraryView` and `MusicUploadView` are declared and never presented, so iOS
    // has never had a library entry point. Recorded here so a later pass does not add one by
    // accident while Music is withdrawn.
    const swift = ['ios/TappyAI/Features/Reviews/UI/CreateReviewView.swift', 'ios/TappyAI/Features/Reviews/UI/ReviewsFeedView.swift',
      'ios/TappyAI/Features/Reviews/UI/ReviewActionRail.swift', 'ios/TappyAI/Features/Profile/UI/ProfileMainView.swift',
      'ios/TappyAI/Features/Home/UI/HomeView.swift', 'ios/TappyAI/Features/Home/UI/HomeSectionViews.swift']
      .map(read).join('\n')
    expect(swift).not.toContain('MusicLibraryView(')
    expect(swift).not.toContain('MusicUploadView(')
  })
})
