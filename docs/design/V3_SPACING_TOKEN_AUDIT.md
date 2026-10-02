# TappyAI V3 — Spacing Token Audit (OD-5)

**Phase:** 4A Revision V2 · **Status:** **HOLD — HUMAN DECISION REQUIRED**
**Implementation:** NOT STARTED · **No source code was modified.**

Commissioned because `V3_DESIGN_SYSTEM.md` v1 declared the iOS scale canonical without inspecting
Android's. This audit answers the eight questions posed in the revision brief.

> **Headline finding.** This is **not a value conflict. It is a naming offset.** The two platforms
> use substantially the *same* ladder of values with *different labels*. Android's ladder is in
> fact a **more faithful reproduction of `docs/UI_GUIDELINES.md §6`** than iOS's. The v1
> recommendation — "adopt the iOS scale everywhere" — would have moved Android **away** from the
> documented web guideline and repainted ~790 call sites for no visual gain.

---

## 1. Current token definitions (measured)

### Android — `android/core/designsystem/.../theme/Spacing.kt`

```kotlin
object TappySpacing {
    val xs = 4.dp;   val sm = 6.dp;    val md = 8.dp
    val lg = 12.dp;  val xl = 16.dp;   val xxl = 20.dp
    val xxxl = 24.dp; val huge = 32.dp; val massive = 40.dp; val giant = 48.dp
}
```

Its own doc comment states the intent:

> *"4dp base unit, matching `docs/UI_GUIDELINES.md §6`'s Tailwind scale
> (`{1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12} × 4px`)."*

### iOS — `ios/TappyAI/DesignSystem/Tokens/Metrics.swift`

```swift
enum Spacing {
    static let xxs: CGFloat = 4;  static let xs: CGFloat = 8
    static let sm: CGFloat = 12;  static let md: CGFloat = 16
    static let lg: CGFloat = 24;  static let xl: CGFloat = 32
    static let xxl: CGFloat = 48
}
```

### Web

**No named semantic scale exists.** Web uses raw Tailwind numeric utilities (`p-4`, `gap-2`,
`space-y-6`). Its "names" are the Tailwind step numbers. `UI_GUIDELINES.md §6` prescribes the
allowed steps: `{1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12}` → `{4, 6, 8, 12, 16, 20, 24, 32, 40, 48}` px.

---

## 2. The ladders side by side, by **value** — the key table

| Value | Tailwind step | Android name | Android uses | iOS name | iOS uses |
|---:|---|---|---:|---|---:|
| 4 | `1` | `xs` | **133** | `xxs` | 53 |
| 6 | `1.5` | `sm` | **171** | — | — |
| 8 | `2` | `md` | **230** | `xs` | 169 |
| 12 | `3` | `lg` | **111** | `sm` | **260** |
| 16 | `4` | `xl` | **124** | `md` | **258** |
| 20 | `5` | `xxl` | 6 | — | — |
| 24 | `6` | `xxxl` | 10 | `lg` | 130 |
| 32 | `8` | `huge` | 8 | `xl` | 15 |
| 40 | `10` | `massive` | **0** | — | — |
| 48 | `12` | `giant` | **0** | `xxl` | 10 |
| | | **Total** | **793** | **Total** | **895** |

*(Counts: `grep -rho "TappySpacing\.<name>\b" android --include=*.kt` and
`grep -rho "Spacing\.<name>\b" ios --include=*.swift`, whole-word matched.)*

### 2.1 What this table proves

1. **Android's ladder is an exact 1:1 reproduction of `UI_GUIDELINES.md §6`** — all ten steps,
   in order. It is the most guideline-faithful scale in the product.
2. **iOS uses a coarser 7-step subset** of the same Tailwind values (`1, 2, 3, 4, 6, 8, 12`),
   omitting `1.5`, `5`, and `10`.
3. **On every shared value the two agree — only the label differs.** iOS's names sit roughly two
   positions "later" on the ladder than Android's.
4. **Android's 6dp step (`sm`, 171 uses) has no iOS equivalent.** This is the only genuine
   structural difference, and it is legitimate: Tailwind `1.5` is in the guideline.
5. **`massive` and `giant` are dead tokens** — 0 uses each.

---

## 3. Answers to the eight audit questions

**Q1 · What semantic meaning does each token have on Android?**
Android's names are **ordinal positions on the Tailwind ladder**, not semantic roles. `xs` is
"step 1", `md` is "step 3". Call sites confirm this: `ChatCtaButtons.kt:68` reads
`Arrangement.spacedBy(TappySpacing.md), // web: gap-2 = 8px`. The token is explicitly anchored to
a *web utility*, not to a semantic intent like "component padding".

