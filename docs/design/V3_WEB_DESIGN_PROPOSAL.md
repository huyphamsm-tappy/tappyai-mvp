# TappyAI V3 — Web Design Proposal

**Phase:** 4A — **Revision V2** (post human review) · **Status:** Reflects APPROVED decisions
**Implementation:** NOT STARTED · **Production:** UNCHANGED · **Phase 4B:** BLOCKED

> **Revision V2 — binding constraints**
> - **Home is AI-first but NOT Chat.** No thread, no streaming, no assistant replies in place.
>   Submitting from the Home composer **navigates to `/chat`**. (DD-002 / OD-1)
> - **No tool is removed** to make Home AI-first.
> - **Five tabs unchanged**; no sixth tab. (DD-003)
> - **Explore keeps its identity**; only the bridge is added. (OD-2)
> - **Deals stays top-level**, not a Marketplace. (OD-3)
> - **Desktop: PROVISIONAL** — responsive only, **no persistent sidebar**. The sidebar is recorded
>   as a FUTURE / deferred alternative and **must not be implemented**. (OD-6)
> - **Inbox: HOLD** — placement unchanged. (OD-4)
> - **Spacing tokens: HOLD** — no migration approved. Specs below state values, not token names.
>   (OD-5)
> - **"For You" is a discovery/content preview** using existing V3-available data/capabilities.
>   **Not a personalization system** — no profiling, ranking, scoring or recommendation backend.
>   (ND-001)

Covers the `V3-Design.md` Web mandate: navigation · home/entry · **AI-first entry point** ·
consultative conversation UI · response components · recommendation presentation · option
comparison · action confirmation · loading/error/empty states · responsive · accessibility.

> **No mockup images exist.** Everything below is ASCII wireframe, Mermaid, or prose. Nothing here
> was rendered in a design tool.

---

## 1. Global shell

```
┌──────────────────────────────────────────────────────────────┐
│  HEADER   [Tappy]        …               [🔔] [🌐] [avatar]  │  56px, sticky
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    max-w-container-content (768px)           │
│                          centred at every width              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  BOTTOM NAV   Home · Chat · Explore · Deals · Profile        │  64px, mobile
└──────────────────────────────────────────────────────────────┘
```

**Preserved from today:** header, 5-tab bottom nav, the 768px content column, `/reviews` taking
over its own chrome. **Changed:** nothing structural. Shell changes are visual only.

**Desktop (`lg` ≥1024) — 🟡 PROVISIONAL (OD-6).**

**Direction for V3: responsive only.** Tabs move into the header at `lg+`; the content column
stays centred and capped. **No persistent sidebar.**

| | (a) Responsive only — **PROVISIONAL DIRECTION** | (b) Persistent left sidebar |
|---|---|---|
| Nav at `lg+` | Tabs move into the header | Sidebar replaces bottom nav |
| Effort | Low | Medium |
| Risk | None | Changes the desktop navigation model |
| Mandate | Satisfies "responsive behavior" | Beyond stated V3 scope |
| Status | **PROVISIONAL — subject to final Web design approval** | **FUTURE / deferred — do not implement** |

`V3-Design.md` asks for responsive behaviour, not a desktop application. **(b) is recorded as a
deferred alternative only and must not be built in Phase 4B.**

---

## 2. Home — the AI-first entry point

The single most important Web change. **Reorder and regroup; remove nothing.**

> **What "AI-first" means here (approved, binding).** The **primary action** and the **visual
> hierarchy** centre on asking Tappy. Home remains a **broader entry surface** for continuation,
> personalised content, discovery and tools.
>
> **What Home is NOT:** it does not render a message thread, does not stream, does not display
> assistant replies in place, and does not replace the Chat tab. **Submitting the composer
> navigates to `/chat`** — carrying the text exactly as `/chat?q=` does today. Home is a *door*,
> not a *room*.

### 2.1 Proposed layout

