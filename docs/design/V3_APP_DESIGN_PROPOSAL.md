# TappyAI V3 — App Design Proposal (Android + iOS)

**Phase:** 4A — **Revision V2** (post human review) · **Status:** Reflects APPROVED decisions
**Implementation:** NOT STARTED · **Production:** UNCHANGED · **Phase 4B:** BLOCKED

> **Revision V2 — binding constraints**
> - **Home is AI-first but NOT Chat.** Submitting the Home composer **navigates to the Chat tab**;
>   Home never renders a thread or streams a reply. (DD-002 / OD-1)
> - **No tool is removed** to make Home AI-first.
> - **Five tabs unchanged**; no sixth tab, **no Inbox tab**. (DD-003, OD-4)
> - **Android and iOS remain platform-native and are NOT pixel-identical.**
> - **Device context is visible and revocable**; do not repeatedly re-ask when a chip suffices.
>   (DD-011)
> - **Notifications: presentation and destination only.** No changes to delivery, consent, push
>   identity, or security. (DD-012)
> - **Comparison:** bottom sheet where appropriate. **Confirmation:** sheet. (DD-005, DD-006)
> - **Spacing tokens: HOLD** — no migration approved; specs state values, not token names. (OD-5)
> - **"For You" is a discovery/content preview** using existing V3-available data/capabilities.
>   **Not a personalization system.** (ND-001)

Covers the `V3-Design.md` App mandate: mobile-first navigation · AI-first experience ·
consultative conversation · **context presentation** · recommendation UI · action UI ·
confirmation states · **notifications** · loading/error/empty states.

> *"Implement the V3 mobile experience without simply copying the web layout 1:1."* — `V3-Design.md`

---

## 1. The App is not the Web

| | Web | App |
|---|---|---|
| Session | Longer, often desktop, deliberate | Short, one-handed, in the moment |
| Entry | Often a URL or a task | Launch icon, often mid-decision |
| Input | Keyboard-first | Thumb, voice, camera |
| Context | User supplies it | **Device supplies it** — location, camera, notifications |
| Output | Can be denser | Must be scannable at a glance |

**Design consequence:** the App leads with the *cheapest possible way to start* — voice, camera, a
tap — and uses device context to shorten consultation. This is the App's distinctive V3 value, and
it is why the App is not a narrow Web page.

---

## 2. App shell

Both platforms already share the 5-tab model (Android `HomeTab.kt`, iOS `AppTab.swift`) with the
Web. **Keep it.**

```
┌─────────────────────────────┐
│  App bar (contextual)       │  Android: TappyAppBar
├─────────────────────────────┤  iOS: NavigationStack title
│                             │
│         Tab content         │
│                             │
├─────────────────────────────┤
│  🏠   💬   🧭   🏷   👤     │  Android: TappyBottomNavBar
│ Home Chat Expl Deals Prof   │  iOS: TabView
└─────────────────────────────┘
```

**Tablet / large width:** Android already has `TappyNavRail` and `WindowSize` in
`:core:designsystem` — use the rail at expanded width. iOS: regular size class may use a sidebar.
**Not required for V3;** noted as available.

---

## 3. Home — AI-first, mobile-native

The App Home is **not** the Web Home shrunk. It leads with the three cheapest ways to start.

> **Home is AI-first, not Chat (binding).** Tapping the composer or a fast start **navigates to
> the Chat tab**. Home does not render a thread, does not stream, and does not show assistant
> replies in place. Tools remain on Home and **none is removed**.

```
┌─────────────────────────────────────┐
│  Chào bạn 👋                        │
│  Hôm nay cần giúp gì?               │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ 💬 Hỏi Tappy…      [📎][🎤]   │  │  ← tap = full composer
│  └───────────────────────────────┘  │
│                                     │
│   ┌────────┐ ┌────────┐ ┌────────┐  │  ← THREE FAST STARTS
│   │   🎤   │ │   📷   │ │   📍   │  │     mobile-only,
│   │  Nói   │ │  Quét  │ │ Gần đây│  │     not on Web
│   └────────┘ └────────┘ └────────┘  │
├─────────────────────────────────────┤
│  Tiếp tục                           │
│  ┌─────────────────────────────┐    │
│  │ Quán ăn Q1 · 2 giờ trước    │    │
│  └─────────────────────────────┘    │
├─────────────────────────────────────┤
│  Dành cho bạn        (horizontal →) │  ← discovery/content preview,
│                                     │     existing sources (ND-001)
├─────────────────────────────────────┤
│  Công cụ                            │
│  [Quét][Chia bill][Dịch][Tỷ giá]    │
│  [Xem tất cả]                       │
├─────────────────────────────────────┤
│  🏠  💬  🧭  🏷  👤                 │
└─────────────────────────────────────┘
```

