# V3 Phase 3 — Security Finalization (Phase 0 + 1 + 2 + 3 integrated)

Integration branch: `integration/v3-foundation`.

| Phase | Commit | Branch |
| --- | --- | --- |
| 0 · Production hardening | `0e9a31e` | `fix/phase0-production-hardening` |
| 1 · AI consultative | `f9a1fa2` | `feat/v3-ai-consultative` |
| 2 · Cost optimization | `ff55c27` | `feat/v3-ai-consultative` (on top of Phase 1) |
| 3 · Security | `a711181` | `security/v3-phase3` (branched from `0e9a31e`) |

**Topology note.** Phase 2 was not a separate branch: it is the commit directly on top of
Phase 1, so the V3 line is `0e9a31e → f9a1fa2 → ff55c27`, and there is no stale Phase 2 branch
needing a rebase. Phase 3 was a sibling of that line, branched from the Phase 0 head, and is
merged here. The merge was **clean with zero conflicts** — Phase 1+2 and Phase 3 touched
disjoint file sets, and the `streamEnrichment.ts` collision the Phase 3 handoff flagged as the
highest risk did not occur.

---

## 1. What Phase 1 and Phase 2 actually changed

Read from the commits, not from a plan.

**Phase 1 (`f9a1fa2`)** — `needProfile` (occasion lexicon, party-size reader), `needBrief` (a new
prompt block saying the understood need back to the model), `rank` (exports `SCOREABLE`), `pick`
(`cannotVerify`), and two lines in `route.ts` that render the brief and read `turnIntent`.
Deterministic and model-free throughout; no new `AI.stream()`.

**Phase 2 (`ff55c27`)** — `maxRetries: 2` stated rather than inherited, `decisionDomain` added to
`UsageEvent`, a test locking the prompt-cache breakpoint, and an opt-in measurement suite. The one
large saving it found was **escalated rather than taken**.

**Neither phase added** a route, an endpoint, an auth path, an AI tool, a write, a network call, a
cache store, a URL surface, or an image surface. Verified by grepping the combined diff for
`fetch(`, `new Map`, `redis`, `kv.`, `unstable_cache`, `localStorage`, and for URL/image tokens in
every non-test file: the only hit is a Phase 1 *architecture test* asserting that consultative
modules must **not** reach the network.

---

## 2. Cross-phase review

**Phase 2's "cache" is the provider prompt cache, not an application response cache.** This is the
distinction the whole cache-isolation question turns on. Nothing in the V3 line stores a response
and replays it to another request, so the classic "user A is served user B's cached answer" class
does not exist here. What the prompt cache holds is the `shared` prefix — the ~11k-token rulebook,
byte-identical for every caller — and Phase 2's own mutations MP06 and MP07 ("the consultative
block / the user memory block is moved INTO the cached prefix") are both KILLED, which is a
stronger guarantee than the code reading: user-derived text cannot enter the cached segment
without failing the suite.

**Phase 1's `needBrief` is the first unfenced prompt producer — and it is correct.** The other four
producers carry the user's own words and go through `fenceUntrusted`. `needBrief` is safe by a
different mechanism: it prints constants *selected by* the user's text (`SUBJECTS`, `PLACES`,
`CUISINES`, `ATTR_LABELS`, `USE_CASE_LABELS`) plus two numbers (budget, party size). The user's
text is never itself printed. See §3 for the control now holding that.

**Telemetry cannot cross users.** `flushPending` drains the buffered `UsageEvent`s to the log sink
and returns `void`; nothing reaches an HTTP response. A later request draining an earlier one's
events is a logging operation, not a disclosure. `decisionDomain` is a closed four-value union
(`places | hotel | shopping | transport | null`) derived from constant tables and allow-listed in
`ALLOWED_PAYLOAD_KEYS`; MP14 ("the cost field is dropped at the privacy boundary") is KILLED.

**Retries do not multiply an attacker's allowance.** `maxRetries: 2` sits inside the SDK, after
the rate-limit decision, so one *allowed* request can bill up to three attempts. That was already
true on the SDK default; Phase 2 only named it. With P3-F1 fixed, the ceiling is now a real
`limit × 3` rather than `∞ × 3`.