```
┌──────────────────────────────────────────────────────────┐
│  HEADER                                                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│     Chào bạn 👋                          ← greeting      │
│     Hôm nay bạn cần giúp gì?             ← H2            │
│                                                          │
│   ┌────────────────────────────────────────────────┐     │
│   │  💬  Hỏi Tappy bất cứ điều gì…      [📎][🎤][→]│     │  ← COMPOSER, not a
│   └────────────────────────────────────────────────┘     │     search box
│                                                          │
│   [ Ăn tối gần đây ] [ Đặt lịch spa ] [ So sánh giá ]     │  ← contextual chips
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Tiếp tục                                     Xem tất cả │  ← CONTINUE
│   ┌──────────────┐ ┌──────────────┐                      │     (only if exists)
│   │ Quán ăn Q1   │ │ Kế hoạch ĐN  │                      │
│   │ 2 giờ trước  │ │ 3 bước còn   │                      │
│   └──────────────┘ └──────────────┘                      │
├──────────────────────────────────────────────────────────┤
│  Dành cho bạn                                 Xem tất cả │  ← DISCOVERY/CONTENT preview
│                                                          │     existing sources only (ND-001)
│   ┌──────────────┐ ┌──────────────┐                      │
│   │ [ảnh] Deal   │ │ [ảnh] Review │                      │
│   └──────────────┘ └──────────────┘                      │
├──────────────────────────────────────────────────────────┤
│  Công cụ                                      Xem tất cả │  ← TOOLS, grouped
│   Hằng ngày:  [Quét] [Chia bill] [Dịch] [Tỷ giá]         │
│   Khám phá:   [Gợi ý] [Nhóm ăn] [Nhạc]                   │
│   Giải trí:   [Bói] [Game] [Viết]                        │
├──────────────────────────────────────────────────────────┤
│  BOTTOM NAV                                              │
└──────────────────────────────────────────────────────────┘
```

### 2.2 What changed and why

| Change | Rationale | Impact |
|---|---|---|
| Composer replaces the hero search bar | A search box promises retrieval; a composer promises consultation. Same route (`/chat?q=`) | **A** |
| Contextual chips directly under the composer | The fastest path to a formed question; also reduces AI cost (a good prompt beats a vague one) | **A** |
| "Continue" promoted from the bottom | Returning users mostly resume; today this is below ~12 tiles | **A** |
| Tools grouped into 3 named groups + "see all" | IA-2: ~12 equal tiles have no hierarchy. **Nothing is removed** | **A** |
| "Dành cho bạn" (**For You**) discovery/content preview | IA-5: gives Explore/Deals a reason to exist on Home. **ND-001: existing V3-available sources only — NOT a personalization system** | **A/B** |

**Preserved:** every tool, every route, the tab bar, the 768px column, `CategoryPills` (folded
into contextual chips), the greeting, and the login/guest states.

### 2.3 States

| State | Behaviour |
|---|---|
| Guest | Composer active (anonymous chat already supported); "Continue" hidden; login prompt at the bottom, as today |
| New user | No "Continue"; chips show general prompts |
| Returning | "Continue" shows ≤2 recent threads / active plans |
| Loading | Skeletons for Continue and Dành cho bạn; composer **immediately usable** |
| Error (feed fails) | Section omitted silently; composer and tools unaffected |
| Offline | Composer disabled with a plain explanation; tools that work offline stay enabled |

---

## 3. Chat — the consultative conversation

### 3.1 Layout

