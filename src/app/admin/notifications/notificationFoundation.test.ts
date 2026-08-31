// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PERMISSIONS, REGISTRY_VERSION } from '@/lib/admin/permissions/registry'
import { permissionRegistry } from '@/lib/admin/permissions/registry'
import { permissionEngine } from '@/lib/admin/permissions/engine'
import { ADMIN_MODULES, buildAdminController, founderHub } from '@/lib/controller/registry/adminModules'
import { deriveNavigation } from '@/lib/controller/navigationProvider'
import type { Actor } from '@/lib/admin/rbac'
import type { AdminRole } from '@/lib/admin/roles'

// Controller Notifications — PHASE A FOUNDATION.
//
// 🔑 WHAT THIS FILE IS ACTUALLY DEFENDING. Phase A ships a page that cannot send
// anything, so there is no send behaviour to test. What there IS is an
// authorization model that must be correct BEFORE any code can message a real
// person — and the single most important property in it is that
// `notifications.send.broadcast` does NOT follow from `notifications.send.user`.
// The role ladder in this product is rank-based and inheriting, so "admin can do
// everything below super_admin" is the default expectation; broadcast being the
// exception is precisely the thing that will erode silently if nothing pins it.

const actor = (roles: AdminRole[], isOwner = false): Actor =>
  ({
    userId: 'u1',
    email: 'someone@tappyai.com',
    roles,
    highestRole: roles[roles.length - 1] ?? null,
    isOwner,
    capabilities: [],
    source: 'cookie',
  }) as unknown as Actor

const ROLES: AdminRole[] = ['analyst', 'moderator', 'admin', 'super_admin']

