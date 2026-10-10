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
