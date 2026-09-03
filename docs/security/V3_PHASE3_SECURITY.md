# V3 Phase 3 — Security Baseline, Threat Model and Finding Matrix

Base commit: `0e9a31e` (V3 Phase 0, "harden production AI and client protocol").
Branch: `security/v3-phase3`, integrated onto Phase 1+2 as `integration/v3-foundation`.

Scope is the security work **deferred from Phase 0**, not a re-audit of what Phase 0 closed.

---

## 1. Security baseline (state on arrival)

The application is a Next.js 14 App Router app on Vercel, with Supabase (Postgres + RLS +
Auth) as the authoritative store and Anthropic models behind a provider adapter.

Controls verified as **present and holding** — deliberately not modified:

| Boundary | Control | Evidence |
| --- | --- | --- |
| Authentication | `getRequestUser()` verifies a Bearer JWT against Supabase Auth (`auth.getUser(token)`), never against a shared secret; the cookie path uses `getUser()`, not `getSession()`. Returns an identity-scoped client so RLS applies to both web and native. | `src/lib/auth/getRequestUser.ts` |
| Authorization | Middleware enforces authentication only and explicitly refuses DB-backed role checks; RBAC is re-checked in the `/admin` layout and in every `/api/admin/*` handler. | `middleware.ts:61-76` |
| AI to write boundary | Every AI-initiated write runs through `runAiWriteAction`: registry, permission, argument validation, scope, execute, audit. The model supplies **arguments only**; the actor comes from the verified session, so a `user_id` the model was talked into passing is ignored. Denials are audited too. | `src/lib/ai/actions/runAction.ts` |
| Action inventory | All 10 AI tools are declared as data in a registry a test checks against the route, so "which tools can change state" is checkable rather than re-derived by hand. | `src/lib/ai/actions/registry.ts` |
| Memory ownership | `memoryService` is the single gateway; `updateMemory` writes `user_id` **after** the patch is spread, so no candidate field can override ownership, and `sanitizeMemoryPatch` re-materialises the candidate canonically. Every caller passes a session-derived id. | `src/lib/memory/memoryService.ts:80-94` |
| Prompt fencing | `fenceUntrusted` wraps untrusted context in non-forgeable U+27E6/U+27E7 markers with a closed set of provenance labels; content can never reproduce a marker. | `src/lib/ai/security/fence.ts` |
| Retrieval boundary | P3-S4 proves tool output reaches the model only as JSON-serialised `tool`-role data — retrieved text cannot forge a role or escape its string — and sanitises retrieved URLs before they are interpolated into markdown. | `src/lib/ai/security/retrievalBoundary.test.ts`, `src/lib/ai/tools/common.ts:114-143` |
| SSRF | `safeFetch` + `addressPolicy` pin the connection to a validated address; `isSafeHttpsUrl` is a documented pre-filter, not the boundary. The AI-image-URL path is held by an architecture rule plus a socket-counting tripwire test. | `src/lib/security/addressPolicy.ts`, `src/lib/ai/llm/__tests__/imageUrlSsrfGuardrail.test.ts` |
| Cost abuse | `/api/explore/process` refuses anonymous callers, caps registered ones, and SSRF-filters the thumbnail URL. | `src/app/api/explore/process/route.ts` |

**Assessment.** Phase 0's boundaries are real, not decorative. The residual risk is not in the
write path — it is in the two places where a decision is still carried by something other than
code: a **header the client controls**, and a **sentence in the system prompt**.

---

## 2. Threat model (attack surfaces with a real gap)

| Asset | Attacker | Entry point | Threat | Existing control | Gap | Severity |
| --- | --- | --- | --- | --- | --- | --- |
| Per-IP quotas on 12 public endpoints; `audit_log` integrity | Unauthenticated internet | `x-forwarded-for` request header | Unlimited free model calls; forged or **suppressed** audit rows | `clientIp()` reads the header | Leftmost XFF entry is attacker-supplied and unvalidated | **High** |
| Victim's memory, home area, GPS label, calendar | Any web publisher | Content retrieved by `web_search` / `get_news` / place data | Zero-click exfiltration via a model-authored image URL | Prompt rule "system inserts images, you do not write them"; stream filter | The rule is a **prompt sentence**, not code; the filter returns early when the turn did not buffer | **High** |
| Model spend; extraction integrity | Any registered user | `POST /api/explore/process` body | Cost amplification and prompt injection into the extractor | Auth + anonymous refusal + 20/min cap | `caption`/`title` are unbounded and unfenced in the prompt; `category` is not validated against its enum | **Medium** |

