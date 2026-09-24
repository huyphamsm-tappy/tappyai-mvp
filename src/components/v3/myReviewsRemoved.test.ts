import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

// ── "My Reviews" is gone ────────────────────────────────────────────────────
//
// 🚨 IT WAS A DUPLICATE, NOT A FEATURE. Two entry points carried the label and
// neither led anywhere the product did not already go:
//
//   V3 sidebar     "My Reviews"      → /profile/posts   the viewer's own clips
//   Profile hub    "Review của tôi"  → /reviews         Explore itself
//
// Both rows AND the page went. `/profile/posts` was exclusively that feature,
// and every capability it had already exists in the profile grid
// (`ProfileTab`), which for `isOwnProfile` renders the author's own posts, their
// HIDDEN posts, and delete / hide / unhide — plus Saved and Liked, which
// `/profile/posts` never had. The feed's own per-post menu offers delete and
// hide as well. So nothing was lost; one of three copies was.
//
// What was NOT removed is everything underneath: the `reviews` table, its APIs,
// the feed, the composer, likes, comments, saves and shares. Explore is built on
// all of it.
//
// This file exists because a deletion is the easiest change to half-undo: a
// later edit re-adding the row would look like a fix rather than a regression.

const read = (p: string) => readFileSync(p, 'utf8')
/** Comments discuss the removal at length; only real code is inspected. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('no navigation offers My Reviews', () => {
  it('the V3 sidebar has no such row', () => {
    const src = code(read('src/components/v3/V3Shell.tsx'))
    expect(/v3\.nav\.myReviews/.test(src)).toBe(false)
  })

  it('the profile hub has no such row', () => {
    const src = code(read('src/app/(app)/profile/ProfileRows.tsx'))
    expect(/profile\.myReviews/.test(src)).toBe(false)
  })

  it('no other surface links to it', () => {
    for (const f of [
      'src/components/v3/V3Shell.tsx',
      'src/app/(app)/profile/ProfileRows.tsx',
      'src/app/(app)/profile/ProfileView.tsx',
    ]) {
      expect(/myReviews/.test(code(read(f))), f).toBe(false)
    }
  })
})

describe('the post system Explore depends on is untouched', () => {
  it('the sidebar still offers Explore, Saved and History', () => {
    // The row was removed from the middle of a group; its neighbours must not
    // have gone with it.
    const src = code(read('src/components/v3/V3Shell.tsx'))
    for (const key of ['v3.nav.explore', 'v3.nav.saved', 'v3.nav.history', 'v3.nav.post']) {
      expect(src, key).toContain(key)
    }
  })

  it('the My Reviews page itself is gone', () => {
    // Exclusively the removed feature. Deleting the row but leaving the route
    // would have kept a page nothing links to and every guard still lints.
    expect(existsSync('src/app/(app)/profile/posts')).toBe(false)
  })

  it('but the author can still manage their own posts, from the profile grid', () => {
    // 🚨 THE CAPABILITY, NOT THE PAGE, IS WHAT HAD TO SURVIVE. `ProfileTab`
    // gates on `isOwnProfile` and is where hidden posts, delete and hide/unhide
    // live — it did so before this change and still does.
    const grid = read('src/app/reviews/ProfileTab.tsx')
    expect(grid).toContain('isOwnProfile')
    expect(grid).toMatch(/method: 'DELETE'/)
    expect(grid).toMatch(/is_hidden/)
  })

  it('and from the feed’s own post menu', () => {
    const feed = read('src/app/reviews/feedShared.tsx')
    expect(feed).toContain('reviews.deletePost')
    expect(feed).toContain('reviews.hidePost')
  })

  it('keeps the reviews API the feed is built on', () => {
    expect(() => read('src/app/api/reviews/route.ts')).not.toThrow()
    expect(() => read('src/app/api/reviews/mine/route.ts')).not.toThrow()
  })
})

describe('the removal left nothing dead behind it', () => {
  it('drops the i18n keys only that page used', () => {
    const dict = read('src/lib/i18n/w5/profileLists.ts')
    expect(/'posts\./.test(dict), 'posts.* belonged to the deleted page alone').toBe(false)
  })

  it('is not still named by a guard that requires the file to exist', () => {
    for (const f of [
      'src/lib/i18n/webHardcodedUiStrings.test.ts',
      'src/lib/i18n/appLanguageReachesServer.test.ts',
    ]) {
      expect(/'src\/app\/(app)\/profile\/posts\/page\.tsx'/.test(read(f)), f).toBe(false)
    }
  })
})

describe('the removal left no dead imports', () => {
  it('neither file still imports the icon the row used', () => {
    for (const f of ['src/components/v3/V3Shell.tsx', 'src/app/(app)/profile/ProfileRows.tsx']) {
      const src = code(read(f))
      const importBlocks = src.match(/import[\s\S]*?from 'lucide-react'/) ?? []
      const usesStar = /\bStar\b/.test(src.replace(importBlocks.join('\n'), ''))
      const importsStar = importBlocks.some(b => /\bStar\b/.test(b))
      expect(importsStar && !usesStar, `${f} imports Star without using it`).toBe(false)
    }
  })
})