```
┌──────────────────────────────────────────────────────────┐
│  ← Tappy                                    [⋯]          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                        ┌───────────────────────────┐     │
│                        │ Gợi ý quán ăn tối cho 2   │     │  user, right
│                        └───────────────────────────┘     │  max-w 85%/75%
│                                                          │
│  🦦  Bạn muốn quanh khu nào, và tầm giá bao nhiêu?       │  assistant, left
│      [Quận 1] [Quận 3] [Gần tôi]                         │  ← clarification chips
│      [<300k] [300–600k] [>600k]                          │
│                                                          │
│  🦦  Mình gợi ý 3 chỗ, dựa trên khoảng giá bạn chọn.     │
│      ┌────────────────────────────────────────────┐      │
│      │ [ảnh]  Nhà hàng A              ✓ Khớp      │      │  RecommendationCard
│      │        Hải sản · 1.2km · 4.6★              │      │
│      │        400–600k                            │      │
│      │        [ Đặt bàn ]        [ Xem bản đồ ]   │      │
│      └────────────────────────────────────────────┘      │
│      ┌────────────────────────────────────────────┐      │
│      │ Nhà hàng B  · 350–500k  · ~ Khác           │      │  compact alternatives
│      │ Nhà hàng C  · chưa rõ   · ? Chưa rõ        │      │  ← honest unknown
│      └────────────────────────────────────────────┘      │
│      [ So sánh 3 lựa chọn ]                              │  ← comparison entry
│                                                          │
│      [Gần đó có gì vui?] [Rẻ hơn?] [Lên kế hoạch]        │  ← follow-ups
│                                                          │
├──────────────────────────────────────────────────────────┤
│  [📎] [ Nhắn cho Tappy…            ] [🎤] [→]            │  sticky composer
└──────────────────────────────────────────────────────────┘
```

**Preserved exactly:** the 768px column, `max-w-[85%] md:max-w-[75%]` user bubbles, bubble-less
assistant messages, the image gallery strip, the sticky composer, typing dots + rotating hints,
`MessageActionBar`, and the error taxonomy. `UI_GUIDELINES.md §14` is already met — do not churn it.

### 3.2 Structured content — visual distinction

Structured blocks must read as *product surface*, not as assistant prose:

| | Assistant text | Structured block |
|---|---|---|
| Container | none | `surface-elevated`, radius `lg`, elevation `low` |
| Width | full column | full column |
| Type | Body-lg, 1.6 | H3 title + Small metadata |
| Spacing | paragraph rhythm | card padding 16→20 |
| Actions | none | explicit buttons |

**Rule:** a structured block never contains a raw marker, JSON, or a value the backend did not
supply. Missing → "chưa rõ".

### 3.3 Comparison (new)

Entered from a recommendation set. **In-thread and expandable — not a modal, not a route.**

```
┌────────────────────────────────────────────────────────┐
│  So sánh 3 lựa chọn                            [thu gọn]│
├──────────────┬───────────┬───────────┬─────────────────┤
│              │ Nhà hàng A│ Nhà hàng B│ Nhà hàng C      │
│              │ ✓ Đề xuất │           │                 │
├──────────────┼───────────┼───────────┼─────────────────┤
│  Giá         │ 400–600k  │ 350–500k  │ chưa rõ         │
│  Khoảng cách │ 1.2 km    │ 2.8 km    │ 0.9 km          │
│  Đánh giá    │ 4.6★      │ 4.2★      │ 4.8★            │
│  Đặt bàn     │ Có        │ Không     │ Có              │
├──────────────┴───────────┴───────────┴─────────────────┤
│  Vì sao đề xuất A: khớp khoảng giá, còn bàn tối nay.   │  ← reason is mandatory
├────────────────────────────────────────────────────────┤
│  [ Đặt bàn A ]  [ Xem B ]  [ Xem C ]                   │
└────────────────────────────────────────────────────────┘
```

Max 4 entities × 6 attributes. Identical rows collapse. Mobile: horizontal scroll, attribute
column pinned, text never below `small`. **A recommendation without a stated reason is not shipped.**

### 3.4 Confirmation (new, shared)

The visible form of the action boundary.

```
┌────────────────────────────────────────────────────────┐
│  Xác nhận đặt bàn                                      │
│                                                        │
│  Tappy sẽ gửi yêu cầu đặt bàn tới Nhà hàng A:          │
│    • 2 người · Tối nay 19:30                           │
│    • Liên hệ: 09xx xxx xxx                             │
│                                                        │
│  Nhà hàng sẽ xác nhận lại với bạn.                     │  ← what happens next
│                                                        │
│              [ Huỷ ]            [ Gửi yêu cầu ]        │
└────────────────────────────────────────────────────────┘
```

