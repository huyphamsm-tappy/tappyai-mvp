import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * ============================================================================
 * THREE THINGS THAT LOOK ALIKE AND MUST NEVER MERGE
 * ============================================================================
 *
 *   User ↔ TappyAI    `conversations` + /api/chat + /api/conversations
 *                     The AI assistant. One owner, turns in a JSONB blob.
 *
 *   User ↔ User       `chat_threads` + /api/messaging
 *                     Real participants, real message rows, real read state.
 *
 *   System → User     `notifications` + /api/notifications
 *                     Likes, follows, comments, deals. Not a conversation.
 *
 * Every one of them has a "message", an "unread count" and a "conversation" in
 * its vocabulary, which is exactly why this file exists. These are source-level
 * assertions rather than behavioural ones on purpose: the failure they guard
 * against is a future edit that reaches for the nearest similarly-named thing,
 * and by the time that shows up in behaviour the data models have already been
 * welded together.
 */

const read = (p: string) => readFileSync(p, 'utf8')

/** Comments discuss the other systems at length; only real code is inspected. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('social messaging never reaches into the AI assistant', () => {
  const files = [
    'src/app/api/messaging/threads/route.ts',
    'src/app/api/messaging/threads/[id]/messages/route.ts',
    'src/app/api/messaging/threads/[id]/read/route.ts',
    'src/lib/messaging/summaries.ts',
    'src/lib/messaging/types.ts',
  ]

  it('no messaging file reads the `conversations` table', () => {
    for (const f of files) {
      const src = codeOnly(read(f))
      expect(/from\(\s*['"]conversations['"]\s*\)/.test(src), `${f} must not query conversations`).toBe(false)
    }
  })

  it('no messaging file calls the assistant endpoints', () => {
    for (const f of files) {
      const src = codeOnly(read(f))
      expect(/['"]\/api\/(chat|conversations)\b/.test(src), `${f} must not call the AI endpoints`).toBe(false)
    }
  })

  it('the assistant does not reach the other way either', () => {
    const src = codeOnly(read('src/app/api/conversations/route.ts'))
    expect(/chat_threads|chat_messages|api\/messaging/.test(src)).toBe(false)
  })

  it('messaging never touches the Nhóm ăn tables', () => {
    for (const f of files) {
      const src = codeOnly(read(f))
      expect(/from\(\s*['"]group(_members)?['"]\s*\)/.test(src), `${f}`).toBe(false)
    }
  })
})

describe('message unread and notification unread are independent', () => {
  it('MessagesProvider never reads the notification store', () => {
    const src = codeOnly(read('src/components/messaging/MessagesProvider.tsx'))
    expect(/useNotifications|NotificationProvider/.test(src),
      'the message count must not be derived from, or contribute to, the notification count').toBe(false)
    expect(/from\(\s*['"]notifications['"]\s*\)/.test(src)).toBe(false)
  })

  it('NotificationProvider is untouched by messaging', () => {
    const src = read('src/components/NotificationProvider.tsx')
    expect(/chat_threads|chat_messages|messaging/.test(src),
      'this feature does not modify the notification provider').toBe(false)
  })

  it('the Inbox reads two counts from two stores and never adds them', () => {
    const src = codeOnly(read('src/app/(app)/profile/notifications/NotificationsView.tsx'))
    // Both stores are consulted…
    expect(src).toContain('useNotifications()')
    expect(src).toContain('useMessages()')
    // …and neither total is combined into one number.
    expect(/messageUnread\s*\+\s*notificationUnread|notificationUnread\s*\+\s*messageUnread/.test(src),
      '“Tin nhắn 3 · Thông báo 5” are two facts, not one split in half').toBe(false)
  })
})

describe('messages are not notifications', () => {
  it('the `message` notification type exists but is inert until the flag is on', () => {
    // 🔄 THIS ASSERTION WAS INVERTED, DELIBERATELY. Phase 1 forbade the member
    // outright because adding it would ship a value the Android and iOS clients
    // do not handle. The Phase 6 scope correction requires the Messenger → Inbox
    // flow, so the member now exists — and the native contract is protected by a
    // different mechanism instead: nothing can emit it while the flag is off.
    //
    // The guarantee this file must hold is unchanged: no device receives a
    // notification type it cannot render. What changed is where that is
    // enforced. Read from source rather than imported, so the assertion is about
    // the shared union itself.
    const union = read('src/lib/notifications/emit.ts')
      .split('export type NotificationType')[1]
      ?.split('export type NotificationCategory')[0] ?? ''
    expect(union.length, 'the NotificationType union must be findable').toBeGreaterThan(0)
    expect(/\|\s*'message'/.test(union), 'the Messenger → Inbox flow needs the type').toBe(true)

    // The flag, and its fail-safe default, are the whole protection.
    const notif = codeOnly(read('src/lib/messaging/messageNotifications.ts'))
    expect(notif).toContain("env.MESSAGE_NOTIFICATIONS_ENABLED === 'true'")
    expect(/if \(!messageNotificationsEnabled\(env\)\) return/.test(notif),
      'the flag must be checked before any work, not after').toBe(true)
  })

  it('the message notification carries a pointer, never the message', () => {
    // The one place the two systems touch is the place a body could cross over.
    const src = codeOnly(read('src/lib/messaging/messageNotifications.ts'))
    // No caller-supplied body reaches the notification: the input type has no
    // field for one, and `body:` is a module constant.
    expect(/body\??:\s*string/.test(src),
      'MessageNotificationInput must have no message-body field').toBe(false)
    expect(src).toContain('body: MESSAGE_NOTIFICATION_BODY')
    for (const leak of ['messageBody', 'preview', 'snippet', 'lastMessage']) {
      expect(src.includes(leak), `"${leak}" would put private content in a notification`).toBe(false)
    }
  })

  it('nothing converts a notification row into a message', () => {
    const src = codeOnly(read('src/components/messaging/MessagesProvider.tsx'))
    expect(/mapDtoToInbox|groupNotifs|NotificationDTO/.test(src)).toBe(false)
  })

  it('the messaging Realtime channel listens to chat_messages, not notifications', () => {
    const src = codeOnly(read('src/components/messaging/MessagesProvider.tsx'))
    expect(src).toContain("table: 'chat_messages'")
    expect(/table:\s*['"]notifications['"]/.test(src)).toBe(false)
  })
})

describe('realtime is real', () => {
  it('the provider subscribes to postgres_changes and never polls', () => {
    const src = codeOnly(read('src/components/messaging/MessagesProvider.tsx'))
    expect(src).toContain('postgres_changes')
    // 🚨 `setInterval` here would be a poll wearing realtime's clothes. The only
    // timer in the file is the debounce that collapses a burst of INSERTs into
    // one list refetch.
    expect(/setInterval/.test(src), 'no polling loop may stand in for a subscription').toBe(false)
  })

  it('no messaging component persists conversations in localStorage', () => {
    for (const f of [
      'src/components/messaging/MessagesProvider.tsx',
      'src/components/messaging/MessagesTab.tsx',
      'src/components/messaging/ThreadList.tsx',
      'src/components/messaging/ThreadView.tsx',
      'src/components/messaging/NewMessageSheet.tsx',
    ]) {
      expect(/localStorage|sessionStorage/.test(codeOnly(read(f))), `${f}`).toBe(false)
    }
  })
})
