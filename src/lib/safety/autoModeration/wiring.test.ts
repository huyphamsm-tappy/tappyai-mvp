import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Every route that publishes user text must call the moderation gate BEFORE it stores anything. This is a source-order guard: it fails if a route stops calling the gate or moves the call
// after the write. (The gate itself, the rules and the refusals are tested in autoModeration.test.ts.)
const ROUTES: Array<{ file: string; surface: string; firstWrite: RegExp }> = [
  { file: 'src/app/api/reviews/[id]/comments/route.ts', surface: 'comment', firstWrite: /\.from\('review_comments'\)\s*\n?\s*\.insert/ },
  { file: 'src/app/api/reviews/route.ts', surface: 'review', firstWrite: /claimVideoForPost\(\{|\.insert\(reviewData\)/ },
  { file: 'src/app/api/profile/route.ts', surface: 'profile', firstWrite: /setDateOfBirth\(supabase, iso\)|\.from\('profiles'\)\s*\n?\s*\.update/ },
  { file: 'src/app/api/group/route.ts', surface: 'group', firstWrite: /\.from\('groups'\)\s*\n?\s*\.insert/ },
  { file: 'src/app/api/group/[id]/join/route.ts', surface: 'group', firstWrite: /\.from\('group_members'\)\s*\n?\s*\.insert|\.insert\(/ },
  { file: 'src/app/api/plans/share/route.ts', surface: 'plan', firstWrite: /\.from\('plan_shares'\)\s*\n?\s*\.insert/ },
]

const IMAGE_ROUTES: Array<{ file: string; surface: string; call: RegExp }> = [
  { file: 'src/app/api/reviews/upload/route.ts', surface: 'review', call: /refuseUnsafeImage\(req, user\.id, 'review'/ },
  { file: 'src/app/api/group/[id]/avatar/route.ts', surface: 'group', call: /refuseUnsafeImage\(req, user\.id, 'group'/ },
  { file: 'src/app/api/profile/route.ts', surface: 'profile', call: /refuseUnsafeImage\(req, user\.id, 'profile'/ },
]

describe('every route that stores a public picture looks at it with the gate before storing it', () => {
  for (const r of IMAGE_ROUTES) {
    it(r.file, () => {
      const src = readFileSync(r.file, 'utf8')
      const calls = [...src.matchAll(new RegExp(r.call.source, 'g'))].map(m => m.index!)
      const puts = [...src.matchAll(/await putMedia\(/g)].map(m => m.index!)
      expect(calls.length, 'the route must call refuseUnsafeImage').toBeGreaterThan(0)
      expect(puts.length).toBeGreaterThan(0)
      // every storage write has a gate call before it, and the two lists pair up one to one
      expect(calls.length).toBe(puts.length)
      calls.forEach((c, i) => expect(c, 'gate before write #' + i).toBeLessThan(puts[i]))
      expect(src).toMatch(/if \(imageRefusal\) return imageRefusal/)
    })
  }
})

describe('every route that publishes user text asks the moderation gate first', () => {
  for (const r of ROUTES) {
    it(r.file, () => {
      const src = readFileSync(r.file, 'utf8')
      const call = src.indexOf(`refuseUnsafeText(req, user.id, '${r.surface}'`)
      expect(call, 'the route must call refuseUnsafeText').toBeGreaterThan(-1)
      expect(src).toMatch(/from '@\/lib\/safety\/autoModeration\/http'/)
      const write = src.search(r.firstWrite)
      expect(write, 'the first write must be found by this guard (update the pattern if the route changed)').toBeGreaterThan(-1)
      expect(call, 'the gate must run before the first write').toBeLessThan(write)
      // a refusal is returned, never ignored
      expect(src.slice(call, call + 220)).toMatch(/if \(moderationRefusal\) return moderationRefusal|if \(moderationRefusal\) return moderationRefusal/)
    })
  }
})
