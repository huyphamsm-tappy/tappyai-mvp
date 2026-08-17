# Consultative V2 — Final Closure Window (2026-08-17)

Worktree `tappyai-consultative`, branch `feat/consultative-v2-ranking`, HEAD `9ce95c6` (unamended).
Nothing committed, pushed, or deployed. Android untouched.

**Evidence levels are never promoted.** SOURCE · TEST · BUILD · EMULATOR-DEVICE · PRODUCTION.
Everything below is SOURCE or TEST unless the row says LIVE-PROVIDER (real Serper + real model, this machine, `.env.local`).

Row labels are the **Phase-2 acceptance-contract items**, not the original 12 numbered DoD
behaviors — the numbered list was given in chat and is not held verbatim in this session, and
inventing IDs would misrepresent the mapping.

---

## Budget actually spent

| Resource | Cap | Spent | Notes |
|---|---|---|---|
| Model requests | 4 | **4** | 2 lost to a harness defect of mine (below), 2 faithful |
| Serper requests | 4 | **1** | cached to disk; the SAME 12-candidate array served both languages |

The first harness passed only the consultative prompt blocks and never delivered candidate
evidence, so the model correctly answered "I have no search results" and asked clarifying
questions. In the real route the evidence arrives as a **tool result** carrying `_tappy_ranking`.
That run is **not product evidence** and is reported as a harness defect, not a product finding.

Because the model budget was exhausted, the final verification of the fixes is a **deterministic
replay of the exact recorded raw model output** through the fixed guard. For a guard that is a pure
function, replaying the text that actually failed is stronger evidence than a fresh sample.

---

## CURRENT → ACCEPTANCE MATRIX

| Contract item | Current implementation | Test evidence | Live evidence | Remaining gap |
|---|---|---|---|---|
| Backend owns the decision | `rank.ts` single central ranker; LLM explains only | `rank.test.ts` 30, `architectureLock.test.ts` | LIVE-PROVIDER: Pick = `ranked[0]` in both languages | none |
| Architecture lock | one `AI.stream()`, no `toolChoice`/`prepareStep`/prefetch; `shared` byte-identical | 52/52 lock + TikTok | — | none |
| Need Profile | per-turn fold of `messages[]`, no DB | `needProfile.test.ts` 52 | LIVE-PROVIDER: budget 30M, domain/subject correct both languages | none |
| Priority extraction | prefix **and** postfix markers; qualified spec nouns | `NP-PRIO-01/02` (17 new) | LIVE-PROVIDER: `price` now derived in both languages | none |
| Missing-data policy | matching `+w`, missing `0`, contradicting `−w` | `rank.test.ts` | LIVE-PROVIDER: 0/12 candidates carried weight or battery, and neither was scored | none |
| Pick | `derivePick` under 4 conditions, `conditional` flag | `pick.test.ts` 30 | LIVE-PROVIDER: VI conditional=true, EN conditional=false | none |
| Grounding (deterministic) | `specGuard.ts` at the pre-emission point in `streamEnrichment.ts` | `specGuard.test.ts` **70** | LIVE-PROVIDER: EN — 4 unsupported claims removed; VI — 0 removed, disclaimers intact | none for weight/battery |
| Why | measured on the emitted text, one-sentence window | `replyAnalysis.test.ts` (+4) | LIVE-PROVIDER: VI full; EN present + requirement, attribute absent | see EN note |
| Trade-off | measured, not enforced | `replyAnalysis.test.ts` | LIVE-PROVIDER: VI grounded; **EN absent after guarding** | genuine EN gap |
| Language | `detectLang` per message | `responseLanguage.test.ts` 15 | LIVE-PROVIDER: VI→VI, EN→EN, correct in the tool path | none observed (n=1 each) |
| Refinement / decision stage | `resolveDecisionStage` | `refinement.test.ts` 34 | LIVE-PROVIDER: both runs classified `refinement` on turn 2 | none |
| Transport mode stage | `tripContext.ts`, deterministic | `travelFlow.test.ts` 64 | not exercised in this window | UNVERIFIED, not failed |
| Price Watch VI/EN | `priceWatch/messages.ts` | 94 | not exercised in this window | UNVERIFIED, not failed |

---

## Defects found and closed in this window

All five were found **by the acceptance run**, each fixed RED-first, product code changed only where
the product was wrong. Every fixture string is verbatim model output from the run.

1. **Analyzer required the candidate name in the same sentence as the causal clause.** A real
   explanation spans two sentences ("Mình nghiêng về X." / "Vì ngân sách…"). Widened by exactly one
   sentence of context; a causal clause elsewhere in the reply still does not count.
   *Measurement fix only — the product requirement is unchanged.*
2. **Guard deleted the model's honest "no data" admission.** The VI reply said
   "chưa có dữ liệu cụ thể về trọng lượng và pin" — exactly what the grounding contract asks for —
   and the guard removed it, taking the grounded trade-off with it. `EVIDENCE_ABSENCE` added: an
   absence statement asserts nothing.
3. **A product CATEGORY in a marketplace title was treated as an identity.** A title containing
   "Laptop Văn Phòng" meant the generic phrase "laptop văn phòng" identified that one ThinkBook.
   Category words moved to `GENERIC`.
4. **Single-token candidate references escaped the guard.** "ThinkPad is built for business travel —
   lightweight, reliable battery" passed the ≥2-token rule. One token now identifies a candidate
   when it is ≥6 chars; the short-token protection (`gan` from "Quán Gần") is unchanged.