**Rules:** states the real consequence, never "Are you sure?" · cancel always safe and never
default-focused · result always reported · destructive variants name the object and use `danger` ·
**navigating away cancels; it never auto-confirms** · inline for light actions, modal for
consequential ones, never a modal chain.

### 3.5 Streaming

No layout shift (final width reserved) · structured blocks appear only when complete · actions
appear only at `complete` · auto-scroll follows only while the user is at the bottom, otherwise a
"jump to latest" chip · stop always available and preserves partial text · `aria-live="polite"`.

---

## 4. Explore (`/reviews`)

**Identity unchanged (OD-2).** Explore remains the Reviews/social feed. It is **not** rebuilt into
an "AI discovery universe", and no large IA rewrite is performed.

```
┌──────────────────────────────────────────────────────────┐
│  TikNav (Explore's own chrome — UNCHANGED)               │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────┐      │
│  │                                                │      │
│  │           Feed item (media-forward)            │      │  ← always-dark
│  │                                                │      │     immersive mode
│  │  @creator · caption                            │      │     UNCHANGED
│  │  ❤ 128   💬 12   ↗ share                       │      │
│  │  ┌──────────────────────────────┐              │      │
│  │  │ 💬 Hỏi Tappy về chỗ này       │  ← ONLY NEW │      │
│  │  └──────────────────────────────┘              │      │
│  └────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────┘
```

| | |
|---|---|
| **Unchanged** | Feed mechanics · TikNav · always-dark treatment · like/comment/share · Inbox placement (OD-4 HOLD) · global nav still hidden here |
| **Only change** | One affordance carrying an **entity reference** into `/chat` |
| **Not carried** | No fabricated question. The bridge carries *what the item is*, not *what the user wants* |

## 5. Deals (`/deals`)

**Top-level tab retained (OD-3).** Not merged into Explore. **Not a Marketplace.**

```
┌──────────────────────────────────────────────────────────┐
│  Deals                                    [filter]       │
├──────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐                       │
│  │ [ảnh]        │ │ [ảnh]        │   existing deal cards │
│  │ Deal title   │ │ Deal title   │   UNCHANGED           │
│  │ −30% · 250k  │ │ −20% · 180k  │                       │
│  │ [ Xem ]      │ │ [ Xem ]      │                       │
│  └──────────────┘ └──────────────┘                       │
├──────────────────────────────────────────────────────────┤
│  Deal detail                                             │
│  … existing content …                                    │
│  [ 💬 Hỏi Tappy về deal này ]          ← ONLY NEW        │
└──────────────────────────────────────────────────────────┘
```

**Explicitly NOT added:** cart · checkout · payment · order management · merchant onboarding ·
catalogue-browse architecture · any CS-Cart terminology or layout. Commerce is **FUTURE**
(DD-013).

> These are the *only* discovery changes in V3.

---

## 6. Tools

Unchanged in function and route. One additive affordance where a tool produces a result worth
discussing (Scan, Split Bill, Scam Shield, Currency): **"Tiếp tục trong chat"**, carrying the
result as context. Everything else is restyling as files are touched — **no tool is rewritten, and
no tool is removed** (DD-002).

```
┌──────────────────────────────────────────────────────────┐
│  ← Chia bill                                             │
├──────────────────────────────────────────────────────────┤
│  … existing tool UI, UNCHANGED …                         │
├──────────────────────────────────────────────────────────┤
│  Kết quả:  4 người · 320.000đ mỗi người                  │
│  [ 💬 Tiếp tục trong chat ]              ← ONLY NEW      │
└──────────────────────────────────────────────────────────┘
```

---

## 7. Profile (`/profile`)

**IA unchanged.** Restyle only.

