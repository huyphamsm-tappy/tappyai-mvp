# Owner UAT Checklist — Account & Settings i18n Sprint

**Branch:** `feat/backoffice-phase0` · **Status:** awaiting Owner UAT · **Not merged, no PR opened**
Audit + rationale: [`ACCOUNT_SETTINGS_I18N_AUDIT.md`](./ACCOUNT_SETTINGS_I18N_AUDIT.md)

**Excluded from this sprint by instruction:** Privacy Policy, Terms of Service.

---

## How to run this UAT

1. Sign in on Web. Open **Account** (`/profile`).
2. Set the language in **Settings → Language**. The toggle is app-wide and takes effect **immediately, without a reload** — if any screen needs a refresh to change language, that is a **FAIL**.
3. Walk every screen below in Vietnamese, then repeat the whole walk in English.
4. Repeat on Android with the in-app language picker (Settings → Language).

**What counts as a FAIL:** any Vietnamese text visible while English is selected, or any English text visible while Vietnamese is selected — including placeholders, empty states, error messages, button labels, dialogs and accessibility labels.

**Not a failure:** emoji, brand names (TappyAI, Google Calendar, Zalo), the user's own content (names, phone numbers, notes, saved chips), currency amounts (`150k`, `100–200k`), and the language names in the picker (`Tiếng Việt` / `English` are shown in their own language by convention).

---

## Read this before starting — 3 known conditions

These are **pre-existing** and outside the localization scope. Flagging them so they are not mistaken for sprint regressions.

| # | Condition | Where it shows |
|---|---|---|
| K-1 | **Dark mode does not apply on a direct load** of Saved, Price tracking, AI Memory, My reviews. `Header` is the only component that writes the `dark` class to `<html>`, and those four screens do not render it. Navigating to them *from* another screen keeps dark mode; a refresh or a direct URL loses it. | Dark-mode rows for those 4 screens |
| K-2 | **First paint is Vietnamese, then flips to English.** SSR always renders `vi` (`getServerSnapshot()` returns `'vi'`); the client reconciles after hydration. App-wide and pre-existing; a proper fix needs cookie-based locale. | Brief flash on hard refresh, every screen |
| K-3 | **Quick-preference chips insert translated text.** Adding "Ăn chay thứ 6" in Vietnamese then switching to English shows "Vegetarian Fridays" as still-addable, so both can end up in the list. The chips seed a free-form user list, so the stored text is the user's own note. | Preferences → quick chips |

---

## Web — per screen

Legend: **EN** English · **VI** Vietnamese · **📱** Mobile layout · **🖥** Desktop layout · **🌙** Dark · **☀️** Light · **🧭** Navigation (back/bottom nav land correctly) · **∅** Empty state · **⚠️** Error state

### 1. Account — `/profile/account`
- [ ] EN  - [ ] VI  - [ ] 📱  - [ ] 🖥  - [ ] 🌙  - [ ] ☀️  - [ ] 🧭  - [ ] ∅ n/a  - [ ] ⚠️
- [ ] Section headings "Information" / "Edit" translate
- [ ] **Join date** renders `15/01/2026` in EN and `15/1/2026` in VI — it used to be pinned to `vi-VN`
- [ ] Missing full name shows `—` (not "Chưa cập nhật")

### 2. Chat History — `/profile/history`
- [ ] EN  - [ ] VI  - [ ] 📱  - [ ] 🖥  - [ ] 🌙  - [ ] ☀️  - [ ] 🧭  - [ ] ∅  - [ ] ⚠️
- [ ] Row subtitle reads "3 messages · 5 min ago" / "3 tin nhắn · 5 phút trước"
- [ ] **The old typo `phúp trước` is gone** — it must read `phút trước`
- [ ] Delete confirmation dialog and the delete button's screen-reader label translate
- [ ] Empty state: "No conversations yet" + "Start chat"

### 3. Bookings — `/profile/bookings`
- [ ] EN  - [ ] VI  - [ ] 📱  - [ ] 🖥  - [ ] 🌙  - [ ] ☀️  - [ ] 🧭  - [ ] ∅  - [ ] ⚠️
- [ ] Status badges: Processing / Confirmed / Cancelled ↔ Đang xử lý / Đã xác nhận / Đã huỷ
- [ ] Pending banner translates
- [ ] Guest count: "4 guests" / "4 khách" (was "4 người")
- [ ] **Share** produces a message in the selected language (open the share sheet and read it)
- [ ] Inline review widget: placeholder, photo hint, Submit/Cancel, and both validation errors ("Please choose a star rating", "at least 20 characters")