**Q2 · Why is Android `md = 8dp`?**
Because it is the **third step of a ten-step ladder**, and the midpoint of a ten-step ladder that
starts at 4 is small. iOS's `md = 16` is the **fourth step of a seven-step ladder**. Both are
internally coherent; neither is a mistake. The divergence is an artefact of two teams naming
different-length ladders independently.

**Q3 · Is this a value conflict or a semantic naming conflict?**
**A semantic naming conflict.** The value sets overlap on 7 of Android's 10 steps and 7 of iOS's 7.
No shared value is rendered differently on the two platforms. A user cannot perceive this conflict
today — it exists only in source code.

**Q4 · How frequently is each token used?**
793 Android references, 895 iOS. Concentrated in the middle: Android's top three (`md` 230,
`sm` 171, `xs` 133) are 67% of its usage; iOS's top three (`sm` 260, `md` 258, `xs` 169) are 77%.
**Any rename touches ~1,700 call sites across two codebases.**

**Q5 · What visual hierarchy would change if Android were remapped?**
Under **Option A** (adopt iOS values under iOS names), every Android call site keeping its token
name would change value:

| Android call site | Today | After Option A | Change |
|---|---|---|---|
| `TappySpacing.md` (230 uses) | 8dp | 16dp | **+100%** |
| `TappySpacing.sm` (171 uses) | 6dp | 12dp | **+100%** |
| `TappySpacing.xs` (133 uses) | 4dp | 8dp | **+100%** |
| `TappySpacing.lg` (111 uses) | 12dp | 24dp | **+100%** |
| `TappySpacing.xl` (124 uses) | 16dp | 32dp | **+100%** |

**Roughly 770 call sites would double their spacing.** Every Android screen would need visual
re-verification. Avoiding that requires a value-preserving *remap* rather than a rename — which is
Option B.

**Q6 · Could semantic names be normalised without forcing visual change?**
**Yes.** Because the ladders share values, a purely mechanical remap exists with **zero pixel
change**:

| Value | Android today | Canonical name | Android call-site rewrite |
|---:|---|---|---|
| 4 | `xs` | `xxs` | `xs` → `xxs` |
| 6 | `sm` | `xxs_plus` *(or retain `sm6`)* | needs a canonical name — see §5 |
| 8 | `md` | `xs` | `md` → `xs` |
| 12 | `lg` | `sm` | `lg` → `sm` |
| 16 | `xl` | `md` | `xl` → `md` |
| 20 | `xxl` | *(no iOS equivalent)* | needs a canonical name |
| 24 | `xxxl` | `lg` | `xxxl` → `lg` |
| 32 | `huge` | `xl` | `huge` → `xl` |
| 40 | `massive` | *(unused — delete)* | remove |
| 48 | `giant` | `xxl` | `giant` → `xxl` |

Every row preserves its value. This is a **rename, not a re-space**.

**Q7 · What would migrating the affected Android call sites actually do?**
Under Option B: a mechanical, reviewable, value-preserving find-and-replace across ~793 references
in ~60 files. **No rendered pixel moves.** Verification is a diff review plus a screenshot
comparison that must show *no* change. Under Option A: ~770 spacing values double and every screen
requires re-design review.

**Q8 · Would migration improve the product, or only numerical consistency?**
**Honestly: Option B improves engineering consistency, not the product.** No user benefit is
measurable. Its value is preventing future defects — a developer reading `md` on two platforms and
assuming one meaning. Weighed against MUXS's explicit priority — *usability first, then visual
consistency, then numerical consistency* — this is a **third-priority concern**, and it is the
reason this audit does **not** recommend doing it urgently.

---

## 4. Options compared

### Option A — one numerical scale everywhere (iOS values under iOS names)

| | |
|---|---|
| **Effort** | High — ~793 Android sites re-valued |
| **Visual risk** | **Severe** — ~770 sites double their spacing |
| **Guideline fidelity** | **Regresses.** Abandons the 10-step `UI_GUIDELINES.md §6` ladder and its 6dp/20dp steps (177 uses) |
| **User benefit** | None |
| **Verdict** | **NOT RECOMMENDED.** Highest cost, highest risk, moves away from the written guideline. |

### Option B — normalise names, preserve values ✅

