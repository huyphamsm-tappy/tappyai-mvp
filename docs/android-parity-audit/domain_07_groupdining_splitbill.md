# Domain 07 — Group Dining & Split Bill (Android ↔ Web parity)

**Baseline:** current working tree (uncommitted included), 2026-07-26. Evidence read from actual code, not status docs.

## Verdict

Group Dining is at near-full parity on Android (create / join / detail / AI-suggest all real and backed by the shared Web API); **Split Bill does NOT exist in Android at all** — no screen, no navigation entry, no client math — while it is a full live feature on Web.

---

## IMPLEMENTED (Group Dining — parity confirmed)

- `[P3]` **Create group** — name input (maxLength 80), `POST /api/group`, navigates to detail on success. Mirrors Web `GroupNewForm`.
  - Android: `android/app/src/main/java/com/tappyai/app/groupdining/GroupDiningViewModel.kt:56` (createGroup), `GroupDiningScreen.kt:44`; MAX_NAME=80 at `GroupDiningViewModel.kt:80`.
  - Web: `src/app/group/new/GroupNewForm.tsx:15` (handleSubmit → `/api/group`), maxLength 80 at `:69`; route `src/app/api/group/route.ts:5`.
- `[P3]` **Detail load + creator/member branching** — `GET /api/group?id=`, `isCreator = creatorId === currentUserId`, spinner gated behind auth-check so creator never flashes the join form.
  - Android: `GroupDetailViewModel.kt:70` (isCreator), `:63` (authChecked), `GroupDetailScreen.kt:134`.
  - Web: `src/app/group/[id]/page.tsx:152` (isCreator), `:135` (loading || !authChecked gate).
- `[P3]` **Join group** — required fields name+budget+area (food/dietary optional), `POST /api/group/{id}/join`, refetch after join. Budget as selectable chips.
  - Android: `GroupDetailViewModel.kt:156` (join), `:153` (canSubmitJoin = name+budget+area); MAX_MEMBER_NAME=50 at `:207`.
  - Web: `src/app/group/[id]/page.tsx:78` (handleJoin, guards name+budget+area), name maxLength 50 at `:253`.
- `[P3]` **"Already joined" persistence** — Android persists per-group flag in `PreferencesDataSource` (`group_joined_<id>`), the native analog of Web `localStorage.joined_group_<id>`.
  - Android: `GroupDetailViewModel.kt:112`, `:208`. Web: `src/app/group/[id]/page.tsx:72`, `:100`.
- `[P3]` **AI suggest (creator-only)** — `POST /api/group/{id}/suggest`, in-place suggestion update, error → Toast (Web uses `alert()`). Backend enforces creator-only 403 + 5/60s rate limit; both clients just render.
  - Android: `GroupDetailViewModel.kt:184` (suggest), Toast at `GroupDetailScreen.kt:78`.
  - Web: `src/app/group/[id]/page.tsx:110` (handleSuggest), alert at `:115`; route rules `src/app/api/group/[id]/suggest/route.ts:14` (rateLimit), `:25` (creator 403).