/** Source text with comments removed — prose that NAMES a forbidden primitive is not a call to it. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('1 · the three approved permissions exist and are the only ones', () => {
  it('declares exactly the Owner-approved notification permissions', () => {
    const ids = permissionRegistry.all
      .map((p) => p.id)
      .filter((id) => id.startsWith('notifications.'))
      .sort()

    expect(ids).toEqual([
      'notifications.history.read',
      'notifications.send.broadcast',
      'notifications.send.user',
    ])
  })

  it('exposes them as typed constants, so a handler cannot use a string literal', () => {
    expect(PERMISSIONS.NOTIFICATIONS_SEND_USER).toBe('notifications.send.user')
    expect(PERMISSIONS.NOTIFICATIONS_SEND_BROADCAST).toBe('notifications.send.broadcast')
    expect(PERMISSIONS.NOTIFICATIONS_HISTORY_READ).toBe('notifications.history.read')
  })

  it('classifies the two send permissions by real blast radius', () => {
    const byId = (id: string) => permissionRegistry.all.find((p) => p.id === id)!
    expect(byId('notifications.send.user').category).toBe('write')
    expect(byId('notifications.send.user').riskLevel).toBe('high')
    // The only unbounded one in the module.
    expect(byId('notifications.send.broadcast').riskLevel).toBe('critical')
    expect(byId('notifications.history.read').category).toBe('read')
  })

  it('the registry version was bumped, so cached permission sets are discarded', () => {
    // Adding permissions without this leaves already-resolved actors on a stale
    // set — they would not gain (or be denied) the new grants until the cache
    // happened to expire.
    expect(REGISTRY_VERSION).toBe('2026-08-29.2')
  })
})

describe('2–4 · the Owner-approved role matrix, exactly', () => {
  const can = (role: AdminRole, permission: string) => permissionEngine.can(actor([role]), permission)

  it.each(ROLES)('send.user — %s', (role) => {
    expect(can(role, PERMISSIONS.NOTIFICATIONS_SEND_USER)).toBe(role === 'admin' || role === 'super_admin')
  })

  it.each(ROLES)('🔑 send.broadcast — %s (super_admin ONLY)', (role) => {
    expect(can(role, PERMISSIONS.NOTIFICATIONS_SEND_BROADCAST)).toBe(role === 'super_admin')
  })

  it.each(ROLES)('history.read — %s (all four)', (role) => {
    expect(can(role, PERMISSIONS.NOTIFICATIONS_HISTORY_READ)).toBe(true)
  })

  it('🔑 broadcast is NOT implied by targeted send — the escalation this split exists to stop', () => {
    // An admin holds send.user. If broadcast ever became reachable from it, the
    // Owner's "super_admin ONLY" decision would be silently void.
    const admin = actor(['admin'])
    expect(permissionEngine.can(admin, PERMISSIONS.NOTIFICATIONS_SEND_USER)).toBe(true)
    expect(permissionEngine.can(admin, PERMISSIONS.NOTIFICATIONS_SEND_BROADCAST)).toBe(false)
  })
})

describe('5 · the Founder goes through the canonical Actor.isOwner mechanism', () => {
  it('reaches all three with NO role at all', () => {
    // isOwner comes from the `platform_owner` table, never from an email and
    // never from `admin_roles`. An owner with zero roles is the real production
    // shape — founder@tappyai.com holds no admin_roles row.
    const owner = actor([], true)
    for (const p of [
      PERMISSIONS.NOTIFICATIONS_SEND_USER,
      PERMISSIONS.NOTIFICATIONS_SEND_BROADCAST,
      PERMISSIONS.NOTIFICATIONS_HISTORY_READ,
    ]) {
      expect(permissionEngine.can(owner, p), `owner denied ${p}`).toBe(true)
    }
  })

  it('🔑 no email-based bypass was created anywhere in this feature', () => {
    // The failure mode being excluded: `if (actor.email === 'founder@tappyai.com')`.
    // An email is an attribute of an identity, not an authority, and a second
    // authorization path is one that disagrees with the first the day either
    // changes.
    const sources = [
      'src/app/admin/notifications/page.tsx',
      'src/components/admin/notifications/NotificationsShell.tsx',
      'src/lib/controller/modules/notificationsModule.ts',
    ]
    for (const f of sources) {
      const code = stripComments(readFileSync(f, 'utf8'))
      expect(code, `${f} references an email`).not.toMatch(/@tappyai\.com/)
      expect(code, `${f} reads actor.email`).not.toMatch(/actor\.email|\.email\s*===/)
    }
  })
})

describe('6–7 · the page guard, and navigation that follows it', () => {
  it('the page guards on notifications.history.read as its FIRST action', () => {
    const src = readFileSync('src/app/admin/notifications/page.tsx', 'utf8')
    expect(src).toContain('requirePagePermission')
    expect(src).toContain('PERMISSIONS.NOTIFICATIONS_HISTORY_READ')
  })

  it.each(ROLES)('the module appears in navigation for %s exactly when the guard would admit them', (role) => {
    const routes = deriveNavigation(buildAdminController(), actor([role]))
      .flatMap((g) => g.items)
      .map((i) => i.route)
    const visible = routes.includes('/admin/notifications')
    const admitted = permissionEngine.can(actor([role]), PERMISSIONS.NOTIFICATIONS_HISTORY_READ)
    expect(visible).toBe(admitted)
  })

  it('an actor with no roles sees no notification entry', () => {
    const routes = deriveNavigation(buildAdminController(), actor([]))
      .flatMap((g) => g.items)
      .map((i) => i.route)
    expect(routes).not.toContain('/admin/notifications')
  })

  it('the manifest declares the surface permission it is actually guarded by', () => {
    const m = ADMIN_MODULES.find((x) => x.id === 'tappy.hub.founder.notifications')!
    expect(m).toBeTruthy()
    expect(m.routes).toEqual(['/admin/notifications'])
    expect(m.navigation.visibilityPermission).toBe(PERMISSIONS.NOTIFICATIONS_HISTORY_READ)
    // Pins the literal hub id in the manifest against the real hub object, so
    // the cycle-avoiding literal cannot drift from `founderHub`.
    expect(m.hub).toBe(founderHub.id)
    // NOT the user hub: it declares permissionScope users.list.read, which would
    // hide this module from analyst and void the Owner's history.read grant.
    expect(m.hub).not.toBe('tappy.hub.user')
  })
})

describe('8–10 · Phase A sends nothing and touches nothing', () => {
  const PHASE_A_FILES = [
    'src/app/admin/notifications/page.tsx',
    'src/components/admin/notifications/NotificationsShell.tsx',
    'src/lib/controller/modules/notificationsModule.ts',
  ]

  it('🔑 no Phase A file can send, write a notification, or reach a provider', () => {
    // The whole safety claim of Phase A in one assertion. If any of these
    // appears, the shell has stopped being a shell.
    for (const f of PHASE_A_FILES) {
      // Comments stripped first: these files EXPLAIN what they must not do, and
      // naming a primitive in prose is not calling it. Scanning raw text flagged
      // my own safety comments as violations.
      const code = stripComments(readFileSync(f, 'utf8'))
      for (const forbidden of [
        'emitNotification',
        'sendNotificationToUser',
        'getAllSubscribedUserIds',
        'createAdminClient',
        'fcm',
        'webpush',
        'web-push',
        "from('notifications",
        'fetch(',
      ]) {
        expect(code.toLowerCase(), `${f} reaches ${forbidden}`).not.toContain(forbidden.toLowerCase())
      }
    }
  })

  it('🔑 no Phase A file uses CRON_SECRET — the Controller never reuses the machine token', () => {
    // The existing /api/notifications/broadcast is gated by CRON_SECRET. Handing
    // that to a human surface would replace a per-actor decision with a shared
    // credential, which is the one thing the Owner explicitly ruled out.
    for (const f of PHASE_A_FILES) {
      expect(stripComments(readFileSync(f, 'utf8'))).not.toContain('CRON_SECRET')
    }
  })

  it('no broadcast implementation exists in Phase A', () => {
    for (const f of PHASE_A_FILES) {
      const code = stripComments(readFileSync(f, 'utf8'))
      // The permission may be NAMED (the shell shows whether it is granted); no
      // broadcast ACTION may exist.
      expect(code).not.toMatch(/broadcast\s*\(|sendBroadcast|export async function (POST|PUT|PATCH)/)
    }
  })

  it('the existing notification primitives are untouched', () => {
    // Phase A adds a surface; it must not have edited the system underneath it.
    // Pinned by content, so an accidental edit shows up here rather than in a
    // production incident.
    const emit = readFileSync('src/lib/notifications/emit.ts', 'utf8')
    expect(emit).toContain('emitNotification — the ONE writer')
    const send = readFileSync('src/lib/notifications/send.ts', 'utf8')
    expect(send).toContain('export async function sendNotificationToUser')
    expect(send).toContain('export async function getAllSubscribedUserIds')
    // 🚨 The legacy route is RETIRED (410) as of §14.2 step 6, so the old
    // assertion here — `toContain('CRON_SECRET')` — is deliberately gone.
    //
    // It would still PASS: the retired handler's header explains that it no
    // longer checks the secret, and a substring match cannot tell an
    // explanation from an implementation. A green test asserting the opposite
    // of the truth is worse than no test, and is exactly the U02 failure mode
    // recorded in STATUS.md. What replaces it is behavioural and lives in
    // `src/app/api/notifications/broadcast/route.test.ts`.
  })

  it('the Controller owns EXACTLY the notification APIs that have been reviewed', async () => {
    // The history of this assertion is the point, so it is kept rather than
    // rewritten:
    //
    //   Phase A (original): the send route did NOT exist.
    //   Phase B (2026-08-29): exactly one Controller-owned endpoint — the
    //     targeted send. The comment then read: "A broadcast route appearing
    //     here would be Phase C arriving without its own review."
    //   Phase C (2026-08-30): that review HAPPENED. The contract is
    //     docs/controller-v2/V2.2_PHASE_C_BROADCAST_CONTRACT.md, and the Owner
    //     answered O-1 = B, O-2 = A, O-3 = A, O-4 = C, O-5 = A before any code
    //     was written.
    //
    // 🚨 THE LOCK IS WIDENED BY EXACTLY ONE ENTRY, NOT REMOVED. Deleting it
    // would retire the only mechanism that makes a THIRD, unreviewed
    // Controller notification endpoint fail a test rather than ship quietly —
    // and that mechanism is the whole reason Phase C had a contract at all.
    const { existsSync, readdirSync } = await import('node:fs')
    expect(existsSync('src/app/api/admin/notifications/send/route.ts')).toBe(true)
    expect(existsSync('src/app/api/admin/notifications/broadcast/route.ts')).toBe(true)
    expect(readdirSync('src/app/api/admin/notifications').sort()).toEqual(['broadcast', 'send'])
  })

  it('🚨 the Controller broadcast route is the GOVERNED one — not the CRON_SECRET path', async () => {
    // The distinction the whole of O-4 rests on. Both files are named
    // "broadcast"; only one of them authorizes a person.
    const governed = stripComments(
      readFileSync('src/app/api/admin/notifications/broadcast/route.ts', 'utf8'),
    )
    expect(governed).toContain('requirePermission')
    expect(governed).toContain('NOTIFICATIONS_SEND_BROADCAST')
    expect(governed).toContain('isSameOrigin')
    expect(governed).not.toContain('CRON_SECRET')

    // …and the legacy machine path is now RETIRED rather than merely present.
    // O-4 = C was satisfied in order: the replacement was verified in
    // production first (2026-08-31), and only then was the old path closed.
    //
    // 🚨 Asserted BEHAVIOURALLY, because the source-text version of this check
    // passes against a retired route — the header still names `CRON_SECRET`
    // while explaining that it is no longer read.
    const { POST: legacyPost } = await import('@/app/api/notifications/broadcast/route')
    const gone = await legacyPost(
      new Request('http://localhost/api/notifications/broadcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer anything' },
        body: JSON.stringify({ title: 'x', body: 'y' }),
      }),
    )
    expect(gone.status).toBe(410)
  })
})
