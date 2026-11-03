# V3 Security Contracts

What Phase 4 and everything after it must preserve. Each contract names the code that enforces
it and the test that fails when it stops being true — a contract nothing checks is a comment.

---

## The architecture these contracts describe

```text
User / client            ← never an authority
   ↓
Identity                 getRequestUser (JWT verified against Supabase Auth)
                         clientIp       (platform headers, never a client hop)
   ↓
Authorization            middleware (authn only) · /admin layout + /api/admin/* RBAC · RLS
   ↓
AI policy boundary       AI_TOOLS registry — the closed list of what the model may invoke
   ↓
Tool / data policy       runAiWriteAction: registry → permission → validate → scope
   ↓
Scope                    ownership from the verified session, never from the model
   ↓
Deterministic operation  execute() — the only place state changes
   ↓
Egress / DLP             streamEnrichment: image ownership · link provenance · CTA host policy
                         safeFetch + addressPolicy for outbound sockets
   ↓
Audit / telemetry        writeAuditLogAwaited (INET-safe) · ALLOWED_PAYLOAD_KEYS allowlist
```

---

## 1 · Identity contract

**Identity is server-derived. The client never supplies it.**

- Enforced by `getRequestUser` (verifies the JWT; does not compare a shared secret) and
  `clientIp` (platform headers first, XFF rightmost-only, always a valid IP or `unknown`).
- Tests: `clientIpTrust.test.ts` (17), mutations M1–M3.
- **Phase 4 constraint:** no route may read `x-forwarded-for` directly, and no client-supplied
  `userId`/`tenantId`/`role` may reach a query. If a new surface needs the caller's IP, call
  `clientIp`.

## 2 · AI contract

**AI output is untrusted. The model is never an authority.**

- The model may not determine authorization, ownership, tenant scope, financial authority,
  payment state, or identity. It supplies *arguments*; everything else comes from the session.
- Enforced by `runAiWriteAction`. Tests: `actionBoundary.test.ts`; Phase 1 mutation MU21
  ("the write boundary stops requiring an authenticated actor") is KILLED.
- **Phase 4 constraint:** a client-triggered action must be authorized server-side on its own.
  A button the model produced is a *request*, never a permission.

## 3 · Tool contract

**Every tool is declared, and every write independently re-checks authorization and scope.**

- `AI_TOOLS` is the closed inventory; `actionRegistry.test.ts` asserts it matches the route's
  tool list, so an undeclared tool fails the suite.
- No tool takes a URL or host from the model — verified across all ten parameter schemas — so
  there is no model-chosen network sink.
- **Phase 4 constraint:** a new tool needs a registry descriptor; a new *write* needs an
  `ActionPolicy` and must go through `runAiWriteAction`. Never `createAdminClient()` inside a
  tool's own `execute`.

## 4 · Content contract

**Untrusted content is fenced or structurally separated; it is never trusted prose.**

- Five producers fence with `fenceUntrusted` and are registered in `fenceBoundary.test.ts`.
- The sixth, Phase 1's `needBrief`, is safe by *construction* — it prints constants selected by
  the user's text plus two numbers — and `needBriefBoundary.test.ts` holds that (mutations
  MI01–MI02 KILLED).
- **Phase 4 constraint:** new prompt text built from user or external data must either fence
  (add the label, add the producer to `PRODUCERS`) or be provably closed-vocabulary with a test
  that says so.

## 5 · Egress contract

**The model may publish a URL only by copying one it was given.**

Three channels, three rules, one principle:

| Channel | Rule | Enforced by |
| --- | --- | --- |
| Images | Server-injected only; a model-authored image URL never reaches the client | `stripUnownedImages`, `releasableLiveText` |
| Links (prose, markdown + bare) | Must appear verbatim in this turn's tool results, or in a reply we already published | `stripUnownedLinks` |
| CTA buttons | Destination must be a platform the rulebook names, or a URL this turn produced | `guardCtaButtons` |

- Tests: `imageEgressBoundary.test.ts` (10), `linkEgressBoundary.test.ts` (17). Mutations
  M4–M7, MI03–MI11 all KILLED.
- **🚨 Phase 4 constraint — the one most at risk.** Phase 4 renders. Every rendering surface it
  adds must take its URLs from the *server-filtered* stream. Specifically:
  - do not render an image, link, or button from a payload the server has not filtered;
  - do not re-introduce `dangerouslySetInnerHTML` on a new surface without escaping first
    (`formatMessage` is the single existing transform and escapes before building any tag);
  - a new structured card marker must be added to `STRUCTURED_MARKERS`, or the prose guards
    will run over its JSON and corrupt it — this is not hypothetical, it happened during this
    phase and is why `linkEgressBoundary.test.ts` has a "platforms still work" case;
  - `router.push(btn.url)` and `href={btn.url}` are only as safe as the server-side CTA policy.
    Do not widen the button schema to new URL-bearing fields without extending `guardCtaButtons`.

## 6 · Memory contract

**Memory access is scoped to authenticated ownership.**

- `memoryService` is the single gateway; `updateMemory` pins `user_id` *after* the patch spread,
  so no candidate field can override ownership. Every caller passes a session-derived id — the
  caller set is unchanged since Phase 0.
- **Phase 4 constraint:** never pass an admin client together with a caller-supplied id
  (see deferred P3-D1).

## 7 · Data contract

**The AI receives the minimum the turn needs.**

- Memory is read for the authenticated user only; the fenced block renders a *subset* of the
  row (`MEMORY_COLUMNS`, and `buildMemoryBlock` narrows further by forced tool).
- **Phase 4 constraint:** do not widen the prompt with whole records because they are available.

## 8 · Financial contract

**Financial statements are deterministic, never model-authored.**

- The money guard and spec guard redact a price the structured evidence does not support; the
  travel guard is fail-closed.
- **Phase 4 constraint:** a price shown in UI must come from the guarded stream, not from a
  model field the UI reads directly.

## 9 · Client contract

**Client state is never an authorization source.**

- Hidden UI, a disabled button, and a client-side role are not controls.
- The conversation history the client sends is used for one narrow purpose — recognising URLs we
  already published — and that is sound because a malicious client exfiltrating to itself
  already holds the data. It must not acquire any other authority.

## 10 · Audit contract

**Security evidence is server-derived and cannot be erased by input.**

- Actor identity comes from the session; both allowed and denied outcomes are audited;
  `clientIp` can no longer produce a value that makes the `INET` insert fail and silently drop
  the row.
- **Phase 4 constraint:** never log prompt text, memory contents, or tokens. Telemetry fields
  must be added to `ALLOWED_PAYLOAD_KEYS` — an unlisted field is silently dropped, and a test
  fails when one is missing.