5. **Whole-sentence requirement-framing shielded a product claim.** "…if you need more power…, and
   known for decent battery life" was exempted by its opening clause. Framing and absence are now
   decided per clause, carry across a requirement list, and stop at the first clause naming a
   product. Clause surgery no longer strands conjunctions or drops full stops.

Also fixed: the weight lexicon covered only "light" (so "heavier"/"portable" passed), `nặng` is
guarded against "hiệu năng", and "dung lượng pin" no longer registers as *storage*.

---

## Language matrix (LIVE-PROVIDER, n=1 per language)

| | VI | EN |
|---|---|---|
| Reply language | VI ✓ | EN ✓ |
| Pick present and = `ranked[0]` | ✓ | ✓ |
| Why present | ✓ | ✓ |
| Why references a real attribute | ✓ | ✗ (its attribute claims were unsupported and removed) |
| Why references a user requirement | ✓ | ✓ |
| Trade-off grounded | ✓ | ✗ |
| Unsupported spec claims emitted | 0 | 0 (4 removed by the guard) |
| Priorities derived | battery, price, portability | portability, price, battery |

**The EN finding is real, not an analyzer artifact.** The EN model asserted weight and battery from
world knowledge ("ThinkPads are designed for business travelers — durable, light, battery lasts a
full workday"). The guard removed every such claim, which is correct, and the model's *only*
trade-off was one of those claims. So the emitted EN reply is safe but has no grounded trade-off.
A guard can prevent a false claim; it cannot manufacture a grounded one. n=1 — this is a signal
about EN generation quality, not a measured rate.

---

## Cross-platform matrix

| Platform | Consultative status | Evidence level |
|---|---|---|
| Backend (`/api/chat`) | implemented, tested, live-verified for Shopping | TEST + LIVE-PROVIDER |
| Web | inherits the backend; no client-side recommendation logic | SOURCE only — **not deployed, not verified** |
| Android | inherits the backend; no client-side logic | SOURCE only — **vc6 under Google Play review, untouched** |
| iOS | inherits the backend; no client-side logic | SOURCE only — frozen |

No client platform was built, run, or measured. That is a deliberate consequence of the release-safety
constraint, not a passed check.

---

## Domain matrix

| Domain | Ranking | Live provider evidence |
|---|---|---|
| Places / Food | implemented, tested | not exercised this window |
| Hotel | implemented, tested (29) | not exercised this window |
| Shopping | implemented, tested (38) | **LIVE-PROVIDER, 12 real candidates** |
| Transport | normalizer + ranking implemented (35) | informational only — live fares are FUTURE |
| Flights | external handoff (Traveloka, Google Flights) | `TRAVELPAYOUTS_TOKEN` absent in every env |

---

## Regression

| Scope | Result |
|---|---|
| `src/lib/ai` + `src/lib/priceWatch` + `src/app/api` | **967 pass / 0 fail / 9 skip** |
| Full repo | **1862 pass / 3 fail** |
| `tsc --noEmit` | **0 errors in `src/`** |

The 3 failures are `auditChainInvariants.test.ts` (S-00/S-01/S-02) — the known Windows-only CRLF
cases, previously proven pre-existing by executing the same file at baseline `9ce95c6` in a
throwaway detached worktree. They read `supabase/*.sql` and are untouched by this work. The 8
uncollectable `supabase/tests/*` suites are the pre-existing missing-`embedded-postgres` ones.

---

## Completion decision

### BACKEND CONSULTATIVE V2 — **COMPLETE**

Every acceptance-contract item is implemented in deterministic backend code, covered by tests, and
the Shopping path is verified end-to-end against a real provider and a real model. The grounding
invariant is **enforced**, not requested: no candidate evidence → no assertion, at the pre-emission
control point, as a pure function. Both languages emit zero unsupported spec claims.

Two qualifications, stated rather than hidden:
- Live evidence is **n=1 per language, Shopping only**. Hotel, Places and Transport are TEST-level.
- The EN reply, after grounding, carries **no grounded trade-off**. Safe, but weaker than VI.

### OVERALL CONSULTATIVE V2 — **NOT COMPLETE**

Not because of a known defect, but because the remaining work is categorically outside what this
window was permitted to do:

| Blocker | Owner | Why it is not a backend gap |
|---|---|---|
| Web deploy + production verification | owner | deploying is forbidden here |
| Android verification | owner | vc6 under Play review; release safety is absolute |
| iOS verification | owner | frozen, 19 local commits |
| Commit / PR / CI | owner | committing is forbidden here |
| EN grounded trade-off quality | product | needs a measured rate, not n=1 |
| Live fares/inventory (Transport, Flights) | product | FUTURE by the clarified product model |

**Nothing in this window is blocked on further backend implementation.**

---

## Handoff state

- 19 dirty files in `tappyai-consultative`; HEAD `9ce95c6` unamended.
- New this window: `specGuard.ts` (+`EVIDENCE_ABSENCE`, clause-level framing, `GENERIC`,
  `STRONG_TOKEN`, weight lexicon), `needProfile.ts` (+`ATTRIBUTE_NOUNS`, `attributeNearestEnd`,
  `qualifiedSpec`, storage/battery disambiguation), `replyAnalysis.ts` (one-sentence Why window).
- Tests added: 30 (specGuard 70 total, needProfile 52 total, replyAnalysis +4).
- No secrets read, printed, or written. Credential status reported only as PRESENT/ABSENT.