Explicitly **not** a finding after investigation:

- Cross-user memory read — every `getMemory`/`updateMemory` caller passes a session-derived id;
  the one admin-client write (`route.ts:1083`) passes `authedUserId`, and `updateMemory` pins
  ownership after the spread. Safe by construction.
- Tool output forging a role or reaching the system prompt — proven structurally by P3-S4.
- AI-initiated cross-user writes — `runAiWriteAction` derives the actor server-side.

---

## 3. Finding matrix

### P3-F1 · Request identity is client-controlled

- **Area** — request identity, rate limiting, audit integrity
- **Affected code** — `src/lib/security/rateLimit.ts:53-57`; 12 call sites; `src/lib/admin/audit.ts:80`
- **Attack scenario** — the caller sends `x-forwarded-for: <random>` on every request.
  `clientIp()` returns the **leftmost** entry, which is whatever the client wrote. Each request
  therefore lands in a fresh rate-limit bucket, so `chat`, `scan`, `translate`, `viet-content`,
  `reviews`, `scam-shield`, `links/resolve`, `sound/play`, `track` and anonymous-session minting
  are all uncapped. The same value is written to `audit_log.ip_address`, so an attacker also
  chooses the IP recorded against their own AI write actions. Because that column is `INET`, a
  value that is not an IP makes the insert **fail**, and `writeAuditLogAwaited` only logs and
  returns `false` — so a single malformed header deletes the attacker's own audit row and leaves
  a gap in the `audit_chain`.
- **Current behaviour** — leftmost XFF, unvalidated, no notion of a trusted proxy.
- **Expected behaviour** — identity comes from a header the platform sets and the client cannot
  overwrite, and is a syntactically valid IP or nothing.
- **Severity** High · **Exploitability** Trivial (one header, no account)
- **Existing protection** — none.
- **Required fix** — prefer Vercel's platform-set headers, never trust a leftmost client hop,
  validate the result as an IP.
- **Test required** — yes: a spoofed XFF must not create a new bucket; a non-IP must not reach the audit row.
- **Phase 3 scope** — **YES** (deferred item A)

### P3-F2 · Model-authored image URLs are rendered, giving injected content an egress channel

- **Area** — AI output guard, indirect prompt injection, data exfiltration
- **Affected code** — `src/lib/ai/streamEnrichment.ts:140-186, 876`; `src/components/ChatInterface.tsx:512-528`; `next.config.mjs` CSP
- **Attack scenario** — the system prompt tells the model that images are system-inserted and it
  must never write `![...](...)` (`promptBuilder.ts:293`). Nothing enforces that.
  `isOwnedEnrichmentLine` strips a line only when **every** image on it is server-owned, so a line
  carrying an attacker-chosen URL is *kept*; and `applyPlaceEnrichmentStreamFilter` returns at
  `if (!bufferMode) return` on any turn without a place search — a `web_search` turn is never
  inspected at all. Client-side, `formatMessage` rewrites `![alt](url)` into `<img src="${url}">`
  under `dangerouslySetInnerHTML`, and the CSP allows `img-src ... https:`, so the browser fetches
  any https host. A page that ranks for a plausible query can therefore instruct the model to
  append an image whose query string carries the victim's remembered location, preferences or
  calendar — exfiltrated with **zero clicks**.