**Voice · Camera · Nearby** are the App's differentiator: they turn device capability into a
started consultation without typing. All three already exist as capabilities (voice input, scan,
location) — this is **presentation**, not new function.

---

## 4. Conversation

```
┌─────────────────────────────────────┐
│  ←  Tappy                      ⋯    │
├─────────────────────────────────────┤
│              ┌────────────────────┐ │
│              │ Gợi ý quán ăn tối  │ │
│              └────────────────────┘ │
│                                     │
│  🦦 Bạn muốn khu nào, giá bao nhiêu?│
│     [Q1] [Q3] [Gần tôi]             │  ← horizontally scrollable
│     [<300k] [300–600k] [>600k]      │
│                                     │
│  🦦 Mình gợi ý 3 chỗ.               │
│  ┌─────────────────────────────┐    │
│  │ [ảnh]                       │    │  ← RecommendationCard
│  │ Nhà hàng A        ✓ Khớp    │    │     full-bleed within gutter
│  │ Hải sản · 1.2km · 4.6★      │    │
│  │ 400–600k                    │    │
│  │ [ Đặt bàn ]    [ Bản đồ ]   │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ B · 350–500k · ~ Khác    ›  │    │  ← compact rows
│  │ C · chưa rõ  · ? Chưa rõ ›  │    │
│  └─────────────────────────────┘    │
│  [ So sánh 3 lựa chọn ]             │  ← opens a SHEET on mobile
│                                     │
│  [Gần đó?] [Rẻ hơn?] [Kế hoạch]     │
├─────────────────────────────────────┤
│  [📎] [ Nhắn…          ] [🎤] [→]   │
└─────────────────────────────────────┘
```

**Mobile-specific decisions**
- Comparison opens a **bottom sheet**, not an inline table — a 4-column table inside a 360dp
  thread is unreadable. Same data, same reason, same actions; different container.
- Alternative rows are tappable to expand in place.
- Follow-up chips scroll horizontally.
- The composer respects keyboard insets and safe areas.

---

## 5. Context presentation (App-specific, named in `V3-Design.md`)

Where the App uses device context, it must be **visible and revocable** — never silent.

| Context | Use | Presentation |
|---|---|---|
| Location | "near me" | A small removable context chip above the composer: `📍 Quận 1 ✕` |
| Camera/photo | scan, identify | Thumbnail above the composer with a remove control |
| Time of day | "tonight" | Implicit; **stated in the reply** if it changed the answer |
| Prior conversation | continuity | "Continue" entry on Home |

**Rules:** context is shown before it is used, removable in one tap, and never sent without the
user's awareness. If context changed the answer, the reply says so in one short line. This is a
trust requirement, not a convenience.

---

## 6. Comparison — bottom sheet

```
┌─────────────────────────────────────┐
│  ────                               │  drag handle
│  So sánh 3 lựa chọn            [✕]  │
├──────────┬──────────┬───────────────┤
│          │ A ✓Đề xuất│ B      │ C   │  ← horizontal scroll,
│  Giá     │ 400–600k │ 350–500k│ ?   │     attribute column pinned
│  Cách    │ 1.2 km   │ 2.8 km  │0.9km│
│  Đánh giá│ 4.6★     │ 4.2★    │4.8★ │
│  Đặt bàn │ Có       │ Không   │ Có  │
├──────────┴──────────┴───────────────┤
│  Vì sao A: khớp giá, còn bàn tối nay│
│  [ Đặt bàn A ]                      │
└─────────────────────────────────────┘
```

Android: `TappyBottomSheet` (exists in `:core:designsystem`). iOS: `.sheet` with detents.

---

## 7. Confirmation — sheet, not dialog

```
┌─────────────────────────────────────┐
│  ────                               │
│  Xác nhận đặt bàn                   │
│                                     │
│  Tappy sẽ gửi yêu cầu tới Nhà hàng A│
│    • 2 người · Tối nay 19:30        │
│    • Liên hệ: 09xx xxx xxx          │
│  Nhà hàng sẽ xác nhận lại với bạn.  │
│                                     │
│  [      Gửi yêu cầu      ]          │  primary, full width
│  [        Huỷ            ]          │  secondary
└─────────────────────────────────────┘
```

**Mobile prefers sheets over dialogs.** Destructive actions use `danger` and name the object.
Swipe-to-dismiss = cancel; **it never confirms.** A pending confirmation abandoned by backgrounding
or navigation fails closed.

---

## 8. Notifications (App scope, named in `V3-Design.md`)

