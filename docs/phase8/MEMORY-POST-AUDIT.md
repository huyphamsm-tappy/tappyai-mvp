# `POST /api/memory` — end-to-end audit and decision table (2026-10-10)

Status: **audit only. The route is NOT closed, limited or changed.** No quota value is proposed as a fact; the owner supplies any numbers. Baseline `5c9a1b3`.

## 1. Facts (verified in code)
| Question | Finding |
|---|---|
| What it does | Reads the caller's stored memory, calls `extractMemoryFromConversation(messages, existing)` (an LLM call) and, when it returns anything, writes the merged memory (`updateMemory`). |
| Authentication | `getRequestUser`: any session; **401 only when there is none**. An **anonymous session is accepted** (no `refuseAnonymousSocialWrite`, no eligibility check). |
| Request validation | `const { messages } = await req.json(); if (!messages?.length) return …`. **No cap on the number of messages, their length or their type**; non-string `content` is `JSON.stringify`-ed into the prompt; the body size is bounded only by the platform. |
| LLM cost exposure | `AI.generate({ role: 'fast', maxTokens: 500, … })`: **output is capped at 500 tokens; the INPUT is not** — every `user` message is concatenated into the prompt (plus the stored memory context). Cost per call grows with what the caller sends. No limiter of any kind guards the route (the SEC4 ratchet lists it as a known gap, slice 3). |
| Callers — Web | **None.** `ChatInterface.tsx` documents that the duplicate client POST "ran a second identical LLM extraction per reply and is removed"; the Tappy-knows page uses `GET`, `PATCH`, `DELETE`. |
| Callers — Android / iOS (read-only grep, nothing edited) | Android `MemoryApi`: `GET`, `PATCH`, `DELETE` only. iOS `ChatService` / `ProfileService`: `GET`, `PATCH`, `DELETE` only. **No mobile client calls `POST`.** |
| Where extraction really happens | server-side in `/api/chat`'s `onFinish` (the same service function, under the chat route's own limits and quotas). |
| Tests | none for the route's `POST`; `memoryBoundary` / `memoryContract` / `memoryWrite` cover the service. `socialWriteAccess.test.ts` lists the route among routes that deliberately do not refuse anonymous sessions. |
| Is the route needed? | **Not by any known client.** Unknown: external callers, and very old cached Web bundles (the duplicate call was removed from the source; whether production still serves such a bundle cannot be verified here). |

## 2. Decision table (the owner chooses; nothing below is implemented)
| Option | What changes | Cost exposure after | Compatibility risk | Needs from the owner | Reversible |
|---|---|---|---|---|---|
| **A. Disable `POST`** (answer a fixed 410/404 and log one line per hit for one release; `GET` / `PATCH` / `DELETE` untouched) | one handler becomes a tombstone | **none** (no LLM call can be triggered through this route) | stale cached Web bundles or an unknown external caller would get an error instead of a (second, redundant) extraction; no known mobile or Web caller | confirmation that no external caller exists; 410 vs 404 | yes (restore the handler) |
| **B. Keep and limit** (shared limiter keyed on the user + a payload cap on message count and characters) | limiter + validation added | bounded by the numbers chosen | none for existing callers (there are none); keeps a dead, costly surface alive | **the per-minute limit, the daily cap, the maximum messages and characters** (this audit invents none) | yes |
| **C. Keep, refuse anonymous sessions only** | one auth check | still unbounded for any signed-in account | none | – | yes |
| **D. Leave as is** | nothing | unbounded input, one LLM call per request, any session | none | – | – |

**Recommendation (not a decision): A** — no client uses the route, it removes the exposure completely without inventing quota values, and it is the cheapest to reverse. B is the right choice only if the owner wants the endpoint kept for a future caller.

