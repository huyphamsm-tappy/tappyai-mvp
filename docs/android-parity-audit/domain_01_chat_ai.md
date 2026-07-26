# Domain 01 — Chat & AI — Android vs Web Parity Audit

**Verdict:** Chat plumbing is at parity (streaming transport, history, feedback, CTA/followups, quota copy, vision, TTS), but **two flagship rendering behaviours are absent — live incremental token rendering and the `[TAPPY_PLAN]` itinerary card, which is silently stripped (content loss)**. Both are P1.

Baseline = current working tree (uncommitted included). Web reference = `src/` at freeze commit `79d05f3`.

---

## IMPLEMENTED (verified parity)

- **[P2] SSE text-delta streaming at the transport layer** — Android parses the Vercel AI SDK data stream correctly, extracting only part-type `0:` JSON-string deltas and skipping tool/annotation/step/done parts. `RealChatRepository.kt:204-212` (`parseTextDelta`) vs Web `useChat` consuming `/api/chat`. Per-call 60s read timeout aligned to server `maxDuration` (`RealChatRepository.kt:89-91`). NOTE: transport streams, but the UI does not (see MISSING P1 #1).
- **[CTA_BUTTONS] parse + render** — same two regexes (with-tag + bare-tag fallback) and same JSON `buttons` shape as Web. Android `RealChatRepository.kt:143-157,243-244` + render `ChatScreen.kt:397-422`; Web `parseCTA` `ChatInterface.tsx:75-95`. Primary=filled / secondary=outlined preserved.
- **[FOLLOWUPS] parse + render** — line-bounded regex, `split('|')`, `take(3)`, orphan-marker strip — byte-for-byte mirror of Web. Android `RealChatRepository.kt:159-168,245-246`; Web `parseFollowups` `ChatInterface.tsx:113-129`. Rendered as chips only on last reply (`ChatScreen.kt:187-192`), matching Web.
- **Parse order plan→CTA→followups** — Android `parseAssistantReply` applies the same order as Web render path `ChatInterface.tsx:1055-1057`.
- **Quota copy rendered verbatim (contract §5.9)** — 401 `anon_limit_reached` and 429 `free_limit_reached` both surface the backend `message` field verbatim (`dto.message ?: dto.error`). `RealChatRepository.kt:173-193`. Backend-owned copy is preserved, not recomposed. **CONTRADICTS nothing** — this is a genuine parity win.
- **Enrichment markdown images render** — the server-side enrichment `![alt](url)` own-line injection renders as a real photo. `TappyMarkdown.kt:96-103,139-143,320-330` (`MdBlock.Image`). This is why client-side `placeMatch` is not needed on Android (see §5 note).
- **Conversation history save / resume / list** — POST-create then PUT-update keyed on captured `conversationId`; title = first msg `take(50)` / `"Chat"` fallback; save on reply-finish; error bubbles filtered before persist. `ChatViewModel.kt:406-442`, `RealChatHistoryRepository.kt`. Mirrors Web `onFinish` save + `/chat`→`/chat/{id}`.
- **Message feedback (thumbs + report)** — like/dislike toggle+switch (DELETE-opposite-then-POST), one-way report with `reason="user_reported"`, `messageIndex` computed over non-error messages to stay aligned with the persisted array. `ChatViewModel.kt:344-404`, `MessageActionBar.kt`. Mirrors Web `handleLike`/`handleDislike`/`saveFeedback`.
- **`userPreferences` + `responseStyle` request fields** — both sent per turn, conditional-empty semantics match Web `ChatInterface.tsx:578-580`. `ChatRequest.kt:10-22`, `ChatViewModel.kt:130-136,199-209`.
- **Vision image attachment** — text-only sends `content` as string, image turn sends `[{type:text},{type:image,image:dataUrl}]`; base64 cache keyed by Uri. `RealChatRepository.kt:214-233`, `ChatRequest.kt:32-43`. Matches server dual-shape branch.
- **Regenerate / Stop / on-device TTS / locale-aware voice input** — `onRegenerate` drops last assistant turn and re-sends (mirrors `reload()`); `onStop` cancels the job and the socket; TTS + speech locale derive from app language, not hardcoded `vi-VN`. `ChatViewModel.kt:246-281`, `ChatScreen.kt:211-249`.
- **413 / 502 mapping** — input-too-long (24k char cap) → `MessageTooLong`; init error → `AiError`. `RealChatRepository.kt:186-190`.

---

## MISSING

- **[P1] Live incremental token rendering (contract / freeze §4.2 #1).** The ViewModel buffers the **entire** stream into a `StringBuilder` and only appends the assistant `ChatMessage` **after** `collect{}` completes — during streaming the UI shows a typing-dots→skeleton placeholder, never partial text. `ChatViewModel.kt:298-315` (`reply.append(token)` then post-completion `_messages.update`), placeholder `ChatScreen.kt:196-202,546-591`. Web reveals a few chars/frame via `useSmoothText` on the live target `ChatInterface.tsx:450-479,1064`. **CONTRADICTS freeze §4.1**, which classifies Chat as "READY — Streaming via raw OkHttp": streaming exists at the wire but is discarded before render. The tokens arrive incrementally (`RealChatRepository` `trySend` per delta) — only the ViewModel throws away the incremental benefit. Fix is UI-layer only.
- **[P1] `[TAPPY_PLAN]` itinerary card — stripped, not rendered = content loss (freeze §4.2 #2).** Android **deletes** the plan block (`raw.replaceFirst(TAPPY_PLAN_REGEX, "")`) and has no `TripPlanCard` equivalent, so on any planning/itinerary reply the entire trip brochure (including server-injected per-item plan photos) silently vanishes; a plan-heavy reply can leave a near-empty bubble. Android `RealChatRepository.kt:143`; Web parses to an object and renders `plan && <TripPlanCard plan={plan}/>` `ChatInterface.tsx:97-108,1066`. Contract §5.4 ("edit the parsed object & re-serialize, never splice") is not *violated* — but only because the feature is entirely absent.
- **[P2] `/api/suggested-prompts` not consumed (freeze §3.2, §4.2 #7).** Welcome chips + mood chips are static Android string resources (`quickPrompts(category)` / `moodChips()`), not the dynamic/time-aware server prompts. `ChatScreen.kt:263,306-320`, `ChatCategory.kt:37-74`. Web consumes `/api/suggested-prompts` in **both** Chat (`ChatInterface.tsx`) and Home (`src/app/page.tsx`). No Android endpoint call exists.
- **[P2] `SavePlaceButton` absent.** Web renders an inline "save this place" affordance derived from the reply text + CTA buttons (`ChatInterface.tsx:1091`); Android has no equivalent — a place surfaced in a chat reply cannot be saved from the chat surface.
- **[P2] `userLocation` never sent (location domain, degrades chat).** `ChatRequest` has no `userLocation` field; Android has zero `FusedLocationProvider` (freeze §4.2 #4). Web sends `{lat,lng,address}` when available and even gates first-send on it (`ChatInterface.tsx:578,776`). Result: Android chat gets no "near me" geographic bias for food/place search. Cross-domain root cause (Location), but the chat impact is concrete.

---

## DIFFERENT BEHAVIOR

- **[P2] History resume resolves id from the conversation list, no GET-by-id.** `getConversationMessages(id)` fetches `getConversations()` and finds by id; a conversation outside the returned window comes back empty → treated as not-found → **silently starts a fresh chat** (the code's own comment says "20-most-recent list"). `RealChatHistoryRepository.kt:31-36`, handling `ChatViewModel.kt:159-178`. No data loss (empty→clears `conversationId` to avoid PUT-overwrite), but resuming an older conversation fails silently. Needs a backend GET-by-id to fully fix.
- **[P3] CTA `internal_booking` handled as external.** Android opens **every** CTA via `Intent.ACTION_VIEW` (`ChatScreen.kt:409-415`); Web routes `internal_booking` through in-app `router.push` (`ChatInterface.tsx:1104-1114`). In practice benign: `promptBuilder.ts:224` explicitly forbids the model from emitting `type="internal_booking"` (VERIFIED), so this type should never reach the client. Safe as-is; noted for completeness.

---

## BUGS

- None net-new in the current tree. Prior audit-round hazards are already fixed in-place: `imageDataUrlCache` is a `ConcurrentHashMap` (double-send race, `RealChatRepository.kt:54`); action-bar touch targets raised to `TappyMinTouchTarget` (`MessageActionBar.kt`); error bubbles stripped from wire + persistence + feedback-index math (`ChatViewModel.kt:344-361,406-421`). These **CONTRADICT the stale `FEATURE_STATUS.md` "Chat has No AI/network yet"** noted in freeze §1.2.
- Latent, subsumed under P1: because `[TAPPY_PLAN]` is stripped, a reply whose body is mostly the plan renders an almost-empty assistant bubble (no error, no card).

---

## REQUIRED BACKEND CONTRACTS (Android depends on / needs)

- `/api/chat` Vercel AI SDK data-stream framing: text deltas as `0:"..."` lines. Android hard-depends on the `0:` part-type prefix (`RealChatRepository.kt:204-212`). Any move to full SSE `data:` framing must stay compatible (Android strips a defensive `data: ` prefix but still requires the `0:` marker).
- `/api/chat` error envelope `{error, message}` with codes `free_limit_reached` (429), `anon_limit_reached` (401); Android renders `message` verbatim (contract §5.9).
- Conversation endpoints: list (GET), create (POST), update (PUT), delete (DELETE). **Add GET-by-id** to fix the resume-outside-window gap.
- `/api/message-feedback` with `messageIndex` semantics over the persisted (error-free) message array.
- `/api/suggested-prompts` — currently **unconsumed** by Android; required to close the static-chips gap (Home + Chat).
- (Cross-domain) `userLocation` request field is honoured server-side but never populated by Android until Location lands.