```
┌──────────────────────────────────────────────────────────┐
│  [avatar]  Tên người dùng                     [ Sửa ]    │
├──────────────────────────────────────────────────────────┤
│  Hoạt động     Lịch sử · Đã lưu · Bài viết · Đặt chỗ     │
│  Theo dõi giá  Price watches                             │
│  Tài khoản     Cài đặt · Ngôn ngữ · Thông báo · Gói      │
│  Khác          Kết nối · Trợ giúp · Pháp lý              │
└──────────────────────────────────────────────────────────┘
```

**Notifications remain where they are — OD-4 is on HOLD.** No new Inbox tab, no new Inbox
architecture, and no relocation in Phase 4B.

---

## 8. Web screen inventory

Full per-screen detail is in `V3_SCREEN_SPECIFICATION.md`. Summary of Phase 4 involvement:

| Screen | Route | V3 change | Impact |
|---|---|---|---|
| **Home** | `/` | **Assistant-led restructure** (§2) | A |
| **Chat** | `/chat`, `/chat/[id]` | Structured content, comparison, confirmation, states | A / C |
| Explore | `/reviews` | "Ask Tappy" affordance only | A |
| Deals | `/deals` | "Ask Tappy" affordance only | A |
| Profile | `/profile` + subroutes | Token restyle only | A |
| Tools | `/scan`, `/split-bill`, `/translate`, `/currency`, `/scam-shield`, `/group`, `/music`, `/boi`, `/recommendations`, `/viet-content`, `/games` | "Continue in chat" where a result exists; token restyle | A |
| Login / onboarding | `/login`, `/onboarding` | Fix hard-coded `Đăng nhập để tiếp tục` (audit §5.3); token restyle | A |
| Legal / how-to-use | `/privacy`, `/terms`, `/copyright`, `/how-to-use` | None | — |
| Controller / Admin | `/controller`, `/admin` | **OUT OF SCOPE — do not touch** | — |

---

## 9. Responsive behaviour

| Width | Home | Chat | Explore |
|---|---|---|---|
| `xs` 480 | 1 col; tools 2-up | Full width − gutter | 1 col |
| `sm` 640 | 1 col; tools 3-up | 768 column emerges | 2 col |
| `md` 768 | Content column | Content column | 2 col |
| `lg` 1024 | Centred; tabs → header (OD-6) | Centred | 3 col |
| `xl`+ | **Centred and capped — never stretched** | Centred | 3 col, capped at feed width |

Composer never below 16px text (prevents iOS Safari zoom). Mobile is designed first; desktop is
the same design centred, not a different one.

---

## 10. Accessibility (Web)

| Requirement | Today | V3 |
|---|---|---|
| Touch targets ≥44×44 | Unaudited; a 5×16px control was a shipped bug (BUG-009) | **Audit + enforce** |
| Focus visible | Unaudited | Enforce on every interactive element |
| Keyboard | Enter sends, Shift+Enter newline (works) | Full traversal, Esc closes overlays, focus trap + restore in modals |
| Screen reader | Partial | Label every control; structured blocks get semantic headings; comparison is a real `<table>` |
| Streaming announce | `role="status" aria-live="polite"` present | Extend to structured blocks |
| Contrast | Semantic AA layer exists | Adopt on chat surfaces; `content-muted` large/non-essential only |
| Reduced motion | Not honoured | **Honour `prefers-reduced-motion`** |
| Dynamic type | Fluid scale exists, 14 uses | Adopt on chat + home |

---

## 11. Web-specific risks

| Risk | Mitigation |
|---|---|
| `ChatInterface.tsx` (1714 L) conflicts with **uncommitted Phase 1 work** | Do not start Web chat work until Phase 1 commits; extract incrementally |
| Home restructure touches a high-traffic screen | Reorder-and-group only; no route or tool removed; reversible |
| Comparison may need a backend field | Derive from existing `SynthesisView` first (B); escalate to C only if proven necessary |
| Token migration scope creep (960 raw utilities / 101 files) | Chat + Home only; tokens land as files are touched |