### 4. Saved — `/profile/favorites`
- [ ] EN  - [ ] VI  - [ ] 📱  - [ ] 🖥  - [ ] 🌙 *(see K-1)*  - [ ] ☀️  - [ ] 🧭  - [ ] ∅  - [ ] ⚠️
- [ ] Section headings "Favorite places" / "Saved reviews"
- [ ] Item count "12 items" / "12 mục"
- [ ] "Saved 15/01/2026" date follows the locale
- [ ] Empty state: "Nothing saved yet" + the ♡/🔖 explanation

### 5. Price Tracking — `/profile/price-watches`
- [ ] EN  - [ ] VI  - [ ] 📱  - [ ] 🖥  - [ ] 🌙 *(see K-1)*  - [ ] ☀️  - [ ] 🧭  - [ ] ∅  - [ ] ⚠️
- [ ] "How to add" card + worked example translate
- [ ] Section headers "TRACKING (2/10)" / "NOTIFIED (1)"
- [ ] Target/current price lines; **amounts themselves must not change** (`2 triệu` → `2M` is the unit suffix only)
- [ ] "Last checked …" timestamp follows the locale
- [ ] Empty state + the delete-watch screen-reader label

### 6. AI Memory — `/profile/tappy-knows`
- [ ] EN  - [ ] VI  - [ ] 📱  - [ ] 🖥  - [ ] 🌙 *(see K-1)*  - [ ] ☀️  - [ ] 🧭  - [ ] ∅  - [ ] ⚠️
- [ ] Response-style card: Tone (Friendly/Neutral/Formal), Length (Short/Detailed), and the hint line
- [ ] All memory card labels: Area, Usually with, Usual timing, Style, Favorite food, Leisure, Shopping, Dislikes, Usual budget, Topics
- [ ] Budget with no lower bound reads "under 500k" / "dưới 500k"
- [ ] Edit mode: every remove (×) button's screen-reader label
- [ ] Clear-memory block: title, warning, Confirm/Cancel, and the cleared state
- [ ] "Updated 15/01/2026" follows the locale

### 7. Preferences — `/profile/preferences`
- [ ] EN  - [ ] VI  - [ ] 📱  - [ ] 🖥  - [ ] 🌙  - [ ] ☀️  - [ ] 🧭  - [ ] ∅  - [ ] ⚠️
- [ ] Info banner, "Tappy remembers you" section + description
- [ ] Gender, Budget (labels **and** descriptions), Cuisine chips, Dietary section + placeholder
- [ ] Save button states: Save preferences → Saving… → Saved!
- [ ] **Data integrity check — the important one:** select 3 cuisines in Vietnamese, Save, switch to English, reload. The *same 3 chips must still be selected* (labels in English). Then switch back to Vietnamese and confirm they are still selected.
- [ ] Save error message translates

### 8. My Reviews — `/profile/posts`
- [ ] EN  - [ ] VI  - [ ] 📱  - [ ] 🖥  - [ ] 🌙 *(see K-1)*  - [ ] ☀️  - [ ] 🧭  - [ ] ∅  - [ ] ⚠️
- [ ] Title + post count
- [ ] Status line "🔒 Hidden · ❤️ 4 · 💬 2" / "🔒 Đã ẩn · …"
- [ ] Hide/Show/Delete actions and the delete confirmation
- [ ] Empty state + "Post your first review"

### 9. Edit Profile — `/profile/edit`
- [ ] EN  - [ ] VI  - [ ] 📱  - [ ] 🖥  - [ ] 🌙  - [ ] ☀️  - [ ] 🧭  - [ ] ∅ n/a  - [ ] ⚠️
- [ ] Full name + Bio labels, placeholders, and the "(optional)" marker
- [ ] Email "Cannot change" pill
- [ ] Avatar hint line and the change-avatar screen-reader label
- [ ] Upload errors: too large (3MB), wrong file type — trigger both
- [ ] Save states: Save → Saving… → Saved!

