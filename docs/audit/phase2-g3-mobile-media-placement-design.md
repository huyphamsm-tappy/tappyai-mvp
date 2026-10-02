# PHASE 2-G3 — MOBILE MEDIA PLACEMENT · IMPLEMENTED (local only)

**Date:** 2026-09-17 · **Status:** APPROVED WITH CONDITIONS → **IMPLEMENTED on `fix/g1-place-guard-attribution` @ `7796ac5`, local only, flag `MEDIA_PLACEMENT_V2` OFF** · **Scope:** V3 only (Q3: no main cherry-pick). No push, no deploy.

## Implementation report (read this first; §0–§7 below are the approved design)

| Owner condition | Delivered |
|---|---|
| Q1 paragraph-end; list items after the item line without breaking ordered-list numbering; never inside tables / code / quotes | `blockEndAfter()` in `streamEnrichment.ts`: paragraph → after its last line; **unordered** item → after that line; **ordered** item → after the whole ordered list (the Android renderer restarts the count at "1." when a paragraph interrupts a list — measured, screenshot `g3-3-v1-a.png`); table / quote → after the block; code fence → after the closing fence; capped at the first structured marker |
| Q2 stacking in mention order, all 69 preserved | equal offsets applied in reverse mention order so the text carries them in mention order, each its own paragraph (Android `IMAGE_RUN_RE` keeps them separate galleries) |
| Marker lines byte-identical | only the insertion offset changes; `![Ảnh địa điểm]`, `🎵 [Review TikTok]`, link lines, `[TAPPY_PLACES]`/`[TAPPY_PLAN]`/`[CTA_BUTTONS]`/`[FOLLOWUPS]` untouched; `placement: 'v1'`/no options byte-identical (test) |
| Tests first, existing injector tests pass | `mediaPlacement.test.ts` (11; 4 red before the wiring, incl. the captured two-venues-one-sentence shape) + `streamEnrichment.test.ts` / `photoDeferral.test.ts` unchanged and green |
| Replay: 0 mid-sentence, 69/69 | `g1-replay-metrics.json` → `injection_mobile_path_replay_v2`: **69 inserted, 0 mid-sentence** (v1 on the same rows: 69 inserted, 10 mid-sentence on 9 turns — the earlier "13" included 3 trailing-blank false positives of the detector, since fixed) |
| Android emulator screenshots, flag ON vs OFF, 3 captured replies incl. a numbered list | `docs/audit/g1/g3-screens/` — the installed **debug** build (emulator-5554, `com.tappyai.app.debug`, API base `10.0.2.2:3410`) fed by a stand-in `/api/chat` (`docs/audit/g1/g3-render/g3mock.mjs`) that streams the SAME captured reply pre-injected with v1 or v2, so the renderer, not the model, is what differs. No LLM runs, no production traffic (the mock ignores auth and 404s everything else). |

