# PHASE 2-G1 — Place-claim guard fix · DESIGN + TEST PLAN

**STATUS (2026-09-17): APPROVED WITH CHANGES (see §0) · DEFERRED by owner · V3 RELEASE BLOCKER — V3 must not be merged until G1 is implemented and accepted. Do not implement until asked.**

## 0. Owner-approved changes (binding when implementation starts)
- L4: require name ≥ 3 tokens OR ≥ 1 non-common token; otherwise skip L4.
- L2/L2′: alias must have ≥ 2 non-stop-word tokens.
- L5: requires a review-count match (rating alone is insufficient); L5 verifies only those numbers — hours/phone/price/attributes in the same sentence still need normal attribution.
- Telemetry: separate counters for cascade-removed sentences and for G1b fallback usage.
- G1b approved: card-field data only; never say "đang mở"; write "giờ mở cửa theo Google Maps: …"; default to Vietnamese unless language is confidently English.
- Acceptance: primary = offline replay of the baseline pre-guard model text through old vs new guard (deterministic, no LLM; capture pre-guard text in the AUDIT env only — hook pattern now exists in the audit worktree); secondary = 36-run re-run with the audit user memory cleared first.
- Flag `PLACE_GUARD_ATTRIBUTION_V2` default OFF in production.
- Diff guard files main vs branch before implementing (done: guard is V3-only).
- Implement, run tests, report, then STOP before any deploy.

> **GATE RESULT (before implementation, 2026-09-17):** the required "diff guard files main vs branch" shows the guard **does not exist on `origin/main`** — `placeClaimGuard.ts` / `placeAttribution.ts` / `groundingGate.ts` were added on the V3 branch (`f8dca88`, 2026-09-10) and are unreleased. The approved design stands unchanged, but its **target is the V3 branch (`design/v3-phase4` or the V3 integration branch), not a `main` hotfix**, and "production affected" in Phase 1B §S.1 is retracted (see the erratum there). Implementation is **paused for the owner's decision** on target/priority; no code was written.

**Scope (as approved):** `guardPlaceClaimsInText` (`src/lib/ai/placeClaimGuard.ts`), `placeTokensFor` / `textNamesPlace` (`src/lib/links/placeAttribution.ts`), plus the call site that feeds them (`src/lib/ai/streamEnrichment.ts:1255-1275`). Backend only. No marker / response-contract change.
**Out of scope (named so they are not forgotten):** `guardSnippetPricesInText`, `guardMoneyClaimsInText`, `suppressUngroundedVenues` (they share the same silence problem; telemetry helper below is designed so they can adopt it later), memory (M), place evidence (B), carry-forward (C).

---

## 1. Problem (from Phase 1B, §S.1)