---

## 3. New control — N-1

Not a vulnerability. An **unprotected invariant**, which is a different thing and is recorded as
such.

The fence architecture guard checks that every declared *label* has a producer. It cannot see a
producer that declares no label — which is exactly what `needBrief` is. So the construction that
makes Phase 1 safe had nothing holding it in place, and it is one character from being lost:

- `label()` ends `ATTR_LABELS[key] ?? key` and `USE_CASE_LABELS[u] ?? u`, printing the raw key if
  one ever stops being closed;
- the district reader is `/\bquan\s+(\d{1,2})\b/` — widening that capture to `(\w+)` puts attacker
  text straight into the prompt;
- `cuisine:` renders `key.slice(8)`, a constant only because `setPriority` is fed from `CUISINES`.

`src/lib/ai/security/needBriefBoundary.test.ts` asserts the property — *text the user wrote does
not appear in the brief* — across seven payloads through **both** location branches, plus the
positive control that the brief still says back what it understood, and a bound on its length.

**Mutation testing found this file's first version vacuous.** MI02 ("keep the user's own words
instead of the matched place") SURVIVED, because every payload message said "Quận 1", which the
digit branch reads — the `PLACES` branch never ran. The test was strengthened to exercise both
branches; the mutation was not weakened. Both MI01 and MI02 are now KILLED.

---

## 4. Deferred findings, re-evaluated against the completed phases

| ID | Decision | Evidence |
| --- | --- | --- |
| **P3-D1** — injectable memory client | **Remains deferred.** Not fixed. | The memory caller set is *identical* to Phase 0's: `route.ts`, three crons, `/api/memory`, `/api/onboarding`, `/api/suggested-prompts`, `contextBuilder`. Phase 1 and Phase 2 touched none of them and added none. The risk is unchanged and still theoretical, so hardening the type would be a change with no defect behind it. |
| **P3-D2** — CSP `img-src ... https:` | **Remains deferred.** | Phase 1+2 added no image or URL surface, so the legitimate place-photo CDN inventory is unchanged and the allowlist still cannot be written without it. P3-F2 continues to close the channel at the boundary that knows which URLs are legitimate. |
| **P3-D3** — `extractMemoryFromConversation` unfenced | **Remains out of scope.** | Same two callers as Phase 0, unchanged flow. The extractor still reads only the user's own messages, and output is re-materialised by `sanitizeMemoryPatch`, so the blast radius is still the user's own memory row. |

---

## 5. Security invariant matrix

| Invariant | P0 | P1 | P2 | P3 | Combined |
| --- | --- | --- | --- | --- | --- |
| Server-derived identity | PASS | PASS | PASS | PASS | **PASS** |
| Authorization server-side | PASS | PASS | PASS | PASS | **PASS** |
| Tenant isolation | PASS | n/a | n/a | n/a | **PASS (scoped)** |
| AI action boundary | PASS | PASS | PASS | PASS | **PASS** |
| Memory ownership | PASS | PASS | PASS | PASS | **PASS** |
| Output fence | PASS | PASS | PASS | PASS | **PASS** |
| Image egress protection | — | n/a | n/a | PASS | **PASS** |
| SSRF protection | PASS | n/a | n/a | PASS | **PASS** |
| Rate-limit integrity | PARTIAL | n/a | PASS | PASS | **PASS** |
| Cost-control integrity | PASS | PASS | PASS | n/a | **PASS** |
| Cache isolation | PASS | PASS | PASS | n/a | **PASS** |
| Audit integrity | PARTIAL | PASS | n/a | PASS | **PASS** |
| Privacy allowlist | PASS | PASS | PASS | n/a | **PASS** |
| Deterministic financial logic | PASS | PASS | PASS | n/a | **PASS** |

`n/a` = the phase did not touch this boundary, verified by diff rather than assumed.
"Tenant isolation (scoped)" is honest about the architecture: the AI/chat path has no tenant
dimension. Multi-tenant constructs live in Controller (`src/lib/controller/org/`), which no V3
phase touched and whose own suites run green in the combined gate.

Evidence per row is the mutation and suite results in §6 of the final report.