- `[P3]` **Share link + copy** — creator sees `<origin>/group/<id>`, copy-to-clipboard with 2s "copied" state, plus a native share-sheet (Android adds `ACTION_SEND` share, a superset of Web's copy-only).
  - Android: `GroupDetailScreen.kt:158` (link), `:486` (copy), `:491` (share). Web: `src/app/group/[id]/page.tsx:128` (copyLink), 2s reset at `:132`.
- `[P3]` **Member list + waiting/suggestion states** — member rows (budget/likes/avoids/area), "joined, waiting" 🎉 card, suggestion 🍽️ card visible to everyone. All present.
  - Android: `GroupDetailScreen.kt:287` (members), `:442` (waiting), `:463` (suggestion). Web: `src/app/group/[id]/page.tsx:199` / `:331` / `:340`.
- `[P3]` **DTO/wire parity** — snake_case fields match Web `select(...)` columns exactly; lenient JSON drops unused (`status`,`created_at`,`user_id`). `alreadyJoined` 2xx treated as success.
  - Android: `android/app/src/main/java/com/tappyai/app/groupdining/data/GroupDtos.kt:28`, `:57`. Web join 23505→`{ok,alreadyJoined}` at `src/app/api/group/[id]/join/route.ts:41`.

**Freeze-doc check (CONFIRMED):** `11_Android_Migration.md:157` classes Group Dining "READY — Create / join / detail / AI-suggest." Verified true against current code.

---

## MISSING

- `[P1]` **Split Bill — entire feature absent on Android.** No screen, no route, no ViewModel, no bill-splitting math anywhere in `android/`. Grep for `splitBill|SplitBill|split.?bill` over `android/` returns only doc mentions (`android/docs/Android_Architecture.md`), zero code.
  - Web (full feature): `src/app/split-bill/page.tsx:21` — bill total input, people counter (clamped 2–20, `:100`/`:107`), tip presets `[0,5,10,15,20]` (`:9`) + custom-tip field (`:131`), equal/custom mode toggle (`:145`), per-person breakdown with tip math (`grandTotal = total*(1+tip/100)`, `:36`; custom per-person `:231`), bill/tip/total summary grid (`:172`), i18n strings at `src/lib/i18n/w3/splitBill.ts`.
  - **Freeze-doc check (CONFIRMED):** `11_Android_Migration.md:175` item 9 — "Split Bill: Does not exist in Android source. Pure client math, no backend… A 2026-07-17 report claiming it complete was false." VERIFIED TRUE in current tree. Also note the stale `android/docs/Android_Architecture.md:21`/`:253` frames Split Bill as "Reserved for future product roadmap / NOT_STARTED" — misleading, since Web ships it in production; the freeze doc's NEEDS-NATIVE classification is the correct one.
- `[P2]` **Split Bill entry point** — Web exposes both Group creation (`/group/new`) and Split Bill (`/split-bill`) as Home quick-actions (`src/app/HomeView.tsx:122`, `:173`). Android has **no Home quick-action for either**; Group Dining is reached from the Profile menu only (`GroupDiningScreen.kt` doc comment, `R.string.profile_menu_group_dining`). Split Bill has no entry anywhere. Building the Split Bill screen also requires wiring an entry point.

---

## DIFFERENT BEHAVIOR

- `[P3]` **Budget-chip labels diverge in language, and the label is sent verbatim into the AI prompt.** Web submits Vietnamese labels `Dưới 100k / 100–200k / Trên 200k` (`src/app/group/[id]/page.tsx:28`); Android submits English `Under 100k / 100–200k / Over 200k` (`GroupModels.kt:40`). The suggest route interpolates the stored budget string directly into an otherwise-Vietnamese LLM prompt (`src/app/api/group/[id]/suggest/route.ts:38`), so a group with mixed Web+Android members feeds mixed-language budget tokens to the model. The Android model doc (`GroupModels.kt:34`) flags this as deliberate (English UI copy), but it is a real cross-platform data divergence in the AI input. Low impact (LLM tolerates it); flagged for awareness.

---

## BUGS

- None found in the Group Dining implementation. Control flow, field validation, member cap deference, auth-gating, and error/loading states all mirror Web faithfully.

---

## REQUIRED BACKEND CONTRACTS

- **Split Bill:** none. It is pure client-side math with no backend (confirmed — Web `split-bill/page.tsx` makes zero network calls; `07_Features.md:86` lists Split bill backend as "none (pure client)"). Android can build it entirely offline.
- **Group Dining:** already fully wired to the shared endpoints — `POST /api/group`, `GET /api/group?id=`, `POST /api/group/{id}/join`, `POST /api/group/{id}/suggest` (`03_Backend`/`07_Features.md:87`). Server owns creator-ownership, the 10-member cap (`src/app/api/group/[id]/join/route.ts:31`), and suggest rate-limit/403. No new contract needed.