`guardPlaceClaimsInText` keeps a sentence's rating / review-count / phone / distance / quality claim only if the sentence can be **attributed to exactly one retrieved venue**, and the attribution is computed solely by `placeNamedIn()` → `textNamesPlace()`: a venue is nameable only through its **distinctive tokens** (tokens occurring in exactly one name of the result set, length ≥ 3, stop-words excluded) and **all of them inside one clause** (clauses split on `, ; : . ! ? … " ' ( ) [ ] \n`).

Three real name shapes defeat this:

| Shape | Baseline case | Why attribution fails |
|---|---|---|
| **Chain / branch names** sharing every token | P15-r1 pick "MASSAGE HẠ SPA QUẬN 1" next to "MASSAGE HẠ SPA Tân Bình", "Lụa Spa Quận 11", "Massage Quang Thư Quận 10" | `distinctive = []` → never nameable |
| **Address embedded in the name** | P8-r1 pick "Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1, TP. HCM" | the model writes "Vua Chả Cá"; the distinctive tokens ("vua","cha","tran","hung","dao","hcm") never sit in one clause of the sentence |
| **Sub-titles / suffixes** | "QUÁN ĂN NGON - Nguyên Sinh Bistro - est. 1942", "Truyền Thuyết ChamPong Quận 1 - 전설의짬뽕 1군점" | same clause-split effect; the model quotes the head only |

Consequence: the sentence that carries the decision ("Mình chọn **X** … 4.9⭐ (N đánh giá)") is doomed, its neighbours survive as fragments (" Quán mở từ 6h-21h…", " 😋"), and when every body sentence carries such a claim the reply collapses to the pre-tool preamble (#15-r1: 46 chars). 13/36 baseline turns show removal marks; 7/30 primary turns kept ≤ 35 % of the model's answer. Nothing is logged. Production runs the same code on the same provider; mobile shows only the preamble.

**Invariant that must survive the fix (owner's constraint):** a claim is kept **only** when it is attributed to a retrieved venue **and** that venue's evidence supports it. "Unattributable" must still mean "removed". The fix changes *how attribution is found*, never *whether an unsupported claim may stay*.

## 2. Design

### 2.1 Attribution ladder (replaces the single `placeNamedIn` path)

New pure helper `attributePlace(sentence, candidates, ctx) → { name, level } | null` in `placeAttribution.ts`, tried in order; the first level that yields **exactly one** candidate wins; two or more matches at a level → that level is inconclusive, continue; nothing at any level → `null` (unattributable, unchanged semantics).

| Level | Rule | Solves |
|---|---|---|
| **L1 · full-name containment** | normalise both sides (`fold` = strip diacritics + lowercase, collapse whitespace, strip markdown `**`/`_`, strip punctuation to spaces) and test whether the candidate's full normalised name is a substring of the normalised sentence | ALL-CAPS names, CJK/Hangul names quoted verbatim, chains written in full ("MASSAGE HẠ SPA QUẬN 1") |
| **L2 · head alias** | `headOf(name)` = text before the first ` - `, ` – `, `,`, `(`, `[`, `\|`, `:`; usable only if it contains ≥ 1 non-stop-word token and is **unique** among all candidates' heads; match by containment as in L1 | address-in-name ("Vua Chả Cá - Số 42…"), sub-titled names ("QUÁN ĂN NGON - Nguyên Sinh Bistro…" → head "QUÁN ĂN NGON" is stop-word-only → falls through; its second segment "Nguyên Sinh Bistro" is tried as an alias too — see L2′) |
| **L2′ · segment alias** | each ` - `/`,`-delimited segment of the name with ≥ 2 non-stop-word tokens, unique among all candidates' segments | "Nguyên Sinh Bistro", "Izakaya Kamura" (from "寿司と天ぷら居酒屋かむら- Izakaya Kamura") |
| **L3 · distinctive tokens in one clause** | the existing `textNamesPlace` — unchanged | everything it already handles |
| **L4 · full token-set containment** | candidate's complete token set (stop-words excluded) ⊆ the sentence's token set (any clause), and exactly one candidate satisfies it | chains that differ only in branch tokens when the model writes the full name across a clause break (e.g. "MASSAGE HẠ SPA, Quận 1") |
| **L5 · value identity (verification-only)** | if the sentence states a rating and/or a review count and those numbers are `near()` the evidence of **exactly one** candidate (rating **and** count when both present), attribute to it **for the purpose of verifying those numbers only**; quality words in the same sentence are verified against that candidate's evidence like any other attributed sentence | the model wrote a shortened name the aliases miss but quoted the exact evidence numbers; cannot admit a fabricated number because the numbers must already match evidence |
| **Anaphora carry** | existing `placeNamedAt` behaviour (inherit the nearest earlier attributed sentence in the same paragraph) — unchanged, but it now inherits from any level | "Quán này mở 10:00–22:00." after an attributed sentence |

Candidates come from the same `placeNames` array the guard already receives (the tool rows), so no new data plumbing is required for L1–L5. **Optionally** (recommended, cheap): pass `pickName` / `shortlistNames` from the collector (`placesRecommendations`, `recommended: true`) so that L1/L2 tie-breaks prefer the pick when two candidates match at the same level (e.g. two branches both named in one comparative sentence: attribute the *claims* to the candidate whose evidence matches — L5 — and otherwise treat as inconclusive). Identity is by row name string, exactly as `ratingsByEntity` is keyed today, so the maps need no change.

What does **not** change: `QUALITY_RE`, `SCORE_RE`, `REVIEW_COUNT_RE`, `PHONE_RE`, `DISTANCE_RE`, `ORDERING`/`TICKET` rules, `near()`, the evidence maps, the `scope: 'tickets'` mode, and the rule that an unattributable claim is removed.

### 2.2 Grammar-preserving removal (no fragments)

After the existing doom/trim/orphan pass, a **coherence pass** on the sentence spans:

1. A removed sentence takes its own leading whitespace/newline with it (today the separator survives → " Quán mở từ…").
2. If the **first surviving sentence of a paragraph** starts with a connective or anaphor (`Ngoài ra`, `Tuy nhiên`, `Còn`, `Nếu (bạn) muốn thêm`, `Quán này/Đây là/Nó`, `Also`, `If you want`, `It`, `This`), or with a lowercase letter, punctuation, or consists only of emoji/whitespace (≤ 3 letters), it is removed too (extends today's `ANAPHOR_RE` orphan rule, which only covers explicit anaphors).
3. A paragraph left with no letters is dropped; consecutive blank lines collapse.
4. A sentence trimmed by `stripOffendingClauses` is kept only if what remains still has a subject or a place name (extends `trimStandsAlone`); otherwise the whole sentence is removed.
5. **Empty-body fallback (G1b, needs explicit approval):** if, after all guards, the prose body (text after the pre-tool preamble) has < 40 letters **and** the turn has a Pick whose evidence contains a rating, emit one server-authored sentence built **only from evidence fields**, in the reply language:
   `Mình chọn **{pick}** — {rating}⭐ ({count} đánh giá Google Maps){, mở {opening_hours}}.` / `I'd go with **{pick}** — {rating}⭐ ({count} Google Maps reviews){, open {hours}}.`
   Rationale: the alternative is the current empty reply on mobile. It fabricates nothing (every field is a row value the card already shows). If not approved, step 5 is dropped and the reply may still be short but never fragmentary.

### 2.3 Telemetry (silent removal ends)

One console event per guarded turn, emitted from `emitReconstructed` after the chain, **no user text**:

```json
{"type":"tappyai_guard","guard":"place_claim","sentences_in":9,"sentences_removed":4,"chars_removed":612,"chars_kept":143,
 "reasons":{"quality":1,"score":2,"review_count":1,"phone":0,"distance":0,"ordering":0,"ticket":0,"orphan":1,"coherence":1},
 "unattributable":3,"attribution":{"L1":2,"L2":1,"L3":0,"L4":0,"L5":1,"anaphora":2},
 "pick_attributable":false,"body_empty_after_guards":true,"fallback_emitted":false}
```

- Implemented as a small `guardTelemetry(name, stats)` helper so `snippet_price`, `money`, `grounding_gate` can adopt it later without a second channel.
- Console-only (like `tappyai_tool_called`), deliberately **not** added to the `UsageEvent` allow-list — that vocabulary is a privacy surface and would need its own review; a follow-up can add `guardRemovedChars` to the usage record if wanted.
- `pick_attributable: false` is the exact signal that would have caught #15 in production.

### 2.4 Rollout / safety

- Feature flag in `src/lib/config/product.ts`: `PLACE_GUARD_ATTRIBUTION_V2` (default **on** for the hotfix branch after tests; the old path stays selectable for one release so a regression can be reverted by config, not by redeploy).
- Hotfix target is **`main`** (production). `placeClaimGuard.ts` / `placeAttribution.ts` on `main` must be diffed against this branch first (the V3 stack is not merged; project memory records structural conflicts elsewhere). Verification on the audit environment: re-run the 36-turn baseline with the flag on and compare `baseline-metrics.json` (delivered chars/token, fragment count) — same runner, same environment.
- Nothing reaches clients except prose; markers, annotations and CTA blocks are untouched, so web/Android/iOS compatibility is unaffected.

## 3. Test plan (all offline, no LLM)

**Fixtures** (`src/lib/ai/__fixtures__/placeClaimGuard.baseline.json`): the sanitised tool rows of P15-r1, P15-r2, P8-r1, P3-r1, S7-r1, P9-r2 from `baseline-before.json` (public place data only), plus the recorded final texts.

**A. Reproductions (must pass after the fix, fail before):**
1. P15-r1 — a r2-shaped sentence about "MASSAGE HẠ SPA QUẬN 1" with its real rating/count survives intact; `attribution.level` ∈ {L1, L4}.
2. P8-r1 — "Mình chọn **Vua Chả Cá** cho bạn! 4.x⭐ (N đánh giá)…" survives via L2.
3. P3-r1 / S7-r1 — "Nguyên Sinh Bistro", "Truyền Thuyết ChamPong" attributed via L2′.
4. "MASSAGE HẠ SPA QUẬN 1" vs "MASSAGE HẠ SPA Tân Bình" in the **same** result set: a sentence naming Quận 1 attributes to Quận 1 only; a sentence naming both is inconclusive at L1/L2/L4 and its numbers are verified by L5 per candidate.
5. Similar names ("SOO COFFEE" vs "Soo Kafe Bến Thành"): each attributes to itself; a sentence with "Soo" alone is inconclusive → unattributable → removed (anti-fabrication preserved).

**B. Anti-fabrication (must keep passing):**
6. All 16 existing `placeClaimGuard.test.ts` cases unchanged.
7. Attributed sentence with a rating that matches **no** candidate → removed (L5 cannot rescue it).
8. Unattributable "quán được đánh giá cao" → removed.
9. Phone that belongs to another candidate → removed even when the sentence names the pick (evidence mismatch beats attribution).
10. `scope: 'tickets'` behaviour unchanged.

**C. Coherence:**
11. No output sentence starts with whitespace, lowercase, or punctuation; no orphan connective ("Ngoài ra…") without an antecedent; no emoji-only remainder; no empty paragraph.
12. The pre-tool preamble is never touched (it is released before the guards run — regression guard for the A5-P1 early flush).
13. (G1b) fallback sentence is emitted only when body letters < 40 and a Pick with rating exists; its content equals the row fields; language follows `lang`.

**D. Telemetry:**
14. Event emitted once per guarded turn with the counts above; assert no user text and no place name in the event; `pick_attributable=false` on the P15-r1 fixture before the fix and `true` after.

**E. Baseline re-check (environment, not unit):** rerun 36 turns on `zdaprdfgpbpnxyofagmc` with the flag on; acceptance: 0 turns with fragment markers, no primary turn ≤ 35 % delivered, and `unsupportedTerms` unchanged or lower (the fix must not reintroduce wish-words as facts — that is B's job, not G1's).

Mutation-testing note (project rule): anchors in the new tests must be unique strings, and CRLF-safe (`/\r?\n/`).

## 4. Effort / risk

~1 day: attribution ladder (pure, ~120 lines), coherence pass (~60 lines), telemetry helper (~30 lines), fixtures + ~14 tests, flag. Risks: L4 over-attribution in multi-venue sentences (mitigated by the exactly-one rule and clause-level fallback); alias uniqueness on very generic heads (mitigated by stop-word requirement); behaviour drift on `main` if the guard files differ from this branch (mitigated by diffing first).

**STOP — awaiting approval of §2 (in particular G1b, the evidence-only fallback sentence) and §3 before any code is written.**