- **Current behaviour** — un-owned, model-invented image URLs survive to the DOM and are fetched.
- **Expected behaviour** — an image URL the server did not supply never reaches the client.
- **Severity** High · **Exploitability** Moderate (needs the victim's query to retrieve attacker content)
- **Existing protection** — a prompt instruction, plus partial and inverted line-stripping. The
  repo already applies the correct pattern to TikTok links (`stripUnvalidatedTikTokLinks`:
  "removing an UNvalidated one is what makes invention impossible") — images never got it.
  Acknowledged in-tree as open: "the client renderer is not verified (P3 audit F7 — still open)".
- **Required fix** — apply the existing ownership oracle to images on every turn: strip any
  markdown image whose URL is not server-owned, buffered or not.
- **Test required** — yes: adversarial, proving the attacker URL never reaches rendered HTML.
- **Phase 3 scope** — **YES** (deferred items B and C; the repo's own open F7)

### P3-F3 · Unbounded, unfenced untrusted text in `contentProcessor` prompts

- **Area** — content processing, prompt injection, cost
- **Affected code** — `src/lib/explore/contentProcessor.ts:17-78`; `src/app/api/explore/process/route.ts:57-63`
- **Attack scenario** — `caption` and `title` are interpolated raw into the prompt inside quotes,
  so a `"` plus a newline ends the quoted span and the rest is read as instructions. Neither is
  length-capped before the model call, so a registered user can post a multi-megabyte caption
  20 times a minute and bill the project for the tokens. `category` is returned to the caller as
  any string the model emits rather than one of its seven declared values.
- **Current behaviour** — raw interpolation, no input cap, unvalidated `category`.
- **Expected behaviour** — untrusted values fenced and length-capped; output constrained to its declared enum.
- **Severity** Medium · **Exploitability** Easy, but requires an account and is capped at 20/min
- **Existing protection** — auth, anonymous refusal, per-user rate limit, SSRF guard on the thumbnail.
- **Required fix** — cap input length, fence the values, validate `category`.
- **Test required** — yes.
- **Phase 3 scope** — **YES** (deferred item E)

### Classified, not implemented

| ID | Finding | Class | Why |
| --- | --- | --- | --- |
| P3-D1 | `getMemory`/`updateMemory` accept an injectable `SupabaseClient`, so a *future* caller could pass an admin client together with a caller-supplied id | DEFERRED | No such caller exists; every current one is session-derived. A type-level fix touches files Phase 1 is editing. |
| P3-D2 | CSP `img-src ... https:` permits any host | DEFERRED | Tightening it needs the real place-photo CDN inventory (Google, gstatic, googleusercontent, Supabase, GCS and others). P3-F2 closes the channel at the boundary that knows which URLs are legitimate; the CSP is defence-in-depth on top. |
| P3-D3 | `extractMemoryFromConversation` puts the user's own messages into a prompt unfenced | OUT OF SCOPE | Blast radius is the user's own memory row, and output is re-materialised by `sanitizeMemoryPatch`. Self-poisoning only. |

---

## 4. Implemented controls

| ID | Control | Where |
| --- | --- | --- |
| P3-F1 | Request identity is derived from platform-set headers (`x-vercel-forwarded-for`, then `x-real-ip`), never from a caller-authored leftmost `x-forwarded-for` hop. XFF is consulted last and only at its rightmost entry. | `src/lib/security/rateLimit.ts` |
| P3-F1 | The result is a syntactically valid IP or the literal `unknown`, so a hostile string cannot reach the `INET` audit column, and unidentifiable callers share one bucket instead of each receiving a fresh allowance. | `src/lib/security/rateLimit.ts`, `src/lib/security/addressPolicy.ts` |
| P3-F1 | `normalizeIpAddress` reuses the existing strict IPv4/IPv6 parsers rather than adding a second copy of the address grammar. | `src/lib/security/addressPolicy.ts` |
| P3-F2 | Buffered turns: any markdown image whose URL the server did not source is reduced to its alt text — the rule already applied to TikTok links, now applied to images. | `src/lib/ai/streamEnrichment.ts` (`stripUnownedImages`) |
| P3-F2 | Live (unbuffered) turns — where `web_search` / `get_news` injection actually lands — are inspected for the first time. A bounded hold-back reassembles a token split across deltas; with no image markdown present the output is byte-identical to before. | `src/lib/ai/streamEnrichment.ts` (`releasableLiveText`, `emitLive`, `flushLive`) |
| P3-F2 | Enforced once at the stream boundary, so it covers web, Android (`ChatResponse.kt` `IMAGE_RE`) and iOS (`ChatImageStrip`) together — all three extract and auto-load `![alt](url)`. | server-side |
| P3-F3 | `caption` and `title` are fenced as `explore_content` instead of interpolated into a quoted prompt span. | `src/lib/explore/contentProcessor.ts`, `src/lib/ai/security/fence.ts` |
| P3-F3 | Both are length-capped before the model call, so the prompt is a function of a constant rather than of the caller. | `src/lib/explore/contentProcessor.ts` |
| P3-F3 | `category` is constrained to its seven declared values. | `src/lib/explore/contentProcessor.ts` |
| — | The new producer is registered in the existing fence architecture guard, so `explore_content` cannot become a label with no enforced user. | `src/lib/ai/security/fenceBoundary.test.ts` |

## 5. Parallel-development conflict risk

| File | Risk | Note |
| --- | --- | --- |
| `src/lib/ai/streamEnrichment.ts` | **High** | Phase 1 (`feat/v3-ai-consultative`) works in the AI/consultative area and is the most likely to touch this file. The change is additive — two helpers plus one emit funnel in the live branch — but a concurrent edit to the same live branch will conflict. Resolve by keeping `emitLive` as the only place live text is enqueued. |
| `src/lib/ai/security/fence.ts` | Low | One appended enum member. |
| `src/lib/ai/security/fenceBoundary.test.ts` | Low | One appended table row. |
| `src/lib/security/rateLimit.ts`, `addressPolicy.ts` | Low | Security-owned; neither phase is expected to touch them. |
| `src/lib/explore/contentProcessor.ts` | Low | Explore/upload path, outside both phases' scope. |

`src/app/api/chat/route.ts` was deliberately **not** modified, since it is the file most likely to be
contended.

---

## 6. Security handoff to Phase 1 / Phase 2

No Phase 1 or Phase 2 code was read into this branch — both worktrees were still at the Phase 0 head
(`0e9a31e`) when this audit ran, so there was nothing of theirs to review. What follows is therefore
the set of invariants their work must not break, not a review of it.

**DEFERRED TO PARALLEL PHASE — invariants, not findings**

1. **A new AI tool must be declared in the registry.**
   `actionRegistry.test.ts` asserts `AI_TOOLS` and the route's tool list describe the same set, so a
   tool added to `/api/chat` without a descriptor fails the suite. That is intended: the registry is
   how an audit knows which tools can change state.
   *Owner: Phase 1.*

2. **A new AI write must go through `runAiWriteAction`.**
   Ownership comes from the verified session, never from a model argument. A tool that writes with
   `createAdminClient()` inside its own `execute` reproduces exactly the P0-2 defect Phase 0 closed.
   *Owner: Phase 1.*

3. **New untrusted context in a prompt must be fenced and registered.**
   Add the label to `UNTRUSTED_SOURCES` and the producing file to `PRODUCERS` in
   `fenceBoundary.test.ts`. The guard fails on a declared label with no producer, which is how the
   label and its use are kept from drifting apart.
   *Owner: Phase 1.*

4. **Anything newly injected into the assistant stream must be ownership-checked.**
   P3-F2 rests on a single rule: a URL the server did not source does not reach the client. A new
   enrichment that injects images or links must extend `buildOwned`, and a new emit site on the live
   path must go through `emitLive` — enqueuing directly re-opens the exfiltration channel.
   *Owner: Phase 1. This is the invariant most at risk, because it lives in the file Phase 1 is most
   likely to edit.*

5. **`clientIp()` is now a derived value.**
   Callers gained nothing to change, but anything new that keys a quota or writes an actor IP should
   use it rather than reading `x-forwarded-for` directly.
   *Owner: Phase 1 and Phase 2.*

6. **P3-D1 remains open by choice.**
   `getMemory`/`updateMemory` accept an injectable client. Every current caller is session-derived,
   so there is no defect today; a Phase 1 feature that reads memory for a *different* user than the
   session's would create one. Flagged rather than fixed because a type-level change touches files
   Phase 1 is editing.
   *Owner: whoever adds such a caller.*
