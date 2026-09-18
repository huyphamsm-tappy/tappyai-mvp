import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Android Inbox ↔ the ADR-014 v1 notification contract ────────────────────
//
// The same drift `androidDealsParity.test.ts` guards, on a different endpoint. `GET
// /api/notifications` moved to contract v1 on 2026-07-26 (an `actor` object, `title` + `body`,
// `category`, `entity_url`, `read_at`, `unread_count`); the Android DTO kept the pre-ADR names
// (`actor_name`, `text`, `url`). The shared Json runs `ignoreUnknownKeys = true`, so a name that
// no longer exists is not an error — it decodes to its default, and every inbox row rendered
// blank for seven weeks with nothing failing.
//
// CI does not run Gradle. This file is what guards the contract on a pull request: every field
// `NotificationDTO` declares must be decoded by the Android DTO under the SAME wire name, and the
// grouping / category taxonomy the Inbox renders from must be the one `inbox.ts` owns.

const CONTRACT = 'src/lib/notifications/contract.ts'
const INBOX = 'src/lib/notifications/inbox.ts'
const ANDROID_DTO = 'android/app/src/main/java/com/tappyai/app/reviews/data/ReviewNetworkDtos.kt'
const ANDROID_SCREEN = 'android/app/src/main/java/com/tappyai/app/notifications/InboxScreen.kt'
const ANDROID_VM = 'android/app/src/main/java/com/tappyai/app/notifications/InboxViewModel.kt'

const read = (p: string) => readFileSync(p, 'utf8')

/** The wire names of `NotificationDTO` in contract.ts. */
function contractFields(): string[] {
  const block = read(CONTRACT).match(/export interface NotificationDTO \{([\s\S]*?)\n\}/)![1]
  return [...block.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1])
}

/** The wire names the Android `NotificationDto` decodes (`@SerialName("x")` wins over the property name). */
function androidDtoWireNames(): string[] {
  const block = read(ANDROID_DTO).match(/data class NotificationDto\(([\s\S]*?)\n\)/)![1]
  return [...block.matchAll(/^\s+(?:@SerialName\("([a-z_]+)"\) )?val ([a-zA-Z]+):/gm)].map((m) => m[1] ?? m[2])
}

describe('the Android NotificationDto decodes contract v1 under the contract\'s own wire names', () => {
  it('every contract field except `data` has a matching wire name on Android', () => {
    // `data` is the free-form payload; nothing on the Inbox renders it, on either platform.
    const expected = contractFields().filter((f) => f !== 'data').sort()
    const android = androidDtoWireNames().sort()
    for (const field of expected) expect(android, `Android decodes "${field}"`).toContain(field)
  })

  it('the pre-ADR names are gone — the ones that decoded to blanks', () => {
    const android = androidDtoWireNames()
    for (const stale of ['actor_name', 'actor_id', 'actor_avatar', 'text', 'url']) expect(android).not.toContain(stale)
  })

  it('the actor object and the page unread total are decoded', () => {
    const src = read(ANDROID_DTO)
    expect(src).toMatch(/data class NotificationActorDto\(/)
    expect(src).toMatch(/@SerialName\("unread_count"\) val unreadCount: Int/)
  })
})

describe('the Android Inbox renders from the taxonomy inbox.ts owns', () => {
  it('CATEGORY_STYLE colours and glyphs are identical', () => {
    const web = read(INBOX).match(/export const CATEGORY_STYLE[\s\S]*?\n\}/)![0]
    const android = read(ANDROID_SCREEN)
    for (const m of web.matchAll(/(\w+): \{ color: '#([0-9A-Fa-f]{6})', icon: '([^']+)' \}/g)) {
      const [, key, hex, icon] = m
      // `system` is Android's `else` branch — the same tint an unknown category wears on the web.
      const pattern = key === 'system' ? `else -> InboxCategoryStyle(Color(0xFF${hex.toUpperCase()}), "${icon}")` : `"${key}" -> InboxCategoryStyle(Color(0xFF${hex.toUpperCase()}), "${icon}")`
      expect(android, `${key} → #${hex} ${icon}`).toContain(pattern)
    }
  })

  it('NOTIF_COLOR — the initial\'s ground per type — is identical', () => {
    const web = read(INBOX).match(/export const NOTIF_COLOR[\s\S]*?\n\}/)![0]
    const android = read(ANDROID_SCREEN)
    for (const m of web.matchAll(/(\w+): '#([0-9A-Fa-f]{6})'/g)) {
      expect(android).toContain(`"${m[1]}" -> Color(0xFF${m[2].toUpperCase()})`)
    }
  })

  it('the filter is the four real categories, in the web\'s order', () => {
    expect(read(ANDROID_VM)).toContain('All(null), Social("social"), Deal("deal"), Explore("explore"), System("system")')
  })

  it('the brand mark for a system row is the same asset the web serves', () => {
    expect(read(INBOX)).toContain("TAPPY_NOTIFICATION_MARK = '/tappy/wave.png'")
    expect(read(ANDROID_SCREEN)).toContain('R.drawable.tappy_wave')
  })
})
