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
  const gated: [string, string][] = [
    // Explore's top bar and the same bar on a public profile.
    ['src/app/reviews/ExploreStage.tsx', "...(SHOW_MUSIC ? [{ href: '/music'"],
    ['src/app/users/[id]/PublicProfileView.tsx', "...(SHOW_MUSIC ? [{ href: '/music'"],
    // The legacy Home tool card.
    ['src/app/HomeView.tsx', '{SHOW_MUSIC && ('],
    // The composer: the Add-music chip, the selected-track card, the picker, and the payload.
    ['src/app/reviews/new/page.tsx', '{SHOW_MUSIC && !music && ('],
    ['src/app/reviews/new/page.tsx', '{SHOW_MUSIC && music && ('],
    ['src/app/reviews/new/page.tsx', '{SHOW_MUSIC && hasOpenedMusicPicker && ('],
    ['src/app/reviews/new/page.tsx', 'if (SHOW_MUSIC && music) {'],
    // The clip's disc — the tap target for the sound page.
    ['src/app/reviews/feedShared.tsx', '{SHOW_MUSIC && r.content_type === '],
    // The sound-page overlay, from the feed and from the profile grid.
    ['src/app/reviews/page.tsx', '{SHOW_MUSIC && soundTrackId && <SoundSheet'],
    ['src/app/reviews/ProfileTab.tsx', '{SHOW_MUSIC && soundTrackId && <SoundSheet'],
    // The attached-track card on a review.
    ['src/app/reviews/[id]/ReviewDetailView.tsx', '{SHOW_MUSIC && review.music && ('],
  ]

  it.each(gated)('%s gates its entry point', (file, marker) => {
    const src = read(file)
    expect(src).toContain(marker)
    expect(src).toContain("from '@/lib/config/product'")
  })
})

describe('web — a direct visit is not a product surface', () => {
  // `notFound()` is this app's own answer for a route that is not there — the same one
  // `/marketplace` uses under `SHOW_MARKETPLACE`. No new "unavailable" screen was invented.
  it.each([
    'src/app/music/page.tsx',
    'src/app/music/upload/page.tsx',
    'src/app/sound/[trackId]/page.tsx',
  ])('%s calls notFound() while the flag is off', (file) => {
    const src = read(file)
    expect(src).toContain('if (!SHOW_MUSIC) notFound()')
    expect(src).toContain("from 'next/navigation'")
  })
})

describe('android — the same entry points are gated', () => {
  const gated: [string, string][] = [
    // The registry view the Home rail and the Smart Tools page both read.
    ['android/app/src/main/java/com/tappyai/app/home/SmartTools.kt', 'it.id != SmartToolId.Music || ProductFlags.SHOW_MUSIC'],
    ['android/app/src/main/java/com/tappyai/app/home/HomeScreen.kt', 'smartTools().filter { it.id in previewed }'],
    ['android/app/src/main/java/com/tappyai/app/home/SmartToolsScreen.kt', 'filterSmartTools(smartTools(), query)'],
    // The destinations, refused even if a stale callback survives.
    ['android/app/src/main/java/com/tappyai/app/home/HomeTabHost.kt', 'onOpenMusic = { if (ProductFlags.SHOW_MUSIC)'],
    ['android/app/src/main/java/com/tappyai/app/home/HomeTabHost.kt', 'SmartToolId.Music -> if (ProductFlags.SHOW_MUSIC)'],
    // The composer's Add-music button and its picker.
    ['android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewComposerScreen.kt', 'if (ProductFlags.SHOW_MUSIC) AddMusicButton'],
    ['android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt', 'onAddMusic = { if (ProductFlags.SHOW_MUSIC) showMusicPicker = true }'],
    // The clip's sound pill, and the sound sheet it opens from either surface.
    ['android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewCard.kt', 'if (ProductFlags.SHOW_MUSIC && music?.origin != null'],
    ['android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewsNavHost.kt', 'if (ProductFlags.SHOW_MUSIC) navController.navigate(ReviewsRoute.SoundSheet'],
    ['android/app/src/main/java/com/tappyai/app/profile/ProfileTab.kt', 'if (ProductFlags.SHOW_MUSIC) navController.navigate(ProfileRoute.SoundSheet'],
    // The attached-track card on the detail screen.
    ['android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt', 'takeIf { ProductFlags.SHOW_MUSIC }'],
  ]

  it.each(gated)('%s gates its entry point', (file, marker) => {
    expect(read(file)).toContain(marker)
  })

  it('the music package itself is untouched', () => {
    expect(read('android/app/src/main/java/com/tappyai/app/music/MusicLibraryScreen.kt').length).toBeGreaterThan(0)
    expect(read('android/app/src/main/java/com/tappyai/app/music/SoundDetailScreen.kt').length).toBeGreaterThan(0)
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
