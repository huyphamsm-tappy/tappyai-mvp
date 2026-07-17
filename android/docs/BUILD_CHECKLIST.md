# Android Build Checklist

Run after every milestone, before requesting approval to move on.

## Standard workflow
Implementation → Static Verification → Local Build (owner's machine) → Issue Fix → Local Build Again → Approval → Next Milestone

## Checklist

1. [ ] Pull latest code onto the build machine.
2. [ ] Claude has completed Static Verification (imports, package names, API usage checked against real docs/source — not memory) and listed fixes applied.
3. [ ] No dependency version was bumped unless the current build was already green (newer versions found are reported, not auto-upgraded).
4. [ ] Any new SDK/library introduced this milestone had its API verified against official docs before implementation.
5. [ ] Gradle sync completes with no unresolved dependency errors.
6. [ ] Full build succeeds (`./gradlew assembleDebug` or Run in Android Studio) with zero compile errors.
7. [ ] App installs and launches on emulator/device without crashing.
8. [ ] Correct start destination loads (no blank/wrong screen).
9. [ ] Logcat checked for fatal exceptions/stack traces on cold start.
10. [ ] Core interaction for this milestone's feature works end-to-end (or fails only on known placeholder config, e.g. missing API keys — not a code bug).
11. [ ] Any error/crash found is pasted verbatim (not paraphrased) back to Claude.
12. [ ] Claude fixes reported issues, re-verifies statically, hands back for another local build.
13. [ ] Owner approves explicitly before the next milestone starts.
14. [ ] No new milestone's code is written until the current one is approved.
15. [ ] New screens conform to **UI Consistency Baseline v1** (below) — identity, padding, spacing, headers, max-width, icon scale.
16. [ ] Standard screenshot(s) captured to `docs/screenshots/` during Runtime Verification (see `docs/screenshots/README.md`).
17. [ ] `FEATURE_STATUS.md` is updated **only after** build PASS + runtime PASS + owner approval — never mid-milestone (the tracker must reflect reality, not intent).

---

# UI Consistency Baseline v1

Locked 2026-07-10 by **UI Consistency Pass #1** (audit + alignment across Home/Chat/Maps/Discovery/Profile/Settings), once the app first had a full shell. **Every feature built from now on must follow these.** These are conventions, not a redesign — the pass changed only the few real drift points; everything below is the single standard.

### 1. Identity placeholder
No signed-in user in the UI-only foundation → **neutral person icon + honest copy**. Never fabricate a "Guest"/fake name/fake email/fake conversation count.
- `TappyAvatar(name = "")` (blank name) renders the person icon — that is the "not signed in" state. Do not pass a fake name like `"Guest"`.
- Profile header uses the same person-icon identity convention ("Your profile" / "Sign in to personalize").
- Home hero keeps its **time-based greeting** (that is a launchpad greeting, not an identity claim) — the avatar there is the person-icon placeholder, not initials.

### 2. Edge padding
Scroll/content screens use **`TappySpacing.xl` (16dp)** as the screen-edge padding. (Home, Discovery hub, Discovery category, Profile, Settings.)

### 3. Section spacing
Vertical gap between **major sections** = **`TappySpacing.xl` (16dp)**. Do not mix 16 and 20 without a stated reason.

### 4. Section header convention *(locked as-is — do not "unify" the two)*
- **Menu/list screens** (Profile, Settings, and future Membership/Payment/Rewards/About/Privacy/Notifications/Help): **UPPERCASE** section labels via `MenuSectionHeader` (`labelMedium`).
- **Content screens** (Home, Discovery, …): **Title-case** section headers (`titleMedium`).
- **Drill-down screens** keep the shell top bar and add an inline **back-arrow + `titleLarge` title** row (Settings, Discovery category).

### 5. Max-width convention
Every scroll/content screen caps width with `widthIn(max = TappyContainers.<token>)`, horizontally centered:
- **`content` (768dp)** — reading/detail/settings/profile/chat/**category** screens.
- **`feed` (1280dp)** — grid/feed screens (Discovery hub).

### 6. Maps exception
Maps stays **full-bleed**: `padding(TappySpacing.md)`, no width cap. The map canvas is edge-to-edge by design and is deliberately exempt from #2 and #5.

### 7. Icon scale convention *(locked as-is — code unchanged, documented so new screens match)*
- **16dp** — inline/metadata glyph (rating star, location pin)
- **20dp** — glyph inside a 40dp tile (`TappyMenuRow` icon tile)
- **24dp** — standalone action glyph (map detail actions)
- **28dp** — launcher/category tile glyph (Home quick actions, Discovery group tiles)
- **32dp** — identity avatar glyph (person icon inside a 64dp avatar)
- Avatar sizes only via `TappyAvatarSize`: Inline 24 · ListRow 32 · HeaderUser 40 · ProfileCard 64 · ProfileHero 96.

### Already-consistent invariants (keep, don't drift)
Card radius `TappyShapes.card` (16dp) for cards/large tiles, `input` (12dp) for small tiles/fields, `sheet` (24dp) for bottom sheets · one `TappyAppBar` for all tabs · single `TappyBottomNavBar`/`TappyNavRail` · `HorizontalDivider` in menu lists · `TappyComingSoonSheet` with the shared "We're still building X…" copy · `TappyLoadingIndicator` / `TappyEmptyState` for those states · all colors via `MaterialTheme.colorScheme` (no hex) so dark mode is automatic · `verticalScroll` for static content, `Lazy*` for dynamic.