| | |
|---|---|
| **Effort** | Medium — mechanical rename, ~793 Android sites; iOS unchanged |
| **Visual risk** | **Zero by construction** — a screenshot diff must show no change |
| **Guideline fidelity** | Preserved; Android keeps all ten steps |
| **User benefit** | None directly; prevents a future class of cross-platform confusion |
| **Open issue** | Needs canonical names for 6dp and 20dp, which iOS lacks |
| **Verdict** | **RECOMMENDED IF a change is made at all.** |

### Option C — platform-specific values with an explicit mapping table

| | |
|---|---|
| **Effort** | **Minimal** — one documentation table; no code |
| **Visual risk** | **None** |
| **Guideline fidelity** | Preserved on both |
| **User benefit** | None |
| **Cost** | The ambiguity persists in source; the mapping must be consulted |
| **Verdict** | **RECOMMENDED AS THE V3 POSITION** — see §5. |

---

## 5. Recommendation

**Adopt Option C for V3. Defer Option B to a standalone maintenance change outside Phase 4.**

Reasoning:

1. **No user-visible defect exists.** Nothing renders wrongly today. A 1,700-call-site rename is
   not V3 UX/UI work, and `V3-Design.md` does not ask for it.
2. **MUXS ranks numerical consistency last.** Spending Phase 4's risk budget on a
   zero-user-benefit rename — in the same phase that touches every chat surface — is poor
   sequencing.
3. **Option A is actively harmful** and should be closed off explicitly, because it was the v1
   recommendation and would otherwise be inherited.
4. **Option B is correct but not urgent**, and it is safest as an isolated change whose *entire*
   acceptance criterion is "no screenshot changed" — impossible to verify honestly if it lands
   inside a phase that is deliberately changing visuals.

### The Option C mapping table (the V3 deliverable)

Design specifications reference **values**, never platform token names:

| Canonical value | Tailwind / Web | Android | iOS |
|---:|---|---|---|
| 4 | `1` | `TappySpacing.xs` | `Spacing.xxs` |
| 6 | `1.5` | `TappySpacing.sm` | *(none — use 8)* |
| 8 | `2` | `TappySpacing.md` | `Spacing.xs` |
| 12 | `3` | `TappySpacing.lg` | `Spacing.sm` |
| 16 | `4` | `TappySpacing.xl` | `Spacing.md` |
| 20 | `5` | `TappySpacing.xxl` | *(none — use 24)* |
| 24 | `6` | `TappySpacing.xxxl` | `Spacing.lg` |
| 32 | `8` | `TappySpacing.huge` | `Spacing.xl` |
| 48 | `12` | `TappySpacing.giant` | `Spacing.xxl` |

**Rule for Phase 4B (if approved):** every spec states a **value in px/dp/pt**; each platform
resolves it through this table. No spec may say "use `md`".

**Dead token note:** `TappySpacing.massive` (40dp) has **0 uses** and no counterpart in the
mapping. `giant` (48dp) also has 0 uses today but is the canonical 48 step and must be **kept**.
Deleting `massive` is optional cleanup, outside V3, and still requires approval.

---

## 6. Migration risk (if Option B is later approved)

| Risk | Severity | Mitigation |
|---|---|---|
| A rename silently changes a value | **High** | Mechanical table-driven rewrite; acceptance = screenshot diff shows **no** change |
| Merge conflicts across ~60 files | Medium | Land as one isolated commit, no other change |
| 6dp / 20dp have no canonical name | Medium | Name them before starting; do not drop them — 177 uses |
| Reviewer fatigue on a ~793-site diff | Medium | Mechanical and table-verifiable; script the check |
| Colliding with Phase 4B visual work | **High** | **Never run them in the same phase** |

---

## 7. Scope note

This audit examined `Spacing` only. Radius, elevation and typography were **not** audited for
cross-platform naming conflicts; iOS `Radius` usage was sampled incidentally
(`sm` 19 · `md` 57 · `lg` 95 · `xl` 172 · `pill` 12). **Whether the same naming offset exists in
those scales is unknown and unclaimed.** If OD-5 is resolved in favour of Option B, those scales
should be audited before the same question is asked again.

---

## OD-5 — status

**HOLD — HUMAN DECISION REQUIRED AFTER TOKEN SEMANTIC AUDIT.**

The audit is complete and recommends **Option C** for V3, with Option B deferred and **Option A
explicitly rejected**. The v1 statement that the iOS/Web scale is canonical is **withdrawn** and
must not be treated as approved.

**No source code was modified by this audit.**