## 3. Resolution (2026-10-10) — dependencies checked, POST disabled
Evidence gathered for the decision (all in-repository; production traffic is not visible from here):
- **Route exports:** `GET`, `POST`, `PATCH`, `DELETE`. **Callers:** Web — none for POST; Android `MemoryApi` — `GET`, `PATCH`, `DELETE`; iOS `ChatService` (`GET`) and `ProfileService` (`PATCH`, `DELETE`). `git log --all -S` over `ios/` and `android/` finds **no commit that ever added a POST to `/api/memory`**. The UAT evidence script `docs/uat/evidence/f093-2026-09-25/live_memory.mjs` uses `GET`/`PATCH`.
- **Documented external integration:** `docs/ios/04_API_CONTRACT.md` §2.3 and its endpoint table list `GET/POST /api/memory` ("POST writes/updates"). That description is **stale** — the real `POST` was an LLM extraction and the writing endpoint is `PATCH` — and the iOS client it documents never called POST. Other documents (`FINAL_ARCHITECTURE`, `AI_Personalization_Architecture`, the 2026-09-30 security audit's route table) merely list the method. **That iOS document was NOT edited** (it lives in the mobile documentation; the correction is a follow-up for the application phase). No other integration, SDK or webhook references POST.
- **Cannot be ruled out from here:** an external caller outside the repository, or a very old cached Web bundle, hitting production. Disabling answers a harmless 404 to such a caller.
- **Authentication paths:** unchanged for the supported methods (`GET`: any session, `null` when none; `PATCH`/`DELETE`: 401 when none).

**Change made (`016b996`):** `POST` now answers **404 with an empty body before any authentication, memory read, model call or write**, and the module no longer imports the extraction function. `GET`/`PATCH`/`DELETE` are byte-for-byte unchanged. Tests: POST cannot reach the LLM, extraction, memory store or session lookup for a signed-in, anonymous or signed-out caller, an empty body, a 2000-message body or malformed JSON; the supported methods behave as before; restoring the old POST fails 3 of 3 tests. **Reversal** needs the owner's limiter and payload numbers (option B above).

## 4. Residual risk and Web handoff (2026-10-10, second continuation)
**Kept as implemented:** `POST /api/memory` answers 404 with an empty body before any work (`016b996`); `GET` / `PATCH` / `DELETE` are unchanged. Nothing in this section changes code.

**Residual risk (not ruled out):**
1. An **external caller outside this repository** (a script, a partner, a very old mobile build) that relied on `POST` would now receive a 404 instead of an LLM extraction. Repository evidence shows no such caller; production access logs for `POST /api/memory` over a long window are **not available here**, so the absence is unproven.
2. A **stale cached Web bundle** from before the duplicate client call was removed could still send the request. The effect is the intended one (no second extraction; the real extraction runs server-side in `/api/chat`'s `onFinish`); the visible symptom would be a failed background request, not a user-facing error.
3. The 404 is silent by design (no log line, so a probe cannot be used to amplify logging). Consequence: the *only* way to learn whether anything still calls it is the platform's request logs.

**Evidence that would close the risk:** the Vercel request log count of `POST /api/memory` for the last 30 days before release (and its user-agents), or a one-release observation window after deploy showing zero hits.

**Web handoff note for the separate application phase (do not act on it in the Web-only task):** `docs/ios/04_API_CONTRACT.md` §2.3 and its endpoint table describe `GET/POST /api/memory` with "POST writes/updates". That text is stale for two reasons — `POST` was an LLM extraction (not a write) and is now disabled (404), and the endpoint that writes memory is `PATCH`. The iOS client never called `POST`. The document should be reconciled in the application phase, together with any iOS API documentation that lists the method. **Not edited here:** iOS code and iOS API documentation are outside this task's authorisation.

## 5. The exact evidence that would resolve the external-caller risk (third checkpoint) — NOT collected; the risk stays OPEN
The 404 (`016b996`) is preserved and nothing was changed. The risk is closed only by **production request logs** showing no caller; nothing in the repository can show it.

**What must be true to call it closed:** zero `POST /api/memory` requests from real clients in a window of **at least 30 days that ends at the moment of the check** (any status code: before the 404 deployed a caller would have received 200/401, after it 404), plus the deployment date of `016b996` to know which statuses to expect.

**Queries (to be run by someone with production log access; they were not run here):**
1. Vercel CLI (installed 54.18.2; flags below are those printed by `vercel logs --help`, no network used to read them):
   ```bash
   vercel logs --environment production --since 30d --query "/api/memory" --limit 1000 --json > memory-logs.jsonl
   ```
   `--since` is documented with relative forms such as `1h` / `30m`; if `30d` is rejected use an ISO timestamp (`--since 2026-09-10T00:00:00Z`). Then keep only POSTs. The JSON field names are not verified here — read the first line of `memory-logs.jsonl` and filter on its path and method fields, e.g. with `jq 'select(.path=="/api/memory" and .method=="POST")'` after correcting the field names.
2. Vercel dashboard → the project → **Logs** → time range *Last 30 days* (or custom) → filter **Path** `/api/memory` and **Method** `POST`; repeat with *Status* `404` to see the post-change hits. Group by day and by User-Agent.
3. Read-only sanity check on the count of legitimate traffic: the same filter with Method `GET` (the Tappy-knows page and the mobile clients use it) should be non-zero; if both are zero the retention window or the filter is wrong, not proof of absence.

**Hard limit on this evidence:** Vercel runtime-log retention depends on the plan and is short on lower tiers (the project's own notes say there is no Pro plan; the plan in force is **UNVERIFIED**). If the retained window is shorter than 30 days, the 30-day statement **cannot be made** from Vercel logs; options (each needs an owner decision): a log drain / external log store for one release, or a one-line structured log in the 404 handler (no body, no user id) and an observation window of one release. Neither was added.

**What a non-zero result means:** list the User-Agents and IPs of the hits; a stale Web bundle looks like the app's own origin and a browser UA; a mobile build or script looks different. Restoring the old handler is *not* the response — it would need the owner's limiter and payload numbers (option B in §2).