### 10. Group Dining — `/group/new` and `/group/[id]`
- [ ] EN  - [ ] VI  - [ ] 📱  - [ ] 🖥  - [ ] 🌙  - [ ] ☀️  - [ ] 🧭  - [ ] ∅  - [ ] ⚠️
- [ ] Create form: heading, subtitle, name label + placeholder, submit
- [ ] Detail: member count, share-link block, Copy/Copied, member list labels (💰 / 🍽️ Likes / 🚫 Avoids / 📍 Area)
- [ ] Join form: every label and placeholder, budget chips, submit
- [ ] Budget chips read "Under 100k / 100–200k / Over 200k" in EN, "Dưới 100k / 100–200k / Trên 200k" in VI
- [ ] Joined confirmation + "Tappy's suggestion" heading
- [ ] Not-found and error states
- [ ] **Cross-platform check:** join a group from Web and from Android with the same budget tier — the member list must show the *same* tier on both

### 11. App Connections — `/profile/integrations`
> Hidden behind `SHOW_APP_CONNECTIONS` (off). Reach it by URL, or skip if you prefer not to test hidden surfaces.
- [ ] EN  - [ ] VI  - [ ] 📱  - [ ] 🖥  - [ ] 🌙  - [ ] ☀️  - [ ] 🧭  - [ ] ∅ n/a  - [ ] ⚠️
- [ ] Title, subtitle, privacy note, per-connector description + "Tappy only reads" line
- [ ] Connect / Connected / Disconnect
- [ ] "What Tappy uses this for" list
- [ ] OAuth callback banners (append `?success=zalo` / `?error=zalo_denied` to the URL)

### 12. Notifications — `/profile/notifications`
- [ ] EN  - [ ] VI  - [ ] 📱  - [ ] 🖥  - [ ] 🌙  - [ ] ☀️  - [ ] 🧭  - [ ] ∅ n/a  - [ ] ⚠️
- [ ] Header title + the 5 "what you'll receive" rows

### 13. Language — Settings → Language
- [ ] EN  - [ ] VI  - [ ] 📱  - [ ] 🖥  - [ ] 🌙  - [ ] ☀️  - [ ] 🧭  - [ ] ∅ n/a  - [ ] ⚠️
- [ ] Row label "Language" / "Ngôn ngữ" translates
- [ ] **Switching updates every visible screen immediately, with no reload**
- [ ] Choice survives a full reload
- [ ] Choice survives sign-out → sign-in (persisted server-side via `PATCH /api/profile`)

### 14. Settings hub + Profile hub — `/profile/settings`, `/profile`
- [ ] EN  - [ ] VI  - [ ] 📱  - [ ] 🖥  - [ ] 🌙  - [ ] ☀️  - [ ] 🧭  - [ ] ∅ n/a  - [ ] ⚠️
- [ ] Every menu row label **and** description
- [ ] Greeting with no name on file reads "…, there" in EN (was "…, bạn")
- [ ] Conversation-count badge

---

## Android — per screen

Same screens via the native app. Switch language in Settings → Language.

| Screen | EN | VI | 📱 | 🌙 | ☀️ | 🧭 | ∅ | ⚠️ |
|---|---|---|---|---|---|---|---|---|
| Account | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Account → Edit | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Chat History | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Bookings | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Saved | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Price Tracking | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| AI Memory | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Preferences | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| My Reviews | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Group Dining | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| App Connections | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Notifications | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Language | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

### Android — the three specific fixes to confirm

These were hard-coded **English** shown to Vietnamese readers. Check each in Vietnamese:

- [ ] **AI Memory → budget card** with no lower bound reads `dưới 500k`, not `under 500k`
- [ ] **Bookings** guest chip reads `4 khách`, not `4 guests` (also check the shared booking text)
- [ ] **Group Dining → join → budget chips** read `Dưới 100k / 100–200k / Trên 200k`, not `Under 100k / Over 200k`

### Android — known gap, not fixed in this sprint

- [ ] Acknowledged: selecting cuisines in Preferences, switching language, and reopening the screen shows the chips **unselected** (Android stores the localized label; documented in `PreferencesData.kt`). Fixing this rewrites values already stored by V1 users and needs an owner decision — tracked as **FU-7** in the audit.

---

## Sign-off

- [ ] Web UAT complete — no language leakage on any screen
- [ ] Android UAT complete — no language leakage on any screen
- [ ] Preferences data-integrity check passed (cuisine selections survive a language switch on Web)
- [ ] Group Dining cross-platform budget value matches between Web and Android
- [ ] Owner approves merge

**On approval:** this needs **two PRs**, not one. `src/app/profile/**` is byte-identical between `main` and `feat/backoffice-phase0`, so the Web change targets `main`; `android/**` differs by 253 files and the Play-submitted V1 tree lives on `feat/backoffice-phase0`, which is 174 commits behind `main`. Do **not** deploy `feat/backoffice-phase0`.

Owner: ______________________  Date: ____________