Screenshots (v1 = flag OFF, v2 = flag ON):
- `g3-1-v1-a.png` vs `g3-1-v2-a.png` — run 2 #1: v1 cuts "…truyền thống, hoặc" and drops the photo into the sentence; v2 keeps the sentence whole, Kamura's then KOHAKU's block follow the paragraph.
- `g3-2-v1-b.png` vs `g3-2-v2-b.png` — run 2 #8: v1 splits "hoặc **Nhà hàng chay Phương Mai** …" into a new paragraph after the photo; v2 keeps "Ngoài ra còn có **Béo Ơi Quán** …, hoặc **Nhà hàng chay Phương Mai** … đồ chay." intact.
- `g3-3-v1-a.png` vs `g3-3-v2-a.png` — numbered list (built from run 2 #1's rows; none of the 30 captured replies used an ordered list): v1 renders **1. / 1. / 1.** (each block restarts the list); v2 renders **1. 2. 3.** with the galleries after the list.
Web: unchanged — the web client sends `x-tappy-renders-decision-card`, so `cardOwnsEnrichment` skips injection entirely (no screenshot needed; `enriched === mainText` on every captured web turn).

**STOP.** Not pushed, not deployed.

---

Rule to satisfy: **images/links are never inserted mid-sentence; the marker contract for installed Android/iOS apps stays unchanged.**

## 0. What was measured
Re-running `injectPlaceEnrichment` offline on run 2's captured rows (mobile path — no `x-tappy-renders-decision-card` header, so the server injects): **69 blocks inserted, 13 mid-sentence, on 11/14 turns.** Samples:

```
… nếu bạn muốn không khí izakaya truyền thống, hoặc ⟨![Ảnh địa điểm](…)⟩  **KOHAKU RAMEN & UDON** (4.8⭐) nếu thích…
…có thể thử **Wego Coffee** (4.8⭐, 337 đánh giá) hay ⟨![Ảnh địa điểm](…)⟩  **Every Half Roastery** (4.7⭐, 943 đánh…
…*BULMAKYEOLSAM** (4.8⭐, mở từ 15:00 đến 3 sáng) và ⟨![Ảnh địa điểm](…)⟩  **Gogi House** (4.7⭐, 11:00-22:00) cũng…
```
Every case is the same shape: two venues named in ONE sentence ("A … hoặc **B** …"). Web is unaffected today only because the decision card owns enrichment there (`cardOwnsEnrichment`); the same code runs for every installed app.

## 1. Root cause (one line of code)
`boundaryAfter(ownIdx, mentionOffsets, textEnd)` returns **the next place's mention offset**, and the splice inserts at that offset unless the mention is on a later line (`lineStart > ownIdx`). When the next mention sits in the same sentence, the block is spliced into the middle of it: `before + '\n\n' + block + '\n\n' + after`. The dedup window (`placeContentLines(p, …, windowEnd)`) and the insertion point are the same number; they should not be.

## 2. What must NOT change (the contract)
- The lines themselves: `![Ảnh địa điểm](url)`, `🎵 [Review TikTok](url)`, `[Label](url) · [Label](url)` — same text, same sanitiser, same one-photo-per-place cap, same dedup.
- `[TAPPY_PLACES]…`, `[TAPPY_PLAN]…`, `[CTA_BUTTONS]…`, `[FOLLOWUPS]…` — untouched; injection still stops at `earliestMarker`.
- Android `ChatResponse.segment()`: a RUN of consecutive image lines is one positional gallery (`IMAGE_RUN_RE` allows one `\n` between image lines, so two blocks separated by a blank line stay two galleries). iOS parses the same markdown at render. Web `formatMessage`: same run rule.
- Trip plans (`injectPlanPhotos`, JSON) and the trailing-block fallback (`appendTrailingBlock`): untouched.
Nothing the clients parse changes — only **where** the lines land.

## 3. Design — split the window from the insertion point
Two numbers per place instead of one:
- `windowEnd` (unchanged) = `boundaryAfter(ownIdx, mentionOffsets, textEnd)` — still the dedup window for "is this link/photo already present near the name".
- `insertAt` (new) = **the end of the block of prose that contains the mention**, never inside it:
  1. the end of the **paragraph** containing `ownIdx` (the next `\n\n`), or
  2. if the mention's line is a **list item** (`^\s*(?:[-*•]|\d+[.)])\s`), the end of that line,
  3. capped at `textEnd` (first structured marker / end of text).
- Several places whose `insertAt` coincide (two venues in one sentence, or one paragraph naming three) are inserted **at the same offset in mention order**, each block separated by a blank line (so they remain separate galleries).
- The splice stays `before.trimEnd() + '\n\n' + block + '\n\n' + after.trimStart()`; at a paragraph end this simply becomes its own paragraph.

Consequences, by shape:
| Reply shape | Today | After |
|---|---|---|
| One venue per paragraph (`**A**\n4.7⭐ …\n\n**B**…`) | after A's paragraph | **same** |
| Two venues in one sentence (`… hoặc **B** …`) | **mid-sentence** before B | after the paragraph, A's block then B's block |
| List (`- **A** …\n- **B** …`) | before B's line (line start — fine today) | end of A's line (**same**) |
| Pick paragraph + "Ngoài ra …" paragraph naming two runners-up | pick block fine; runner-up blocks mid-sentence | pick block after its paragraph; both runner-up blocks after theirs |

Trade-off accepted: a block can now sit a sentence or two after its mention (never before the next paragraph). Proximity within the paragraph is traded for never cutting a sentence — the owner's rule.

## 4. Flag and rollout
`MEDIA_PLACEMENT_V2` (default OFF; read at call time, like the other two). With the flag OFF `injectPlaceEnrichment` is byte-identical. Server-only; no client release is needed, which is the point of keeping the contract.

## 5. Tests first
1. The three captured shapes above as fixtures: assert the block lands after the paragraph, and that **no `\n\n![` follows a character that is not sentence-final** (`[.!?…:]`, `)` or `**` closing a header line).
2. Existing `streamEnrichment.test.ts` "photo AFTER its own name and BEFORE the next place" on `TEXT_3` (one venue per paragraph) — must still pass unchanged.
3. Same-paragraph two venues: both blocks after the paragraph, in mention order, separated by a blank line (two galleries for Android's run rule).
4. List items: block after the item line, before the next item.
5. Dedup unchanged: a photo/link already present inside the (unchanged) window is still not re-injected.
6. `[CTA_BUTTONS]` / `[TAPPY_PLAN]` / trailing fallback paths: byte-identical.
7. Flag OFF: byte-identical on every fixture.

## 6. Acceptance — offline replay, no LLM runs
Re-run `injectPlaceEnrichment` on the captured `placesFull` rows (run 2, 14 turns — `scripts/audit/g1Replay.audit.test.ts` already does this): **blocks_mid_sentence must be 0**, blocks_inserted must stay 69 (nothing lost, nothing duplicated), every block still after its own mention and before the next paragraph. Then a mobile-surface run (`AUDIT_SURFACE=mobile`, 12 turns) on the audit env with the flag ON to see the server output as the apps would receive it.

## 7. Decisions needed
- **Q1** Paragraph-end (list item = line-end) as the insertion rule, accepting that a block may trail its mention by a sentence or two — approve?
- **Q2** Stack several places' blocks at one offset in mention order (vs. only the first place's block, others deferred to the trailing fallback) — approve stacking?
- **Q3** Flag `MEDIA_PLACEMENT_V2`, default OFF, V3-only (same code is on main and exposed to today's mobile users: a main hotfix would be a clean cherry-pick of one function — decide together with the G2 Q4 trigger).

**STOP** — no code written for G3.