Exists today (FCM, push identity binding, inbox). V3 changes **presentation and destination**, not
delivery.

| Type | Behaviour |
|---|---|
| Reply / result ready | Deep-links to the **exact thread**, scrolled to the message |
| Plan reminder | Deep-links to the plan |
| Price watch | Deep-links to the item |
| Marketing | Governed by existing consent; unchanged |

**Rules:** every notification lands on the specific object, never a generic tab · content is
plain-language, never a marker or internal id · badge counts reflect genuinely unread items ·
**no notification implies an action was taken on the user's behalf** unless the user confirmed it.

> **Do not touch the push identity or consent implementation.** It was hardened separately and is
> outside Phase 4. Presentation only.

---

## 9. Platform-native behaviour

### Shared (MUST MATCH)
Meaning · content · data · available actions · states · design tokens · accessibility minimums ·
the honesty rule · the action boundary.

### Android-specific (MAY DIFFER)

| Aspect | Approach |
|---|---|
| Navigation | Nested `NavHost` per tab; tab back stacks preserved |
| Back | System back + **predictive back**; back inside a thread returns to the list, not the app |
| Sheets | `TappyBottomSheet` |
| Dialogs | `TappyDialog` — consequential confirmations only |
| Motion | Material motion; `:core:designsystem/theme/Motion.kt` |
| Large screens | `TappyNavRail` + `WindowSize` |
| Dynamic colour | API 31+ seeded from the fixed scheme — **brand hue must survive** |
| Keyboard | IME insets; composer above the keyboard |

### iOS-specific (MAY DIFFER)

| Aspect | Approach |
|---|---|
| Navigation | `NavigationStack` per tab in a `TabView` |
| Back | Swipe-back; never blocked mid-thread |
| Sheets | `.sheet` with detents |
| Dialogs | `.confirmationDialog` (light) / `.alert` (consequential) |
| Motion | SwiftUI defaults; honour Reduce Motion |
| Dynamic Type | Full support — already the strongest platform here |
| Haptics | Light on confirm; **never** on streaming tokens |
| Keyboard | Safe-area aware composer |

**Android and iOS must not be pixel-identical.** They must be *informationally* identical.

---

## 10. App states

| State | Android | iOS |
|---|---|---|
| Loading | `TappyLoadingIndicator`, `TappySkeleton` | `TappyStateViews` |
| Streaming | Typing dots + rotating hint (parity comment at `ChatScreen.kt:1026`) | Same |
| Empty | `TappyEmptyState` | `ChatEmptyState.swift` |
| Error | Inline bubble + `MessageActionBar` suppressed | `ChatErrorBanner` |
| **Offline** | Composer disabled, plain explanation, queued draft preserved | Same |
| Partial data | "chưa rõ" — **never** a blank or an inferred value | Same |
| Confirmation | Bottom sheet | `.sheet` |
| Success | Plain result line + optional light haptic | Same |

**Offline is App-specific and currently under-specified on both platforms — flagged as a V3 gap.**

---

## 11. App findings

| # | Finding | Impact |
|---|---|---|
| **A-1** | **Shopping decision renders nothing** on either platform (D1) — data arrives and is discarded | A |
| **A-2** | **CTA parsing diverges** (D2): Android renders raw JSON to users; iOS deletes prose after the block | A |
| **A-3** | Comparison absent (D3) | A |
| **A-4** | Confirmation ad-hoc (D4) | A |
| **A-5** | Android DS exists (`:core:designsystem`) but chat still carries 123 raw colours / 442 raw `.dp` | A |
| **A-6** | `ChatScreen.kt` is a 1124-line monolith; iOS is properly decomposed | A |
| **A-7** | Android and iOS spacing **token names** diverge (`md` = 8dp vs 16pt). The token audit found this is a **naming offset, not a value conflict** — the ladders share 4/8/12/16/24/32/48, and Android's reproduces `UI_GUIDELINES.md §6` exactly. **OD-5 HOLD; no migration approved.** See `V3_SPACING_TOKEN_AUDIT.md` | A |
| **A-8** | Offline behaviour under-specified on both | A |

**Every App finding is impact class A.** No backend change is required for any of them.

---

## 12. App risks

| Risk | Mitigation |
|---|---|
| Android/iOS chat files are **not** touched by Phases 1/3 | ✅ Low conflict — **start here** |
| Fixing D2 touches the path every message flows through | Shared fixtures land and fail first |
| Token unification requires resolving OD-5 | Human decision before any migration |
| Dynamic colour could distort brand | Pin brand hue; verify on API 31+ |
| Notification deep links must not leak internal ids | Presentation-only rule; no identity changes |
