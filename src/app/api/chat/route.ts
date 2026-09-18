import { tool } from 'ai'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { appendFileSync } from 'fs'
import { serperSnapshot, serperDelta } from '@/lib/ai/tools/serperMeter'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { timeClientEmit } from './emitTiming'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccountRestriction, accountRestrictionMessage, accountRestrictionCode } from '@/lib/account/accountStatus'
import { getAgeEligibility, ageEligibilityCode } from '@/lib/account/ageEligibility'
import { readGuestAgeDeclaration, GUEST_AGE_DECLARATION_REQUIRED } from '@/lib/account/guestAgeDeclaration'
import { buildMemoryBlock, extractMemoryFromConversation, lastMemoryExtractionUsage, updateMemory, type UserMemory } from '@/lib/memory/memoryService'
import { webSearch, resolvePlacePhotos } from '@/lib/ai/tools/common'
import { getWeather, getGoldPrice } from '@/lib/ai/tools/weather'
import { searchProducts } from '@/lib/ai/tools/shopping'
import { getNews, searchPlaces } from '@/lib/ai/tools/food'
import { getFlightPrices, getHotelPrices, getTransportOptions } from '@/lib/ai/tools/travel'
import { createTurnEditorial, editorialGate, withTravelEditorial, type TravelEditorialItem } from '@/lib/ai/tools/vnexpressTravel'
import { AI, type ModelRole } from '@/lib/ai/llm'
import { validateClientInput, readDecisionEvidenceId, readExploreClipContext } from '@/lib/ai/security/clientInput'
import { loadExploreClipContext, buildExploreClipBlock, exploreClipLocationHint, type ExploreClipContext } from '@/lib/ai/exploreClipContext'
import { applyClipTarget, applyClipAlternatives, asksForAlternatives, type ClipTargetStatus } from '@/lib/ai/exploreClipTarget'
import { withPlacesVerification, clipTargetMetric, askTappyPlaceEvent } from '@/lib/explore/clipVenueEvidence'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { fenceUntrusted } from '@/lib/ai/security/fence'
import { classifyIntent, detectLang, detectLangConfident, detectExplicitLangRequest, detectForcedTool, detectTravelIntent, detectLocationIntent, detectPlanningIntent, detectPlanActivities, detectMovieRecommendationIntent, isSimpleQuery } from '@/lib/ai/intent'
import { deriveNeedProfile, type StoredPreferences } from '@/lib/ai/consultative/needProfile'
import { resolveDecisionStage, taskSwitched } from '@/lib/ai/consultative/refinement'
import { normalizePlaces, normalizeHotels, normalizeShopping, type Candidate } from '@/lib/ai/consultative/candidate'
import { rankCandidates } from '@/lib/ai/consultative/rank'
import { shortlistShopping, shortlistCandidates } from '@/lib/ai/consultative/shortlist'
import { deriveDecisionFrame, qualifiesFor, missingFor, evidenceGap, evidenceSummary, buildDecisionFrameBlock } from '@/lib/ai/consultative/decisionFrame'
import { deriveShoppingConstraints, budgetFromHistory, validateShoppingCandidates, unmetConstraintPayload } from '@/lib/ai/consultative/shoppingConstraints'
import { proposeRelaxation } from '@/lib/ai/consultative/relaxation'
import { classifyTurnIntent } from '@/lib/ai/consultative/intentGate'
import { derivePick, buildPickPayload, buildRankingInstructionBlock, buildShoppingGroundingBlock, isExplicitChoiceRequest, hasImplicitPurchaseIntent } from '@/lib/ai/consultative/pick'
import { buildShoppingSynthesis, buildSynthesisPayload, buildSynthesisInstructionBlock } from '@/lib/ai/consultative/synthesis'
import { buildSynthesisView, renderShoppingMarker } from '@/lib/ai/consultative/synthesisView'
import { buildDecisionEvidence, renderDecisionEvidenceBlock, renderMissingEvidenceBlock, type DecisionEvidence } from '@/lib/ai/consultative/decisionEvidence'
import { resolveTripContext, buildTransportModeBlock } from '@/lib/ai/consultative/tripContext'
import { placeRecommendations, productRecommendations, stayRecommendations } from '@/lib/recommendation/fromToolResult'
import { producerSubject } from '@/lib/recommendation/slotAdmission'
import { enrichWithTikTok } from '@/lib/links/tiktokEnrichment'
import { serperSearch } from '@/lib/ai/tools/common'
import { attachCommerceLinks } from '@/lib/ai/tools/commerce'
import { rendersDecisionCard as rendersDecisionCardFor } from '@/lib/ai/decisionSurface'
import { normalizePwLang } from '@/lib/priceWatch/messages'
import { runAiWriteAction } from '@/lib/ai/actions/runAction'
import { savePriceWatchPolicy } from '@/lib/ai/actions/savePriceWatch'
import { type Budget, extractBudget, extractPlanTotalBudget, applyBudgetFilter, LUXURY_PRICE_FLOOR, applyLuxuryStreamFilter } from '@/lib/ai/budget'
import { buildSystem, buildSystemSimple, buildPrefBlock, buildRenderedDecisionBlock } from '@/lib/ai/promptBuilder'
import { applyPlaceEnrichmentStreamFilter } from '@/lib/ai/streamEnrichment'
import { splitToolResult, createEnrichmentCollector } from '@/lib/ai/toolResultSplit'
import { shouldExtractMemory } from '@/lib/ai/memoryGate'
import { sanitizePriorAssistantContent } from '@/lib/ai/sanitizePriorAssistantContent'
import { buildChatPromptContext, buildIdentityBlock } from '@/lib/ai/contextBuilder'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import { flushPending, recordEvent, type UsageEvent } from '@/lib/observability'
import { FREE_DAILY_LIMIT, ANON_LIFETIME_LIMIT } from '@/lib/config/product'
import { aiQuotaIdentity, consumeAiQuestion } from '@/lib/ai/quota/aiQuestionQuota'
import { createPlacesBudget, PLACES_BUDGET_DEFAULT, PLACES_BUDGET_PLANNING } from '@/lib/ai/tools/placesBudget'
// Consultative V1 (flag CONSULTATIVE_V1, default OFF — see docs/audit/consultative-v1-design.md).
import { consultativeV1Enabled, placeGuardAttributionV2Enabled, snippetPriceGuardV2Enabled, mediaPlacementV2Enabled } from '@/lib/config/product'
import { deriveSituation, type SituationFrame } from '@/lib/ai/consultative/situationFrame'
import { buildConsultativeV1Block } from '@/lib/ai/consultative/consultativeV1Prompt'
import { priorVenuesIn, resolveReferences, referencedVenues, factsAsked, priorTextStates, renderReferencedBlock, carriedFacts } from '@/lib/ai/consultative/referenceResolver'
import { extractAttributes, hardConstraintGaps, attributeSummary } from '@/lib/ai/consultative/reviewAttributes'
import { filterTransientMemory } from '@/lib/ai/consultative/memoryTransientFilter'
import { plainRequestTopic, appendHistoryTopic } from '@/lib/ai/consultative/memoryTopic'
import { trimPlacesForModel } from '@/lib/ai/consultative/modelPayload'
import { compactHistory } from '@/lib/ai/historyCompaction'
import { cannedChitchat, cannedCarriedFact, cannedDataStreamResponse } from '@/lib/ai/cannedReply'

export const maxDuration = 60

export async function POST(req: Request) {
  const startTime = Date.now()
  /** Audit cost sink (env `AUDIT_USAGE_LOG_FILE`): Serper calls attributed to this turn. */
  const serperAtStart = serperSnapshot()
  const auditTurn = req.headers.get('x-audit-turn')

  // ── P1-3: deliver whatever the previous request buffered ───────────────────
  //
  // Events are recorded synchronously into a module-level buffer and delivered at the START of a
  // LATER request, where the network call overlaps work the handler was already going to await.
  // Never awaited: awaiting it would put Cloud Logging's latency in front of the user's reply,
  // which is the exact cost this design exists to avoid. It cannot reject.
  //
  // Chat is where this call belongs. Before P1-3 the only flush sites were TTS and the three media
  // uploads — all low-traffic — so a chat-dominant workload would record usage events into a
  // 200-entry buffer and overflow it long before anything drained. Recording without flushing here
  // would have produced a cost pipeline that silently measured a small, biased sample.
  void flushPending(req)

  // Flood guard: cap requests per client IP (applies to anonymous and
  // authenticated callers alike, before any expensive LLM/tool work). The
  // per-user daily freemium cap below is a separate, longer-window control.
  const rl = rateLimit(`chat:${clientIp(req)}`, 30, 60_000)
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ error: 'rate_limit', message: serverMessage('rate.tooFast', requestLocale(req)) }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) } },
    )
  }

  // ── P3-S1: the client input trust boundary ────────────────────────────────
  //
  // Everything below this point works on SERVER-CONSTRUCTED values. The client's own objects are
  // never forwarded: `validateClientInput` rebuilds each message from an allowlist, so a forged
  // role (`system`/`assistant` claiming to be policy), a fabricated tool result, or a
  // provider-specific field cannot survive into prompt construction or reach a provider.
  //
  // It replaces — rather than supplements — the previous shape check and 24k character cap. Those
  // bounded the message array only; `userPreferences` was outside them entirely, so a caller could
  // put an unbounded string there and have it interpolated straight into the system prompt. The
  // single input budget covers every client-supplied field at once.
  //
  // Rejections keep the old user-facing behaviour where it existed: a size violation is still a
  // 413 with the same Vietnamese copy, and every other contract violation is a 400 carrying a
  // machine-readable code and nothing else.
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'invalid_request' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const validated = validateClientInput(rawBody)
  if (!validated.ok) {
    const isSize = validated.code === 'message_too_long'
      || validated.code === 'preference_budget_exceeded'
      || validated.code === 'input_budget_exceeded'
      || validated.code === 'image_too_large'
    return new Response(
      JSON.stringify(isSize
        ? { error: validated.code, message: serverMessage('chat.tooLong', requestLocale(req)) }
        : { error: validated.code }),
      { status: isSize ? 413 : 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const messages = validated.messages
  const rawUserPrefs = validated.preferences
  const { userLocation: rawUserLocation, responseStyle: rawResponseStyle } = (rawBody ?? {}) as {
    userLocation?: { lat?: unknown; lng?: unknown; address?: string }
    responseStyle?: unknown
  }

  // User-controlled response style (Personalization — MFS 2.6: lets the user shape tone).
  // Sent from the client (localStorage); no persistence needed. Validated to a small enum.
  const rs = (rawResponseStyle && typeof rawResponseStyle === 'object') ? rawResponseStyle as { tone?: string; length?: string } : {}
  const toneLine = rs.tone === 'formal' ? 'Giọng điệu: lịch sự, trang trọng, xưng "mình/bạn".'
    : rs.tone === 'friendly' ? 'Giọng điệu: thân mật, gần gũi như bạn thân.'
    : rs.tone === 'neutral' ? 'Giọng điệu: trung lập, tự nhiên.' : ''
  const lengthLine = rs.length === 'short' ? 'Độ dài: CỰC ngắn gọn, đi thẳng ý chính.'
    : rs.length === 'detailed' ? 'Độ dài: đầy đủ hơn, giải thích rõ khi cần.' : ''
  const styleBlock = (toneLine || lengthLine)
    ? `\n\n===== PHONG CACH TRA LOI USER CHON (uu tien) =====\n${[toneLine, lengthLine].filter(Boolean).join('\n')}\n=================================================`
    : ''

  const userLocation: { lat: number; lng: number; address?: string } | null =
    rawUserLocation && typeof rawUserLocation.lat === 'number' && typeof rawUserLocation.lng === 'number'
      ? { lat: rawUserLocation.lat, lng: rawUserLocation.lng, address: rawUserLocation.address || '' }
      : null

  // "Hỏi Tappy về chỗ này" (Explore). Shape-only read of a review REFERENCE; the
  // facts are loaded server-side below, under the caller's own RLS. See
  // `lib/ai/exploreClipContext.ts` for why one string was not enough.
  const clipRef = readExploreClipContext(rawBody)
  let clipContext: ExploreClipContext | null = null
  /** Who pressed the button, for the `ask_tappy_place` metric row. Null for a guest. */
  let clipUserId: string | null = null

  const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
  const rawContent = lastUserMsg?.content
  const lastText = typeof rawContent === 'string'
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.map((c: { text?: string }) => c.text || '').join(' ')
      : ''

  // Detect if last message contains an image
  const hasImage = Array.isArray(rawContent) && rawContent.some(
    (c: { type?: string }) => c.type === 'image' || c.type === 'image_url'
  )

  const intent = classifyIntent(lastText)
  const budget = extractBudget(lastText)
  const locationIntent = detectLocationIntent(lastText)
  const planningIntent = detectPlanningIntent(lastText)
  // A plan's budget is the WHOLE envelope, and its searches are the activities
  // the user named — both decided here, deterministically, so the planning block
  // can state the total and list exactly the searches to run (see promptBuilder).
  const planning = planningIntent
    ? { totalBudget: extractPlanTotalBudget(lastText), activities: detectPlanActivities(lastText) }
    : undefined
  // A "recommend me a movie/show" turn must NOT be routed to the place search
  // (which answers with cinemas). We drop search_places for the turn so the model
  // recommends titles from film knowledge; a venue/showtime ask keeps the tool.
  const movieRecommend = detectMovieRecommendationIntent(lastText)
  // Response language, in priority order:
  //   1. an explicit request in the message ("Answer in English", "Trả lời bằng tiếng Việt"),
  //   2. the language the CLIENT says the user is using (`Accept-Language` / `?lang`),
  //   3. detection from the message text.
  //
  // Step 2 is new, and it reverses the previous rule, which read the language out of the message
  // text alone and deliberately ignored the UI locale. That rule breaks on the most ordinary
  // Vietnamese input there is: typing without diacritics. "Tim quan bun bo ngon o TPHCM" has no
  // accented characters and no Vietnamese function words that `detectLang` weighs, so it scores as
  // English and the assistant answers a Vietnamese user in English — reproduced repeatedly on
  // 2026-09-08 against the live pipeline.
  //
  // Text detection remains the fallback for a client that sends no locale at all, so nothing
  // regresses for callers that never had one, and an explicit in-message request still wins over
  // both — asking for English in a Vietnamese app still gets English, for that turn.
  const clientLocale = requestLocale(req)
  const lang = detectExplicitLangRequest(lastText)
    ?? detectLangConfident(lastText)
    ?? clientLocale
    ?? detectLang(lastText)
  const forcedTool = detectForcedTool(lastText)
  // P0: a travel turn buffers and runs the fail-closed dynamic-fact guard, so no
  // fabricated fare/price/schedule/availability can reach the user.
  const travelIntent = detectTravelIntent(lastText)
  // Whether this turn earns a third LLM call for memory extraction. Was
  // `lastText.length > 20`, which measured wrong in both directions: it fired on
  // weather/gold/news lookups that store nothing, and dropped "Tôi ăn chay."
  // (12 chars) — a hard dietary constraint. See memoryGate.ts. Consultative V1 flips the
  // default to NO (measured: ordinary requests yield nothing the transient filter keeps) and the
  // topic of a plain request is written to `history` below without a model call.
  const worthExtract = shouldExtractMemory({ text: lastText, intent, forcedTool, consultative: consultativeV1Enabled() })
  const userMessages = messages.filter((m: { role: string }) => m.role === 'user')
  const isFirstReply = userMessages.length <= 1
  // CCP Phase 8 (P1-2): the commerce seam reads the capability and the reservation party/time/date
  // from the last few USER turns, so a reply to Tappy's clarifying question keeps them. Text only.
  const recentUserTexts: string[] = userMessages.slice(-3).map((m: { content?: unknown }) => {
    const c = m.content
    return typeof c === 'string' ? c : Array.isArray(c) ? c.map((p: { text?: string }) => p.text || '').join(' ') : ''
  })
  // Where in the decision this turn sits (C2). "Rẻ hơn" only means "tighten the
  // current task" if there IS one, so refinement is gated on a prior assistant
  // turn — read from the history already on the request, not a second LLM call.
  const hasPriorAssistantTurn = messages.some((m: { role: string }) => m.role === 'assistant')

  // resolveDecisionStage defers to the shipped detectDecisionStage whenever it
  // fires, and fills the gap where it returns null but the structured need
  // actually changed — "nâng ngân sách lên 35 triệu" is a refinement because a
  // budget moved, not because it contains a keyword. See consultative/refinement.ts.
  const decisionStage = resolveDecisionStage(messages)

  // Phase A A2 — Turn Intent Gate. `assistantAskedClarification` heuristic
  // reads the LAST assistant message: if it ends with "?" or the recognisable
  // clarifying pattern ("bạn muốn X hay Y?" / "which do you prefer?"), the
  // current user turn is a clarification response. The gate is a soft signal
  // consumed by the synthesizer/route side-effects (see turnIntent below).
  const lastAssistantText = (() => {
    const priorAssistants = messages.filter((m: { role: string; content: unknown }) => m.role === 'assistant')
    const last = priorAssistants[priorAssistants.length - 1]
    if (!last) return ''
    const c = last.content
    if (typeof c === 'string') return c
    if (Array.isArray(c)) {
      return c.map((p: unknown) => {
        if (p && typeof p === 'object' && (p as { type?: string }).type === 'text') return (p as { text?: string }).text ?? ''
        return ''
      }).join(' ')
    }
    return ''
  })()
  const assistantAskedClarification = /[?？]\s*$/.test(lastAssistantText.trim())
    || /(bạn muốn|ban muon|ưu tiên|uu tien|would you prefer|which one|what.{0,20}prefer|hay là|hay la).{0,80}[?？]/i.test(lastAssistantText)
  // 🚨 `taskSwitched` was hardcoded false in the first wiring pass because the
  // detector appeared inert. The A.5 audit found WHY it was inert: it guards on
  // `domain === null`, and `deriveNeedProfile` had no dish-name lexicon, so every
  // "tìm quán hủ tiếu / phở / bún bò" resolved to a null domain and the guard
  // short-circuited. With the lexicon fixed (needProfile DOMAIN_HINTS) the
  // detector works, so the real value is read here — a food → hotel switch is a
  // new consultation, not a follow-up to the meal.
  const turnIntent = classifyTurnIntent({
    stage: decisionStage,
    hasPriorAssistantTurn,
    // Called with default opts, exactly like `resolveDecisionStage(messages)` above:
    // `taskSwitched` compares only the DOMAIN before/after, and neither
    // storedPreferences (cuisine/dietary/budget) nor gps (location) participates
    // in domain detection. Passing them would also cross a temporal dead zone —
    // `storedPrefs` is not assigned until the memory load further down.
    taskSwitched: taskSwitched(messages),
    assistantAskedClarification,
  })
  console.log(JSON.stringify({ type: 'tappyai_intent_gate', turnIntent, decisionStage, hasPriorAssistantTurn, assistantAskedClarification }))

  // Load user memory + kiểm tra freemium limit. Quota values + measurement live
  // in @/lib/config/product — the single owner of every business value.
  let memoryBlock = ''
  let prefBlock = ''
  /** Durable preferences, reused by the need profile as a LOW-WEIGHT prior. */
  let storedPrefs: StoredPreferences | null = null
  let authedUserId: string | null = null
  let existingMemory: UserMemory | null = null
  let isPro = false
  // ── The ONE AI question quota ─────────────────────────────────────────────
  //
  // Every model-invoking feature spends from `lib/ai/quota/aiQuestionQuota.ts`; this route is one
  // spender among several (Cảnh báo lừa đảo message analysis is another). Anonymous = 5 for the
  // lifetime of the identity, registered = 15 per VN day, Pro exempt. The spend is atomic in the
  // shared store and happens here, before any model or tool work, exactly once per turn.
  //
  // The previous three mechanisms — the per-day anonymous-usage RPC in Postgres, the httpOnly
  // cookie mirror, and the count of today's chat rows — are gone from this route: none of them
  // could express a lifetime allowance or be shared with a non-chat feature.
  //
  // True once a VERIFIED identity (anonymous session or account) has been metered above; the
  // identity-less fallback below then stays out of the way.
  let quotaMetered = false

  // ── ADR-024: decision evidence state ──────────────────────────────────────
  //
  // The id is minted HERE, before AI.stream(), and that ordering is load-bearing
  // rather than tidy. The shopping tool runs DURING the stream, by which point
  // the response headers have already been committed — so an id created inside
  // execute() could never be returned. Minting up front is the only way to hand
  // the client a key without adding a second round trip.
  //
  // Always minted, even on turns that never shop: a header pointing at a row
  // that was never written costs nothing, and the alternative is a conditional
  // that has to guess what the model will do.
  const evidenceId = randomUUID()
  /** The caller's own Supabase client, kept for the RPCs. Null when unidentified. */
  let evidenceDb: SupabaseClient | null = null
  /** Evidence from a PREVIOUS turn, loaded when the client presented its id. */
  let priorEvidence: DecisionEvidence | null = null
  /** True when an id WAS presented but did not resolve — the fail-safe path. */
  let priorEvidenceMissing = false

  // True once the 18+ gate has admitted THIS request — the guest declaration or
  // the account's eligibility. Checked again after the try/catch below, because
  // that catch favours availability and must never mean "ungated".
  let ageGatePassed = false
  try {
    const { user, supabase } = await getRequestUser(req)
    // The clip the user is asking about, read through THIS caller's client —
    // guests included (the anon-key client sees exactly what the public feed
    // sees). Null on any miss; the turn then runs as plain chat.
    if (clipRef) clipContext = await loadExploreClipContext(supabase, clipRef.reviewId)
    if (clipContext) clipUserId = user?.id ?? null
    // Anonymous sessions qualify: a Supabase anonymous identity is a real
    // auth.uid() on the `authenticated` role, which is exactly what the RPCs
    // key on. Guests are the majority web path and the one that fabricated.
    if (user) evidenceDb = supabase

    // ── The 18+ gate, BEFORE quota and before any model or tool call ──────────
    //
    // Chat is product functionality, so it is gated — at the very top of the
    // path, before memory, preferences, subscription, quota and any LLM or
    // third-party call, so a refused turn costs nothing (the discipline the
    // Module 08 suspension gate below already follows).
    //
    // Two populations, two sources of truth (owner decision D1, revised
    // 2026-09-17: the guest trial stays, and so does the gate):
    //   · GUEST (no account, or an anonymous session): a self-declaration stored
    //     on the device — the `tappy_guest_age` cookie the web sets through
    //     POST /api/age-declaration, or the `x-tappy-age-declared` header an
    //     installed app sends. Evaluated server-side from the stored value on
    //     every request (`lib/account/guestAgeDeclaration.ts`). Nothing declared
    //     ⇒ 403 `age_declaration_required`; declared under 18 ⇒ 403
    //     `age_ineligible`; 18+ ⇒ on to V3's lifetime trial quota below.
    //   · ACCOUNT: main #251's `getAgeEligibility()` — a date of birth on file,
    //     underage blocked, unknown withheld.
    let ageBand: string | null = null
    if (!user || user.is_anonymous) {
      const declaration = readGuestAgeDeclaration(req.headers)
      if (declaration.status !== 'eligible') {
        const ineligible = declaration.status === 'ineligible'
        return new Response(
          JSON.stringify({
            error: ineligible ? 'age_ineligible' : GUEST_AGE_DECLARATION_REQUIRED,
            message: serverMessage(ineligible ? 'age.ineligible' : 'age.declarationRequired', requestLocale(req)),
            upgradeUrl: '/age-check',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      }
      ageGatePassed = true
    } else {
      // 🚨 FAILS CLOSED PAST THE ROUTE'S OWN CATCH. `getAgeEligibility` already
      // returns `unknown` on a read error, but an unexpected throw used to land in
      // the "auth/quota resolution failed (proceeding unmetered)" catch below — and
      // "unmetered" there also meant UNGATED: the turn reached the model with no
      // age check at all (found by ageGate.route.test.ts in the main → V3 merge).
      // An unknown age withholds the model; it never admits.
      const ageGate = await getAgeEligibility(supabase).catch((e: unknown) => {
        console.error('[chat] age eligibility threw — withholding:', e instanceof Error ? e.message : String(e))
        return { status: 'unknown' as const, ageBand: null, age: null, canSelfCorrect: true }
      })
      if (ageGate.status !== 'eligible') {
        return new Response(
          JSON.stringify({
            error: ageEligibilityCode(ageGate.status),
            message: serverMessage(
              ageGate.status === 'ineligible' ? 'age.ineligible' : 'age.verificationRequired',
              requestLocale(req)
            ),
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      }
      ageGatePassed = true
      ageBand = ageGate.ageBand
    }

    if (user?.is_anonymous) {
      // Anonymous session minted by POST /api/auth/anonymous. Same Bearer pipeline as logged-in
      // users (getRequestUser verified the JWT); the quota is keyed by that verified id, so the
      // client never sends or computes quota information. No memory, preferences, or
      // subscription lookups for anonymous identities.
      quotaMetered = true
      const spend = await consumeAiQuestion(aiQuotaIdentity(user, clientIp(req)))
      if (!spend.ok) {
        return new Response(
          JSON.stringify({
            error: 'anon_limit_reached',
            message: serverMessage('chat.anonLimit', requestLocale(req), { n: ANON_LIFETIME_LIMIT, d: FREE_DAILY_LIMIT }),
            upgradeUrl: '/login',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
      }
    } else if (user) {
      // Module 08 §4 — a suspended account cannot use AI. Checked before memory,
      // preferences, calendar and subscription lookups, so a blocked turn costs
      // no LLM tokens and no third-party calls. Anonymous sessions are handled in
      // the branch above and have no account_status row to read.
      const restriction = await getAccountRestriction(supabase, user.id)
      if (restriction.blocked) {
        return new Response(
          JSON.stringify({
            error: accountRestrictionCode(restriction.reason!),
            message: accountRestrictionMessage(restriction),
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      }

      authedUserId = user.id

      // Three reads that need nothing but `user.id` and never feed each other.
      // Run serially they were ~2-3s of dead air before the model was even
      // called (measured on prod 1e6c867: authenticated TTFB 3.6-4.0s against
      // 1.0s anonymous on the same tool-free question).
      //
      // Their position AFTER the restriction gate is deliberately unchanged: a
      // blocked account still returns above, so it still costs no LLM tokens and
      // no third-party calls. Only the post-gate reads move in parallel.
      //
      // The quota is NOT in this batch any more: it is a SPEND, not a read, and a Pro account
      // must not spend — so it waits for `isPro`, one store round-trip after the batch.
      // The age band (main #251) rides into the prompt context; the gate itself returned above.
      const [chatContext, calendarBlock, subResult] = await Promise.all([
        buildChatPromptContext(user.id, supabase, ageBand),
        // Calendar keeps its own catch INSIDE the batch. Hoisting it without one
        // would let an integration outage reject the whole Promise.all and take
        // memory, subscription and quota down with it — which the sequential
        // version, with its own try/catch, never did.
        (async () => {
          try {
            const { getUpcomingEvents, formatEventsForPrompt } = await import('@/lib/integrations/googleCalendar')
            const calEvents = await getUpcomingEvents(user.id)
            return calEvents.length > 0 ? formatEventsForPrompt(calEvents) : ''
          } catch { return '' /* calendar optional */ }
        })(),
        // Kiểm tra subscription từ DB
        supabase
          .from('subscriptions')
          .select('status, current_period_end')
          .eq('user_id', user.id)
          .single(),
      ])

      existingMemory = chatContext.memory
      // Consultative V1: the capped block whose instruction is "use it to choose, never to ask"
      // (memoryBlock.ts). Flag OFF: the legacy block, byte-identical.
      if (existingMemory) memoryBlock = buildMemoryBlock(existingMemory, forcedTool, { consultative: consultativeV1Enabled() })

      // V3 User Data Foundation — the canonical identity block (preferred name,
      // city, age band, gender). Appended to the memory block for the same
      // reason the calendar block is: it extends the user context the prompt
      // already carries rather than introducing a second channel into it.
      //
      // Before V3 the model received no name at all, so it could not address
      // the user. The block's contents are allowlisted in `contextBuilder`
      // against AI_CONTEXT_FIELDS and asserted at runtime — a date of birth
      // cannot reach here even by accident.
      //
      // Written as `+=` rather than the `(memoryBlock || '') + …` form the
      // calendar append uses, deliberately: `preModelParallel.test.ts` counts
      // that exact form to assert the calendar block is appended exactly once,
      // and a second occurrence of it here would break that count while
      // asserting nothing about this line. `memoryBlock` is initialised to ''
      // at its declaration, so `+=` needs no null guard.
      memoryBlock += buildIdentityBlock(chatContext.identity)
      if (chatContext.prefs) { prefBlock = buildPrefBlock(chatContext.prefs); storedPrefs = chatContext.prefs }
      // Appended AFTER the memory block is built, exactly as the sequential
      // version did — calendar events extend the memory block, never replace it.
      if (calendarBlock) memoryBlock = (memoryBlock || '') + calendarBlock

      const subData = subResult.data
      if (subData?.status === 'active' && subData?.current_period_end) {
        isPro = new Date(subData.current_period_end) > new Date()
      }

      // One question from the shared daily pool. Same pool every AI feature draws on, so a
      // Cảnh báo lừa đảo analysis earlier today is already counted here.
      quotaMetered = true
      if (!isPro && !(await consumeAiQuestion(aiQuotaIdentity(user, clientIp(req)))).ok) {
        return new Response(
          JSON.stringify({
            error: 'free_limit_reached',
            message: serverMessage('chat.freeLimit', requestLocale(req), { n: FREE_DAILY_LIMIT }),
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }
  } catch (e) {
    // Identity/quota resolution is best-effort so a transient auth/DB error can't
    // hard-fail chat. This favors availability over strict enforcement: on error
    // the daily cap for THIS request may be skipped. Log it so the fail-open is
    // observable rather than silent.
    console.error('[chat] auth/quota resolution failed (proceeding unmetered):', e)
  }
  // 🚨 "UNMETERED" MUST NEVER MEAN "UNGATED". If identity resolution threw before
  // the gate above could run, the request is treated as a guest: the device
  // declaration is the one thing that can be evaluated without identity, and
  // without it the model is withheld. Fails closed (owner D1: never reach the
  // model before the gate and quota checks pass).
  if (!ageGatePassed) {
    const declaration = readGuestAgeDeclaration(req.headers)
    if (declaration.status !== 'eligible') {
      const ineligible = declaration.status === 'ineligible'
      return new Response(
        JSON.stringify({
          error: ineligible ? 'age_ineligible' : GUEST_AGE_DECLARATION_REQUIRED,
          message: serverMessage(ineligible ? 'age.ineligible' : 'age.declarationRequired', requestLocale(req)),
          upgradeUrl: '/age-check',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  // ── ADR-024: recover the PREVIOUS turn's evidence ─────────────────────────
  //
  // The id is a lookup key and nothing else. Ownership is enforced inside
  // decision_evidence_load() against auth.uid(), so a caller presenting another
  // user's id gets NULL back — the same answer as expired or never-existed, and
  // deliberately indistinguishable from it.
  //
  // Facts are NEVER read from the request. The client supplies the key; the
  // server supplies the values. That asymmetry is the point: the rejected design
  // had the client echo the evidence back, which would let a page dictate the
  // price the assistant quotes.
  const presentedEvidenceId = readDecisionEvidenceId(rawBody)
  // A key that is PRESENT but unusable is not the same as no key at all. The
  // client was pointing at evidence; it just cannot be resolved. Treating that
  // as "no key" would leave the turn with no instruction, which is exactly the
  // 7deee03 behaviour that reconstructed a price from memory.
  const evidenceIdWasOffered = !!(rawBody && typeof rawBody === 'object'
    && (rawBody as Record<string, unknown>).decisionEvidenceId !== undefined)
  if (!presentedEvidenceId && evidenceIdWasOffered) priorEvidenceMissing = true
  if (presentedEvidenceId) {
    try {
      const { data } = evidenceDb
        ? await evidenceDb.rpc('decision_evidence_load', { p_id: presentedEvidenceId })
        : { data: null }
      // A jsonb row comes back as an object; anything else means "nothing usable".
      if (data && typeof data === 'object') priorEvidence = data as DecisionEvidence
      else priorEvidenceMissing = true
    } catch (e) {
      // Fail SAFE, not open: an unreachable RPC must not become licence to
      // answer from memory, which is the exact failure this feature exists for.
      console.error('[chat] decision evidence load failed (degrading to no-evidence):', e)
      priorEvidenceMissing = true
    }
  }

  // Carry it forward under THIS turn's id.
  //
  // A fresh id is minted every turn, so the client always stores the newest one.
  // Without this re-save, the second follow-up would present an id belonging to a
  // turn that never shopped, find nothing, and lose the evidence for the rest of
  // the conversation — the chain would survive exactly one hop.
  //
  // If this turn DOES shop, `freezeShoppingEvidence` writes the same id again
  // with fresher facts and wins; the RPC upserts, so the order is safe either way.
  if (priorEvidence && evidenceDb) {
    try {
      await evidenceDb.rpc('decision_evidence_save', { p_id: evidenceId, p_evidence: priorEvidence })
    } catch (e) {
      console.error('[chat] decision evidence carry-forward failed:', e)
    }
  }

  // A caller with no verified identity at all — a direct API call, or a browser whose anonymous
  // mint failed. Metered as the lifetime anonymous tier keyed by IP: the same five, once. The
  // previous cookie counter is gone — a counter the client carries is a counter the client resets.
  if (!quotaMetered) {
    const spend = await consumeAiQuestion(aiQuotaIdentity(null, clientIp(req)))
    if (!spend.ok) {
      return new Response(
        JSON.stringify({
          error: 'anon_limit_reached',
          message: serverMessage('chat.anonLimit', requestLocale(req), { n: ANON_LIFETIME_LIMIT, d: FREE_DAILY_LIMIT }),
          upgradeUrl: '/login',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  // Inject freeform user preferences from client request body
  const rawPrefsArr = Array.isArray(rawUserPrefs)
    ? (rawUserPrefs as unknown[]).filter(p => typeof p === 'string').slice(0, 50) as string[]
    : []
  if (rawPrefsArr.length > 0) {
    // P3-S2: the VALUES are fenced, the header and the instruction are not. These are free text
    // the user wrote, so they are untrusted on read even though they arrive from our own client;
    // the surrounding line telling the model what to do with them is ours, and wrapping trusted
    // policy as untrusted would be the inverse mistake (FENCE-02).
    const freeformBlock = `\n\n===== SỞ THÍCH & THÔNG TIN CÁ NHÂN CỦA USER =====\n${fenceUntrusted('user_preferences', rawPrefsArr.map(p => `- ${p}`).join('\n'))}\nHãy luôn ghi nhớ và áp dụng những sở thích này khi gợi ý.\n==================================================`
    prefBlock = prefBlock ? prefBlock + freeformBlock : freeformBlock
  }

  // Request-scoped enrichment channel (B4). Photos and order/platform links are
  // carved out of every place-tool result so they never enter the model's
  // context — the prompt forbids the model from writing them, and
  // applyPlaceEnrichmentStreamFilter injects them positionally afterwards. This
  // const lives and dies with this request: no module state, no key to collide
  // on, nothing shared between users or carried across warm invocations.
  // The turn's own words decide which producer may claim the recommendation card.
  // Passed in at construction because the collector outlives every individual
  // tool call and must judge them all against the SAME question.
  const enrichment = createEnrichmentCollector(lastText)
  // Observability for the TikTok cost/quality trade-off. Nothing branches on these.
  let tiktokEntitiesAsked = 0
  let tiktokSearched = false
  let tiktokAttributed = 0
  /**
   * The city THIS turn actually searched, captured from the tool call.
   *
   * 🚨 NOT the bare identifier `location`, which at this scope resolves to the
   * DOM's global `Location` — a real trap the compiler happened to catch here,
   * and would not have if the parameter took `unknown`.
   */
  let turnPlaceLocation: string | undefined
  const forModel = (toolName: string, result: unknown) => {
    const { model, enrichment: carved, batchTikTokUrl } = splitToolResult(toolName, result)
    enrichment.add(carved)
    // A TikTok result the search could not tie to any one place. Kept out of the model's context
    // like every other link, and rendered at the end as a related video rather than inside a card.
    enrichment.setBatchTikTokUrl(batchTikTokUrl)
    return model
  }

  // ── Consultative V2: the structured need, folded from the whole history ────
  //
  // Deterministic and model-free, so the route still makes exactly ONE
  // AI.stream() call — the architecture lock is untouched. This is what the
  // ranker orders against and what the Pick is FOR; without it there is nothing
  // user-specific to rank by. Derived here because durable preferences (a
  // low-weight prior) are only loaded above.
  const needProfile = deriveNeedProfile(messages, {
    storedPreferences: storedPrefs,
    gps: userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null,
  })

  /**
   * The decision frame — what the user is trying to DO, decided before any tool
   * runs: goal, occasion, criteria and the evidence a recommendation needs. The
   * ranker still orders against `needProfile`; the frame decides which ranked
   * rows may be recommended at all, what the model is told to search for, and
   * what to do when the evidence does not come back. Deterministic; no call.
   */
  const decisionFrame = deriveDecisionFrame({
    messages,
    need: needProfile,
    planningIntent,
    forcedTool,
    hasGps: !!userLocation,
    storedPreferences: storedPrefs,
    now: new Date(),
  })

  /**
   * Consultative V1 — the situation frame (who / occasion / when / mood / hard
   * constraints), read from the user's own words the same way the need profile
   * is, and null with the flag OFF so nothing below can consult it by accident.
   * Deterministic; still exactly ONE AI.stream() call per turn.
   */
  const consultativeV1 = consultativeV1Enabled()
  const situation: SituationFrame | null = consultativeV1
    ? deriveSituation(
      messages.filter((m: { role: string; content: unknown }) => m.role === 'user' && typeof m.content === 'string').map((m: { content: unknown }) => m.content as string),
      needProfile,
      { hasGps: !!userLocation },
    )
    : null

  /**
   * VnExpress Travel — the LIMITED editorial supplement (see vnexpressTravel.ts).
   *
   * Gated on the frame, deterministically: a TRAVEL turn whose goal is inform /
   * recommend / plan, with a destination the city table knows — from the tool's
   * own `location` argument when it has one, else the user's text. Anything else
   * (shopping, food-at-home, a hotel PRICE lookup without a city, an unknown
   * place) asks VnExpress for nothing at all.
   *
   * It runs INSIDE the tool's execute(), alongside the live call, so the model
   * reads it in the same single reasoning pass; it never fails the turn (the
   * module resolves every failure to an empty list, and an empty list attaches
   * nothing). The live providers stay authoritative for every dynamic fact — the
   * items are REVIEW_SUPPORTED and carry no structured field a guard would read.
   *
   * ONE retrieval per destination per turn: the SDK runs a step's tool calls
   * concurrently and a planning turn has up to 8 steps, so several tools may ask
   * for the supplement — they share one in-flight promise (`createTurnEditorial`).
   */
  const turnEditorial = createTurnEditorial()
  const travelEditorialFor = async (toolLocation?: string | null): Promise<TravelEditorialItem[]> => {
    const gate = editorialGate(decisionFrame, toolLocation, lastText)
    if (!gate) return []
    const travel_editorial = await turnEditorial(gate.destination.term, gate.intent, lang)
    if (travel_editorial.length) console.log(JSON.stringify({ type: 'tappyai_tool_called', tool: 'vnexpress_travel', destination: gate.destination.term, count: travel_editorial.length }))
    return travel_editorial
  }

  // Whether this turn ASKED Tappy to decide. The need profile cannot carry it —
  // it models what the user wants from the PRODUCT, not what they want from us —
  // and only the route knows which message is the current one.
  const pickSignals = {
    explicitChoiceRequest: isExplicitChoiceRequest(lastText),
    implicitPurchaseIntent: hasImplicitPurchaseIntent(lastText),
  }

  /**
   * Rank a place/hotel tool result against this turn's need, in place.
   *
   * Reordering happens on the RESULT the model reads, not in the prompt: the
   * ordering is DATA, and the safety rule that tool results are data rather than
   * instructions stays intact. The instruction that explains what the ordering
   * means lives in the system prompt, where instructions belong.
   *
   * When the ranker declines (no rankable evidence — RANK-07) the provider order
   * is returned untouched. Nothing is dropped: hard-filtered candidates are
   * removed from the model's view exactly as applyBudgetFilter already does, and
   * every surviving record keeps its own link, photo and enrichment fields.
   */
  /**
   * The Pick, in the shape the recommendation adapter reads.
   *
   * 🚨 THE DECISION USED TO STOP HERE. `placeRecommendations` looked for the
   * chosen name on `result._tappy_ranking`, and that block is built INSIDE the
   * object returned to the model - never on the result this adapter receives. So
   * every canonical recommendation came back `recommended: false`, and the card
   * layer had no pick to render even though the engine had made one.
   *
   * Same source and same caps as `buildPickPayload`, so the model's text and the
   * rendered card can never describe different choices.
   */
  const pickContext = (pick: ReturnType<typeof derivePick> | null) => {
    if (!pick) return undefined
    const leadsOn = pick.runnerUp?.leadsOn
    return {
      name: pick.candidate.name,
      reasons: pick.reasons.filter(r => r.contribution > 0).slice(0, 3).map(r => ({ attribute: r.key, evidence: r.detail })),
      tradeOff: leadsOn ? { attribute: leadsOn.key, evidence: leadsOn.detail } : null,
    }
  }

  /**
   * The explicit shopping constraints this CONVERSATION carries.
   *
   * Folded from every user turn, not just the last one: a "cheaper options?"
   * follow-up names no product, and one that forgot the subject came back
   * with laptop screens and a mouse. The budget falls back to the last turn that
   * stated one for the same reason.
   */
  const shoppingConstraints = deriveShoppingConstraints(
    messages,
    budget ?? budgetFromHistory(messages, extractBudget),
  )

  /** Consultative V1: the entity-scoped snippet text per venue, off the tool result as returned. */
  const entityTextsOf = (result: unknown): Map<string, string[]> => {
    const out = new Map<string, string[]>()
    // The row's own category text counts too ("Khu vui chơi trẻ em", "Nhà hàng chay").
    const rows = (result as { results?: unknown }).results
    if (Array.isArray(rows)) {
      for (const row of rows as Array<Record<string, unknown>>) {
        const name = typeof row.name === 'string' ? row.name : ''
        if (!name) continue
        const cat = [name, row.type, row.amenity, row.cuisine, ...(Array.isArray(row.types) ? row.types : [])].filter((x): x is string => typeof x === 'string' && x.length > 0).join(' · ')
        if (cat) out.set(name, [...(out.get(name) ?? []), cat])
      }
    }
    const snips = (result as { price_search_results?: unknown }).price_search_results
    if (!Array.isArray(snips)) return out
    for (const r of snips as Array<{ title?: string; snippet?: string; evidence_scope?: string; evidence_about?: string }>) {
      if (r.evidence_scope !== 'entity' || !r.evidence_about) continue
      const bucket = out.get(r.evidence_about) ?? []
      bucket.push(`${r.title ?? ''} ${r.snippet ?? ''}`)
      out.set(r.evidence_about, bucket)
    }
    return out
  }

  const rankForModel = (toolName: 'search_places' | 'get_hotel_prices' | 'search_products', result: unknown) => {
    if (!result || typeof result !== 'object') return { result, pick: null }
    const r = result as Record<string, unknown>
    const allCandidates = toolName === 'search_places' ? normalizePlaces(r)
      : toolName === 'get_hotel_prices' ? normalizeHotels(r)
        : normalizeShopping(r)

    /**
     * 🚨 VALIDATE, THEN RANK — IN THAT ORDER, AND ONLY FOR SHOPPING.
     *
     * Ranking answers "which of these fits best". It has no way to say "this is
     * not the thing you asked for", so a 399k laptop SCREEN scored brilliantly on
     * the price term and became recommendation #1 on the "cheaper?" turn. Measured,
     * with a laptop chassis at #3 and a mouse alongside.
     *
     * The rejected rows are removed from the array the MODEL reads as well, not
     * just from the ranking — otherwise the prose can still cite a product the
     * card refuses to show. See `shoppingConstraints.ts` for the four rules and
     * for what they deliberately do NOT do.
     */
    let candidates = allCandidates
    if (toolName === 'search_products' && allCandidates.length > 0) {
      const { kept, rejected } = validateShoppingCandidates(allCandidates, shoppingConstraints)
      if (rejected.length > 0) {
        const rejectedRaw = new Set(rejected.map(x => x.candidate.raw))
        for (const key of ['shopping_results', 'search_results']) {
          if (Array.isArray(r[key])) r[key] = (r[key] as unknown[]).filter(row => !rejectedRaw.has(row))
        }
        // Fail closed, and say why. Nothing is relaxed here and nothing is put
        // back: the model is told the constraint could not be met so it can offer
        // to widen it, which is the user's call to make, not ours.
        if (kept.length === 0) r._tappy_constraint_unmet = unmetConstraintPayload(shoppingConstraints, rejected)
      }
      candidates = kept
    }

    if (candidates.length < 2) return { result: r, pick: null }

    const ranked = rankCandidates(candidates, needProfile)

    // Phase A A8 — relaxation proposal. When the hard filter removed EVERY
    // candidate, expose a structured proposal on the tool result so the
    // synthesizer can render it. The engine never silently relaxes — the
    // caller (user) confirms, then a subsequent turn re-runs the pipeline.
    if (ranked.ranked.length === 0 && ranked.filtered.length > 0) {
      const proposal = proposeRelaxation(ranked, needProfile)
      if (proposal.triggered) {
        (result as Record<string, unknown>)._tappy_relaxation = {
          options: proposal.options.map(o => ({
            axis: o.axis,
            detail: o.detail,
            new_value: o.newValue,
            admits_count: o.admits.length,
          })),
        }
      }
    }

    if (!ranked.rankable) return { result, pick: null }

    // Phase A A5 — Rule-of-1–3 shortlist metadata. Does NOT trim the underlying
    // `results` array (that stays whole per the existing "places are left
    // whole" contract just below). Emits `_tappy_shortlist` so the model can
    // reference the 1–3 top-of-decision entries + their role. Never
    // manufactures a third slot; dedupes on canonical id.
    if (toolName === 'search_places' || toolName === 'get_hotel_prices') {
      // Only candidates that carry evidence for THIS decision may take a slot;
      // the rest stay in `results` as what they are — search results.
      // Consultative V1 widens the cap to five (`shortlistMax`); the default is the Rule of 1–3.
      const sl = shortlistCandidates(ranked.ranked, undefined, e => qualifiesFor(decisionFrame, e))
      // Consultative V1: atmosphere / audience attributes from the text this
      // turn ALREADY fetched (entity-scoped snippets) — zero new calls. They
      // ride the shortlist evidence as the only such words the model may use.
      // Never fails the turn: a V1 extraction error is logged and the turn runs as before.
      const v1Attrs = (() => {
        if (!situation || toolName !== 'search_places') return null
        try { return extractAttributes(entityTextsOf(result)) } catch (e) { console.error('[consultative-v1] attributes failed:', e); return null }
      })()
      if (sl.selected.length > 0) {
        (result as Record<string, unknown>)._tappy_shortlist = sl.selected.map((s, idx) => ({
          rank: idx,
          id: s.entry.candidate.id,
          name: s.entry.candidate.name,
          role: s.role,
          // The evidence the recommendation may rest on — real fields only — and
          // the reasons the ranker actually counted, so the model reasons over the
          // same numbers the engine ordered by instead of over the row's absence.
          evidence: v1Attrs
            ? { ...evidenceSummary(s.entry.candidate.attrs), attributes: attributeSummary(v1Attrs.get(s.entry.candidate.name ?? '') ?? []) }
            : evidenceSummary(s.entry.candidate.attrs),
          why: s.entry.reasons.filter(r => r.contribution > 0).slice(0, 3).map(r => r.detail),
          missing: missingFor(decisionFrame, s.entry),
        }))
      }
      if (situation && v1Attrs) try {
        // A stated hard constraint no candidate carries evidence for is an
        // evidence gap the reply must name — never silently dropped. Same for a
        // stated budget when no row carries a price: "trong tầm giá" is then a
        // guess, and the stream filter appends the honest sentence itself.
        const gaps = hardConstraintGaps(situation.hard, v1Attrs)
        if (gaps.length > 0) (result as Record<string, unknown>)._tappy_hard_gaps = gaps
        const rows = (result as { results?: unknown }).results
        const anyPrice = Array.isArray(rows) && rows.some(row => {
          const x = row as Record<string, unknown>
          return !!(x.price_range_text || x.price_range || x.price_level || typeof x.price === 'number')
        })
        const budgetGap = !!situation.budget && !anyPrice
        if (budgetGap) (result as Record<string, unknown>)._tappy_budget_evidence = false
        const ctx = enrichment.consultativeV1
        if (ctx) { ctx.hardGaps = [...gaps]; ctx.budgetGap = budgetGap }
        console.log(JSON.stringify({ type: 'tappyai_consultative_v1', step: 'attributes', venues_with_attributes: v1Attrs.size, hard: situation.hard, hard_gaps: gaps, budget_gap: budgetGap }))
      } catch (e) { console.error('[consultative-v1] gaps failed:', e) }
      // What the reply may do with this evidence. The OpenStreetMap fallback
      // carries no rating, price, hours or reviews for any row, so a repeat
      // search there cannot help; a Google/Serper result can.
      const providerCanImprove = typeof r.source === 'string' && !/openstreetmap/i.test(r.source)
      const gap = evidenceGap(decisionFrame, ranked.ranked, providerCanImprove)
      ;(result as Record<string, unknown>)._tappy_evidence_gap = gap
      // A recommendation that is possible, or a gap no question can close,
      // leaves no room for a reflex "what kind?" — only a bounded retry does.
      enrichment.setClarificationPolicy(gap.action === 'search_again' ? 'allow' : 'no_reflex')
      console.log(JSON.stringify({ type: 'tappyai_evidence_gap', tool: toolName, ...gap, goal: decisionFrame.goal, criteria: decisionFrame.criteria.map(c => c.key) }))
    }

    // ADR-024: the rows that survive the shortlist, as CANDIDATES. The evidence
    // builder needs `attrs` and `raw` per listing, and the array below holds raw
    // provider rows — so the identity map is rebuilt here rather than re-derived,
    // which would risk a different answer than the one the model was shown.
    const byRaw = new Map<unknown, Candidate>(candidates.map(c => [c.raw, c]))
    let shortlistedCandidates: Candidate[] | null = null

    // Reorder the array the model reads, by candidate identity — never by index,
    // so a normalizer that skipped a nameless entry cannot shift the mapping.
    const order = new Map(ranked.ranked.map((e, i) => [e.candidate.raw, i]))
    // 🚨 Every array a candidate could have come from, not one hardcoded name. `searchProducts`
    // has two paths that collide on a key: when Serper /shopping answers, its structured rows land
    // in `search_results` and there is no `shopping_results` at all. Naming only the latter meant
    // the live shopping path was reordered by nothing.
    const keys = toolName === 'search_places' ? ['results']
      : toolName === 'get_hotel_prices' ? ['search_results']
        : ['shopping_results', 'search_results']
    for (const key of keys) {
      if (!Array.isArray(r[key])) continue
      const rows = r[key] as unknown[]
      const kept = rows.filter(row => order.has(row))
      const untouched = rows.filter(row => !order.has(row))
      const sorted = kept.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))

      // Shopping is trimmed to the decision set; places are left whole (already capped at 8 by
      // the tool, and each row is a genuinely distinct venue). See `shortlistShopping` for why
      // this trims and must never group.
      if (toolName === 'search_products') {
        const { rows: shortlisted, totalFound } = shortlistShopping(sorted, untouched)
        r[key] = shortlisted
        if (totalFound !== null) r._tappy_total_found = totalFound
        shortlistedCandidates = shortlisted.map(row => byRaw.get(row)).filter((c): c is Candidate => !!c)
      } else {
        r[key] = [...sorted, ...untouched]
      }
    }

    return { result: r, pick: derivePick(ranked, needProfile, pickSignals), shortlistedCandidates }
  }

  /**
   * ADR-024 — freeze this turn's shopping facts and carry them forward.
   *
   * Returns the rendered block for the tool result, and persists the object so
   * the NEXT turn reads the same numbers instead of remembering them. Persisting
   * is awaited: a follow-up can arrive seconds later, and a fire-and-forget write
   * on a serverless function is not guaranteed to survive the response.
   *
   * Every failure path returns the block anyway. Turn-1 grounding does not depend
   * on the database being reachable — only the follow-up does, and that degrades
   * to `renderMissingEvidenceBlock()`, which is honest rather than inventive.
   */
  const freezeShoppingEvidence = async (
    result: unknown,
    pick: NonNullable<ReturnType<typeof derivePick>>,
    shortlisted: Candidate[] | null,
  ): Promise<string> => {
    if (!shortlisted || shortlisted.length === 0) return ''
    const totalFound = (result as Record<string, unknown>)?._tappy_total_found
    const evidence = buildDecisionEvidence(
      pick, shortlisted, typeof totalFound === 'number' ? totalFound : null, lastText,
    )
    if (evidenceDb) {
      try {
        await evidenceDb.rpc('decision_evidence_save', { p_id: evidenceId, p_evidence: evidence })
      } catch (e) {
        console.error('[chat] decision evidence save failed (this turn stays grounded):', e)
      }
    }
    return renderDecisionEvidenceBlock(evidence, false)
  }
  /** The Pick for this turn, set by whichever tool produced rankable candidates. */
  let turnPick: ReturnType<typeof derivePick> = null

  // STEP 13: the save_price_watch tool answers in the language of THIS message.
  // That is the documented split — add_user_language_preference.sql states that
  // AI response language "stays auto-detected per-message … and is not stored
  // per-user", while the REST route and the async push read profiles.language.
  // Anything other than English resolves to Vietnamese, preserving today's
  // behaviour for every existing caller.
  const pwLang = normalizePwLang(lang === 'en' ? 'en' : 'vi')

  const role: ModelRole = (planningIntent || hasImage) ? 'planning' : isSimpleQuery(lastText, isFirstReply) ? 'fast' : 'smart'
  console.log(JSON.stringify({ type: 'tappyai_model', model: role, planningIntent }))

  // Truncate history to last 10 messages to control token costs
  const trimmedMessages = messages.length > 10 ? messages.slice(-10) : messages

  // V2 highlighted regression: on a tool-less follow-up ("Giá cả thế nào?",
  // "cụ thể hơn", "chọn giúp tôi"), no PLACE_TOOL runs so bufferMode stays
  // false in streamEnrichment and every `0:` frame streams straight to the
  // client with no strip pass. If the model echoes prior turns' image markdown,
  // `[TAPPY_PLAN]`, `[TAPPY_SHOPPING]`, `[CTA_BUTTONS]`, `[FOLLOWUPS]` from
  // context, the client re-renders the same cards even though the user did not
  // ask for a new search. The prompt-level "do not write these" is not a
  // structural guarantee. Strip those decorations from prior assistant text
  // BEFORE the model sees them — the model cannot echo what it cannot read.
  // Applied ONLY to the messages fed to the LLM: the memory extractor below
  // still uses raw `trimmedMessages` because it summarizes what happened.
  const modelMessages = compactHistory(trimmedMessages.map((m) => {
    if (m.role !== 'assistant') return m
    if (typeof m.content === 'string') {
      return { ...m, content: sanitizePriorAssistantContent(m.content) }
    }
    if (Array.isArray(m.content)) {
      const parts = m.content.map((part) => {
        if (part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
          const p = part as { type: 'text'; text: string }
          return { ...p, text: sanitizePriorAssistantContent(p.text) }
        }
        return part
      })
      return { ...m, content: parts as typeof m.content }
    }
    return m
  }))

  // Split so the provider can cache the invariant rulebook and leave everything
  // request-shaped (clock, language, memory, prefs, budget, GPS, style) after
  // the breakpoint. The chitchat path has no rulebook to share — its prompt is
  // ~300 tokens, far below any provider's minimum cacheable size — so it passes
  // everything as `system` and shares nothing.
  // A bare acknowledgement takes the same no-tool path as chitchat: there is
  // nothing to search for, and the previous turn already produced the result the
  // user is agreeing to. Cheaper AND the right behaviour — a confirmation must
  // never restart a search.
  // A clip question is a place question by construction — the button exists only
  // on an item with a place — so it is never a no-tool turn even when the short
  // bridge text alone would have read as chitchat.
  const noToolTurn = !clipContext && (intent === 'chitchat' || decisionStage === 'confirmation')
  // The ranking instruction is only carried on turns that can actually produce a
  // ranked result — Places and Hotel are the two domains with structured
  // candidate attributes today. A weather or gold lookup pays nothing for it.
  // A planning turn runs the place searches the ranker orders, so it carries the
  // ranking instruction even when the multi-activity wording resolved to no
  // single domain — measured 2026-09-14: "ăn chơi nhảy múa" → `domain: null`.
  const isDecisionDomain = needProfile.domain === 'places'
    || needProfile.domain === 'hotel'
    || needProfile.domain === 'shopping'
    || planningIntent !== null

  // The transport-mode stage is decided HERE, deterministically, not by the
  // model noticing it should ask. resolveTripContext folds the history, so the
  // question is asked exactly once and never on a non-trip turn.
  const tripContext = resolveTripContext(messages)

  // Which client is asking. The web chat and the Android app render the decision
  // as a card (`x-tappy-surface: web` / `android`, see decisionSurface.ts), so
  // their reply is told to stop repeating what the card shows. A client that
  // sends no header - iOS, an older Android build, a script - keeps today's
  // prose (and, with MEDIA_PLACEMENT_V2, the G3 block placement).
  const surfaceHeader = req.headers.get('x-tappy-surface')
  const rendersDecisionCard = rendersDecisionCardFor(surfaceHeader)
  // CommerceContext for the CCP seam: the surface header is the only platform signal the route
  // has, and the response language is what the merchant page should open in. No user identifier.
  const commercePlatform: 'web' | 'android' | 'ios' | undefined =
    surfaceHeader === 'web' || surfaceHeader === 'android' || surfaceHeader === 'ios' ? surfaceHeader : undefined
  const commerceLocale: 'vi' | 'en' | undefined = lang === 'en' ? 'en' : lang === 'vi' ? 'vi' : undefined
  // The stream filter reads this to decide whether the per-place photo/link block
  // still belongs in the text: with a card, it is the same content twice.
  enrichment.setRendersDecisionCard(rendersDecisionCard)

  /**
   * Consultative V1 — the prompt block and the follow-up references.
   *
   * Only on a decision-domain tool turn. The references are resolved against
   * the venues the PREVIOUS reply named (its bolded names — the only durable
   * record of a place turn); a fact the carried prose lacks is asked for as a
   * real `search_places` call BY NAME, one venue, made by the model on this
   * same single stream (the architecture lock forbids a forced tool choice and
   * a second model call, see consultativeArchitecture.test.ts), and reported
   * as `named_refetch` when it happens. The stream filter's search-claim guard
   * removes any "I have checked" claim on a turn where no tool ran at all.
   */
  // Active on every turn that is a decision — by need-profile domain, by the
  // decision frame's goal, or because the previous reply named venues the user
  // is now asking about. Measured 2026-09-18 on the CONSULTATIVE-40 pass: "Cả
  // nhà 6 người … ăn trưa … Phú Nhuận", "Đi date với gấu …", "Sinh nhật sếp,
  // tiếp khách 8 người …" all resolve to `domain: null` (no dish word), and the
  // follow-up "quán này mở mấy giờ?" to `forcedTool: web_search` — none was a
  // decision by `isDecisionDomain` alone, and V1 silently skipped them.
  // …and "Đi date với gấu tối nay, chỗ nào lãng mạn yên tĩnh ở Quận 3?" reached
  // the model as `goal: inform, domains: [], forcedTool: web_search`. The
  // situation frame itself knows better: a stated who / occasion / mood / hard
  // constraint / budget is a decision by definition.
  const v1PriorVenues = priorVenuesIn(lastAssistantText)
  const frameSaysDecision = !!situation && (
    situation.who !== null || situation.occasion !== null || situation.mood !== null || situation.hard.length > 0 || situation.budget !== null
  )
  const v1Active = !!situation && !noToolTurn && (
    isDecisionDomain
    || decisionFrame.goal === 'recommend' || decisionFrame.goal === 'compare' || decisionFrame.goal === 'decide' || decisionFrame.goal === 'plan'
    || forcedTool === 'search_places'
    || frameSaysDecision
    || v1PriorVenues.length > 0
  )
  /** Cost optimization item 8: a follow-up fully answerable from the carried facts, or null. */
  let cannedFollowUp: string | null = null
  const v1Block = (() => {
    if (!situation || !v1Active) return ''
    const priorVenues = v1PriorVenues
    const refs = resolveReferences(lastText, priorVenues)
    const referenced = referencedVenues(refs)
    const facts = factsAsked(lastText)
    const refetch = referenced.filter(v => facts.some(f => !priorTextStates(lastAssistantText, v, f, priorVenues)))
    if (refetch.length === 0 && !clipContext) {
      cannedFollowUp = cannedCarriedFact(facts, referenced, carriedFacts(lastAssistantText, priorVenues), lang)
    }
    console.log(JSON.stringify({
      type: 'tappyai_consultative_v1', step: 'frame',
      who: situation.who, occasion: situation.occasion, time: situation.time, mood: situation.mood, hard: situation.hard,
      assumptions: situation.assumptions.length, confidence: situation.confidence,
      prior_venues: priorVenues.length, referenced: referenced.length, facts, named_refetch: refetch.length,
    }))
    enrichment.setConsultativeV1({
      on: true, rendersCard: rendersDecisionCard, namedRefetch: refetch.map(v => v.name),
      carried: carriedFacts(lastAssistantText, priorVenues), hardGaps: [], budgetGap: false,
    })
    const refetchLines = refetch.length > 0
      ? `\n- THIEU DU LIEU: user hoi ${facts.join('/')} cua ${refetch.map(v => `"${v.name}"`).join(', ')} ma luot truoc chua co. GOI search_places DUNG MOT LAN voi query = ten quan do (location = thanh pho da biet) roi tra loi tu dong ket qua co ten khop. Neu khong co dong nao khop: noi "minh khong tim thay", KHONG bia.`
      : ''
    return buildConsultativeV1Block({ frame: situation, hardGaps: [], rendersCard: rendersDecisionCard, lang, now: new Date() })
      + renderReferencedBlock(referenced, []) + refetchLines
  })()

  const consultativeBlock = [
    // Explore clip → "this place" is the clip's place. Fenced row values plus the
    // rule that a clip address stands in for the missing GPS/city. Absent on
    // every turn that did not come from the button, so generic chat is unchanged.
    clipContext ? buildExploreClipBlock(clipContext, lang) : '',
    // The frame first: what the user is trying to do, what to search for and
    // what evidence settles it — read before the ranking/pick instructions that
    // explain how to present the result.
    buildDecisionFrameBlock(decisionFrame, needProfile),
    isDecisionDomain ? buildRankingInstructionBlock() : '',
    isDecisionDomain && rendersDecisionCard ? buildRenderedDecisionBlock() : '',
    // Shopping evidence carries price/store/rating and nothing else, so the
    // model must be told what it may NOT assert — measured live 2026-08-17
    // asserting weight and battery that no candidate supplied.
    needProfile.domain === 'shopping' ? buildShoppingGroundingBlock() : '',
    // Phase 4 — tells the model how to read `_tappy_synthesis`: give general
    // education freely, but ground every listing-specific claim, and present the
    // grouped entities as a decision rather than a catalogue.
    needProfile.domain === 'shopping' ? buildSynthesisInstructionBlock() : '',
    // ADR-024. The follow-up turn makes no tool call, so without this the
    // listing table is simply absent and the model answers from its own prose —
    // measured on 7deee03 as "khoảng 28-29 triệu" against an actual 24,490,000.
    // Either the real numbers go in, or an explicit instruction not to invent
    // them does; there is no third branch that leaves the model guessing.
    priorEvidence ? renderDecisionEvidenceBlock(priorEvidence, true) : '',
    priorEvidenceMissing ? renderMissingEvidenceBlock() : '',
    // Consultative V1: situation + rule overrides + follow-up references. Empty with the flag OFF.
    v1Block,
    tripContext.shouldAskTransportMode ? buildTransportModeBlock() : '',
    // Movie/show recommendation turn: the place tool is already dropped above, so
    // the model answers from film knowledge. This keeps that answer grounded —
    // recommend a few titles with why, never invent current showtimes/platform/price.
    movieRecommend ? `\n\n===== GOI Y PHIM (KHONG PHAI TIM RAP) =====
Nguoi dung muon duoc GOI Y PHIM/SHOW de xem, KHONG phai tim rap hay lich chieu.
- Goi y 2-3 phim hop yeu cau (the loai/tone, vi sao hop "nhe nhang" hoac tam trang ho muon), tu kien thuc dien anh chung cua ban.
- Moi phim: ten + 1 dong VI SAO hop. Ngan gon, khong liet ke dai dong.
- KHONG khang dinh lich chieu, rap dang chieu, gia ve, nen tang xem (Netflix/Disney+/...), hay danh gia HIEN TAI — tru khi co du lieu that duoc lay ve. Neu khong chac ho xem duoc o dau, noi that va nhac ho tu kiem tra.
- Chi khi nguoi dung hoi RO "xem o dau / rap gan / lich chieu / gia ve" moi can tim dia diem.
=====================================` : '',
  ].filter(Boolean).join('')

  const built = noToolTurn ? null : buildSystem(
    budget, locationIntent, isFirstReply, memoryBlock, lang, prefBlock, userLocation, planningIntent, hasImage, decisionStage,
    consultativeBlock || undefined,
    planning,
  )
  const systemShared = built?.shared
  const systemPrompt = (built ? built.dynamic : buildSystemSimple(lang, memoryBlock)) + styleBlock

  // ── Model timing instrumentation ────────────────────────────────────────
  //
  // Production measurement on 7e15dfe found authenticated TTFB ranging 1.8s to
  // 13.7s on identical request shapes, and independent probes put every
  // application stage well under it: bare lambda ~294ms, one Supabase
  // round-trip ~5ms, the whole authenticated pre-model block ~640ms. That
  // located the variance in "model request sent → first token", but could not
  // separate the causes INSIDE that interval from the outside.
  //
  // These two marks close that gap. They are diagnostic only — nothing branches
  // on them — and they extend the existing tappyai_usage record rather than
  // starting a second telemetry channel.
  const preModelMs = Date.now() - startTime
  /** Wall-clock of the first token, or null if the stream produced none. */
  let firstTokenAt: number | null = null
  // ── Phase-0 additions ───────────────────────────────────────────────────────
  // Diagnostic marks only; nothing branches on them and they extend the same
  // tappyai_usage record. A tool turn is ≥2 provider round-trips inside one
  // stream: firstStepFinishMs closes the tool-planning step and toolMs is the
  // summed tool execute() time, which together split the tool-turn gap into
  // model-vs-tool. modelFinishAt is the generation-complete vantage (T9) the
  // model-side stage fields are measured from even though the record now ships
  // at final emit (so a buffered turn's enrichment tail is included in total).
  /** t0 → first step (tool-planning round-trip) finished. */
  let firstStepFinishMs: number | null = null
  /** Summed wall-clock inside tool execute()s. 0 when no tool ran. */
  let toolMs = 0
  /** Times each tool's execute() in place — one wrap point, no per-tool edits. */
  const timeTools = <T extends Record<string, unknown>>(tools: T): T => {
    for (const t of Object.values(tools)) {
      const def = t as { execute?: (...a: unknown[]) => Promise<unknown> }
      const orig = def.execute
      if (typeof orig === 'function') {
        def.execute = async (...a: unknown[]) => {
          const started = Date.now()
          try { return await orig(...a) } finally { toolMs += Date.now() - started }
        }
      }
    }
    return tools
  }
  /** Set once at onFinish: absolute ms of model generation complete (T9). */
  let modelFinishAt: number | null = null
  /**
   * Planning contract, measured: whether a turn that ran in planning mode
   * actually produced the `[TAPPY_PLAN]` block. Null on non-planning turns.
   * The route cannot safely force the block (one model call, streamed), so the
   * gap is made visible instead of silent — see promptBuilder's planning rules.
   */
  let planEmitted: boolean | null = null
  /** onFinish accounting, captured synchronously so the flush-time record can ship it. */
  /** Audit cost sink: bytes of tool results the model read this turn. */
  let auditToolResultChars = 0
  let usageAcct: {
    finishReason: string
    promptTokens: number | null; completionTokens: number | null; totalTokens: number | null
    cacheReadTokens: number | null; cacheCreationTokens: number | null
    llmCalls: number | null; toolCalls: number
  } | null = null

  /**
   * This turn's Google Places allowance.
   *
   * `maxSteps` above is why one is needed: the model may take up to eight tool steps, and each may
   * call `search_places` with different words. Different words are a different cache key, so the
   * cache cannot collapse them — measured, one Food consultation spent SEVEN SearchText calls
   * against a 100/day project quota.
   *
   * A planning turn asks genuinely different questions (eat / see / stay) and gets three; every
   * other turn is answering one question and gets one. Request-scoped, exactly like the enrichment
   * collector, so one conversation can never spend another's allowance.
   */
  const placesBudget = createPlacesBudget(planningIntent ? PLACES_BUDGET_PLANNING : PLACES_BUDGET_DEFAULT)

  /**
   * NO-MODEL TURNS (cost optimization item 8, 2026-09-18). A pure greeting / thanks /
   * acknowledgement, or a follow-up that asks one concrete fact (hours, phone, address) the
   * previous reply already stated about one referenced venue, is answered deterministically in
   * the same data-stream shape the clients parse. Quota was spent above exactly as before; the
   * usage line records `llmCalls: 0` so the saving is visible. Everything else — including a
   * fact the prior prose lacks — still reaches the model, which may re-search by name.
   */
  const canned = (intent === 'chitchat' ? cannedChitchat(lastText, lang) : null) ?? cannedFollowUp
  if (canned) {
    const kind = intent === 'chitchat' ? 'chitchat' : 'carried_fact'
    console.log(JSON.stringify({ type: 'tappyai_canned_reply', kind, elapsedMs: Date.now() - startTime }))
    const auditFile = process.env.AUDIT_USAGE_LOG_FILE
    if (auditFile) {
      try {
        appendFileSync(auditFile, JSON.stringify({
          turn: auditTurn, at: new Date().toISOString(), type: 'tappyai_usage_canned', intent, finishReason: 'canned',
          promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, llmCalls: 0, memoryExtract: 0, toolCalls: 0,
          elapsedMs: Date.now() - startTime, serper: serperDelta(serperAtStart), canned: kind,
          flags: { consultativeV1: consultativeV1Enabled(), v1Active }, sections: { sharedChars: 0, dynamicChars: 0, consultativeChars: 0, v1Chars: 0, memoryChars: 0, prefChars: 0, historyChars: 0, lastUserChars: lastText.length, toolResultChars: 0 },
        }) + '\n')
      } catch { /* audit only */ }
    }
    return cannedDataStreamResponse(canned, { 'X-Decision-Evidence-Id': evidenceId })
  }

  let result
  try {
  // Provider-specific optimizations (e.g. prompt caching of this large system
  // prompt) are applied inside the active provider adapter — not here.
  result = AI.stream({
    role,
    // First text delta only. Tool-call and reasoning chunks are deliberately
    // NOT counted: a turn that calls a tool emits its first text long after the
    // model actually started answering, and conflating the two would report a
    // tool round-trip as model latency — the exact confusion this exists to end.
    onChunk: ({ chunk }) => {
      if (firstTokenAt === null && chunk.type === 'text-delta') firstTokenAt = Date.now()
    },
    // Closes the first step (the tool-planning round-trip on a tool turn; the
    // only step on a chitchat turn). Diagnostic — nothing branches on it.
    onStepFinish: () => {
      if (firstStepFinishMs === null) firstStepFinishMs = Date.now() - startTime
    },
    // Cancel the upstream generation (and skip the onFinish memory-extraction
    // call) if the client disconnects — otherwise it runs to maxDuration billing
    // tokens for a response nobody is receiving.
    abortSignal: req.signal,
    systemShared,
    system: systemPrompt,
    messages: modelMessages,
    // Completion cap. Place/product replies previously hit finishReason:"length"
    // at 2048 (deterministic image/review/order URLs are token-heavy). Those are
    // now injected by streamEnrichment instead of written by the LLM (see prompt),
    // so actual output is smaller — this raised ceiling is headroom, not the norm.
    // Completion cap (cost optimization item 7, 2026-09-18): measured on 38 audit turns with
    // CONSULTATIVE_V1 on, the longest reply was 821 completion tokens (a two-step tool turn
    // with [CTA_BUTTONS] + [FOLLOWUPS]); 2048 is 2.5× that. Planning stays at 4096 (a
    // [TAPPY_PLAN] block is long by design) and image turns at 1024. Output is billed as
    // generated, so this changes no cost on a normal reply — it bounds a runaway one.
    maxTokens: noToolTurn ? 300 : planningIntent ? 4096 : hasImage ? 1024 : 2048,
    maxSteps: noToolTurn ? 1 : planningIntent ? 8 : hasImage ? 3 : 5,
    // REMOVED (C2): a `prepareStep` block that forced tool choice per step. It
    // never ran — ai@4.3.19 destructures experimental_prepareStep in
    // generateText only (bundle line 4177); streamText (line 5193) takes
    // toolChoice and maxSteps but never prepareStep, and 4177 is the option's
    // only occurrence. Production has always run at the SDK default,
    // toolChoice:'auto', and the baseline confirmed it behaviourally.
    //
    // This is a SAFETY cleanup, not a saving: behaviour is unchanged. It matters
    // because the deleted code carried an @ts-ignore asserting the option works
    // at runtime, and AI SDK 5 DOES support prepareStep on streamText — an
    // upgrade would have silently switched forcing on, raising cost and breaking
    // the clarification behaviour this phase builds on `auto`.
    //
    // No-tool turns get NO tool definitions. Measured 2026-08-10: declaring them
    // cost ~2,400 of the path's ~2,657 input tokens, and none of it was
    // reachable — a no-tool turn runs with maxSteps:1, so a tool call has no
    // second step to answer in and the reply comes back EMPTY.
    //
    // This fragments no cache. The chitchat prefix (tools + the ~300-token
    // simple prompt = ~2,657) sits under Haiku 4.5's 4,096-token minimum
    // cacheable size, so it was never cached to begin with — measured
    // cacheCreationTokens:0 / cacheReadTokens:0 on every chitchat turn in both
    // the baseline and the post-B1 run. The tool path keeps its own lineage.
    tools: noToolTurn ? undefined : timeTools({
      // A movie/show RECOMMENDATION turn drops the place search entirely, so the
      // model can't answer "recommend a movie" with a list of cinemas — it
      // recommends titles from film knowledge instead (see detectMovieRecommendationIntent).
      ...(movieRecommend ? {} : { search_places: tool({
        description: 'Tim dia diem, nha hang, cafe, spa, khach san, diem tham quan/du lich (thang canh, bao tang, cong vien, danh lam), benh vien, giai tri (rap phim, karaoke, gym, bar...) tai Viet Nam. Voi quan an/nha hang/cafe/spa/giai tri se kem gia mon/dich vu/ve tham khao tu Google Search (Serper)',
        parameters: z.object({
          query: z.string().describe('Tu khoa tim kiem (vd: pho ngon, cafe dep, spa tot, diem tham quan)'),
          location: z.string().optional().describe('Khu vuc (vd: Ha Noi, Quan 1 Ho Chi Minh, Da Nang)'),
          // 'mall' exists because without it the model had no way to say "shopping
          // centre" and picked 'attraction' instead - measured on "Trung tam mua sam
          // lon Sai Gon", which then searched tourist attractions and produced a reply
          // that told the user its own results were wrong.
          type: z.enum(['restaurant', 'cafe', 'spa', 'hotel', 'bar', 'gym', 'cinema', 'attraction', 'mall']).optional()
        }),
        execute: async ({ query, location: modelLocation, type }) => {
          // Explore clip: when the model names no area, the clip's own address is
          // the area — the author wrote it, and `searchPlaces` already knows how to
          // read a city out of free text and how to refuse when it cannot. A
          // location the model DID name still wins; this only fills a blank.
          const location = modelLocation ?? exploreClipLocationHint(clipContext)
          console.log(JSON.stringify({ type: 'tappyai_tool_called', tool: 'search_places', query, location, placeType: type, hasLocationBias: !!userLocation, locationFromClip: modelLocation === undefined && location !== undefined }))
          // The editorial supplement runs beside the live search, not after it.
          const [placesResult, editorial] = await Promise.all([searchPlaces(query, location, type, lang, userLocation, placesBudget), travelEditorialFor(location)])
          let r: unknown = placesResult
          // Explore clip: "this place" is ONE venue. The tool just returned the
          // 8-10 places around the address — as it must for discovery — so the
          // rows are narrowed HERE, deterministically, to the one(s) that carry
          // the clip's name, before ranking or cards ever see them. Skipped when
          // the user asked for more/other/similar places, and absent entirely on
          // every turn without a clip (see `exploreClipTarget.ts`).
          let clipTarget: ClipTargetStatus | null = null
          if (clipContext && !asksForAlternatives(lastText)) {
            const narrowed = applyClipTarget(r, clipContext, lang)
            r = narrowed.result
            clipTarget = narrowed.status
            console.log(JSON.stringify({ type: 'tappyai_tool_called', tool: 'search_places', step: 'clip_target', status: clipTarget, kept: narrowed.result.count }))
            // The Places verdict, in the clip-evidence vocabulary — the one place the
            // candidate can become `resolved`. Today it feeds the product metric below
            // and nothing else; a future persisted result would be written from here.
            const venue = withPlacesVerification(clipContext.venue, {
              status: narrowed.status,
              results: narrowed.result.results as Record<string, unknown>[],
              provider: typeof narrowed.result.source === 'string' ? narrowed.result.source : null,
            })
            // `ask_tappy_place` · phase `target`: what the CTA actually resolved to. The
            // click itself is tracked on the client (phase `click`); this row is the
            // server's answer, joined by review_id. Same taxonomy and same table as
            // `/api/track`; fire-and-forget, and nothing here may fail the turn.
            try {
              void createAdminClient()
                .from('user_events')
                .upsert({
                  event_id: randomUUID(),
                  schema_version: 1,
                  user_id: clipUserId,
                  anon_id: null,
                  ...askTappyPlaceEvent({ phase: 'target', reviewId: clipContext.reviewId, surface: 'chat_server', status: clipTargetMetric(venue), hasAddress: !!clipContext.placeAddress }),
                  is_unknown_event: false,
                  platform: 'web',
                  created_at: new Date().toISOString(),
                }, { onConflict: 'event_id', ignoreDuplicates: true })
                .then(() => undefined, () => undefined)
            } catch { /* analytics only */ }
          } else if (clipContext) {
            // The user asked for OTHER places. Still Explore-scoped and still
            // deterministic: the target is not listed as an alternative to itself,
            // the list is capped at what was asked for, and the result says these
            // are alternatives TO the clip's venue — which stays the subject, since
            // the next turn narrows to it again (see `exploreClipTarget.ts`).
            const alt = applyClipAlternatives(r, clipContext, lang, lastText)
            r = alt.result
            console.log(JSON.stringify({ type: 'tappyai_tool_called', tool: 'search_places', step: 'clip_alternatives', requested: alt.requested, kept: alt.kept }))
          }
          const filtered = budget ? applyBudgetFilter(r, budget, query) : r
          // Deterministic ranking runs BEFORE the model sees the result, so the
          // order it reads is already the order that fits this user.
          //
          // An AMBIGUOUS clip target is not ranked: a Pick would tell the model to
          // argue for one branch when the honest move is to ask which branch. A
          // resolved target ranks as normal — one candidate yields no Pick anyway.
          const { result, pick } = clipTarget === 'ambiguous'
            ? { result: filtered, pick: null }
            : rankForModel('search_places', filtered)
          if (pick) turnPick = pick
          // CCP (Phase 6, owner decision P6-B): Commerce Links ride the ranked rows as
          // `commerce_links`, read by buildActions below and carved from the model by forModel.
          // Identity-preserving and a no-op while CCP_ENABLED is false.
          await attachCommerceLinks('search_places', result, { location, query, platform: commercePlatform, locale: commerceLocale, userText: lastText, userTexts: recentUserTexts })
          // Unified recommendation architecture — canonical entities and their
          // recommendations are built on EVERY place turn, whether or not the
          // `[TAPPY_PLACES]` block is emitted. Building unconditionally is what
          // keeps the data layer exercised (and its tests honest) while the
          // emission flag stays off; the collector holds them until the stream
          // filter has photos to fold in.
          turnPlaceLocation = location
          enrichment.setPlacesRecommendations(
            placeRecommendations(result, location, pickContext(pick)),
            producerSubject('search_places', (result as Record<string, unknown>)._tappy_place_domain),
          )
          // The map destination the provider itself returned for this search.
          const mapsUrl = (result as Record<string, unknown>).google_maps_search
            ?? (result as Record<string, unknown>).search_url
          enrichment.setPlacesMapsUrl(typeof mapsUrl === 'string' ? mapsUrl : undefined)
          // The model reads the decision set only (cost optimization item 4); the card above
          // was built from the full result and is unaffected. Trimmed AFTER `forModel` carved the
          // enrichment (photos, links) off the FULL row set — trimming first starved the collector
          // of photos and the late resolver bought five /images calls per turn (measured). See
          // `modelPayload.ts`.
          return trimPlacesForModel(forModel('search_places', withTravelEditorial(pick
            ? { ...(result as Record<string, unknown>), _tappy_ranking: buildPickPayload(pick) }
            : result, editorial)))
        }
      }) }),
      get_news: tool({
        description: 'Lay tin tuc moi nhat tu VnExpress, Tuoi Tre, Dan Tri',
        parameters: z.object({ query: z.string().describe('Tu khoa tin tuc can tim') }),
        execute: async ({ query }) => getNews(query, lang)
      }),
      ...(locationIntent !== 'offline' ? { search_products: tool({
        description: 'Tim san pham/shop mua sam: gia tren Shopee/Tiki/Lazada, website rieng cua shop, dia chi cua hang vat ly (neu co), Facebook cua shop - tat ca tu Google Search (Serper)',
        parameters: z.object({ query: z.string().describe('Ten san pham can tim mua') }),
        execute: async ({ query }) => {
          const r = await searchProducts(query, lang)
          const filtered = budget ? applyBudgetFilter(r, budget, query) : r
          const { result, pick, shortlistedCandidates } = rankForModel('search_products', filtered)
          if (pick) turnPick = pick
          await attachCommerceLinks('search_products', result, { location: needProfile.location.text ?? undefined, query, platform: commercePlatform, locale: commerceLocale, userText: lastText, userTexts: recentUserTexts })
          enrichment.setPlacesRecommendations(productRecommendations(result), producerSubject('search_products'))
          /**
           * THE DECISION SURFACE DOES NOT DEPEND ON A WINNER EXISTING.
           *
           * This used to `return` here when `derivePick` declined, before
           * evidence, synthesis or the marker were built - so a turn that ranked
           * 31 laptops and shortlisted 6 of them reached the user as unstructured
           * prose with no card at all. Measured on localhost three times running:
           * every live shopping turn produced `_tappy_total_found` (proving the
           * ranker HAD ranked) and no `_tappy_ranking`, no `_tappy_synthesis` and
           * no `[TAPPY_SHOPPING]` marker.
           *
           * `derivePick` declining is not "nothing to show". It means no option
           * won by enough to crown one - a tie, or a need too vague to decide
           * FOR. The ranker's order is still the answer to "which of these should
           * I look at first", and `buildShoppingSynthesis` already accepts a null
           * pick and returns `recommendation: null`, which the card renders as a
           * shortlist without a winner.
           *
           * What stays gated on a real Pick: `_tappy_ranking`, the ADR-024
           * evidence freeze (it is built FROM the pick), and `recommended: true`
           * on any entity. Nothing here manufactures a winner.
           */
          const evidenceBlock = pick ? await freezeShoppingEvidence(result, pick, shortlistedCandidates) : ''
          // Phase 4 — the grounded, GROUPED decision the model verbalises instead
          // of dumping rows: entities (one per configuration) with their offers,
          // a recommendation from the same Pick, and how each group compares to
          // what the user asked. No new model call — dynamic tool-result content
          // on the single AI.stream(), same as _tappy_ranking/_tappy_evidence.
          const shoppingSynthesis = shortlistedCandidates
            ? buildShoppingSynthesis(shortlistedCandidates, pick, lastText)
            : null
          const synthesis = shoppingSynthesis ? buildSynthesisPayload(shoppingSynthesis) : null
          // Phase 9 — the SAME grouping/recommendation, projected for the chat UI
          // and delivered as a TEXT MARKER appended to the reply (persists with the
          // message; a tool-result field does not survive reload). No image, no new
          // grouping, and the model never sees it — see synthesisView.ts /
          // streamEnrichment. It adds only each offer's own link/price.
          const synthesisView = shoppingSynthesis ? buildSynthesisView(shoppingSynthesis) : null
          if (synthesisView) enrichment.setShoppingMarker(renderShoppingMarker(synthesisView))
          return forModel('search_products', {
            ...(result as Record<string, unknown>),
            ...(pick ? { _tappy_ranking: buildPickPayload(pick) } : {}),
            // The exact figures, plus what the evidence does NOT establish. The
            // rows above carry the same numbers, but silently: a listing with no
            // `ram_gb` simply has no key, and that silence is what production
            // filled in with "32GB/512GB".
            ...(evidenceBlock ? { _tappy_evidence: evidenceBlock } : {}),
            ...(synthesis ? { _tappy_synthesis: synthesis } : {}),
          })
        }
      }) } : {}),
      web_search: tool({
        description: 'Tim kiem tong quat tren internet de lay thong tin moi nhat (ty gia, gia xang, su kien, kien thuc can xac thuc...) khi cac tool khac khong phu hop',
        parameters: z.object({ query: z.string().describe('Tu khoa can tim kiem (vd: ty gia USD hom nay)') }),
        execute: async ({ query }) => {
          // A travel turn that reaches for the general search still gets the editorial supplement.
          const [r, editorial] = await Promise.all([webSearch(query, lang), travelEditorialFor(null)])
          // Completion Pass (14 Sep 2026): an EVENT question is answered here, not by the places
          // tool — Ticketbox listings are discovered and validated by CCP and projected as
          // `event_links` (when CCP is on); the result is untouched otherwise.
          await attachCommerceLinks('web_search', r, { query, location: needProfile.location.text ?? undefined, platform: commercePlatform, locale: commerceLocale, userText: lastText, userTexts: recentUserTexts })
          return withTravelEditorial(r, editorial)
        }
      }),
      get_weather: tool({
        description: 'Lay thong tin thoi tiet hien tai va du bao hom nay (nhiet do, tinh trang troi, do am, gio) cho mot dia diem tai Viet Nam, du lieu realtime tu wttr.in',
        parameters: z.object({ location: z.string().describe('Ten thanh pho/tinh can xem thoi tiet (vd: Ha Noi, Da Nang, TP HCM)') }),
        execute: async ({ location }) => getWeather(location, lang)
      }),
      get_gold_price: tool({
        description: 'Lay gia vang SJC, PNJ, DOJI, vang the gioi (XAU/USD) realtime, cap nhat moi 5 phut tu vang.today',
        parameters: z.object({ query: z.string().optional().describe('Loai vang user hoi, vd: SJC, PNJ, vang the gioi (khong bat buoc)') }),
        execute: async ({ query }) => getGoldPrice(query || '', lang)
      }),
      get_flight_prices: tool({
        description: 'Tim gia ve may bay re gan nhat giua 2 thanh pho/san bay, du lieu tu Travelpayouts (Aviasales), kem link dat ve theo dung chang/ngay',
        parameters: z.object({
          origin: z.string().describe('Diem di (ten thanh pho hoac ma san bay IATA, vd: Ha Noi, HAN)'),
          destination: z.string().describe('Diem den (ten thanh pho hoac ma san bay IATA, vd: TP HCM, SGN)'),
          departDate: z.string().optional().describe('Ngay di dang YYYY-MM-DD neu user noi ro (khong bat buoc)'),
          returnDate: z.string().optional().describe('Ngay ve dang YYYY-MM-DD neu user noi ro (khong bat buoc)'),
          passengers: z.number().int().min(1).max(9).optional().describe('So hanh khach nguoi lon neu user noi ro (khong bat buoc)'),
        }),
        execute: async ({ origin, destination, departDate, returnDate, passengers }) => {
          const r = await getFlightPrices(origin, destination, lang, departDate)
          const filtered = budget ? applyBudgetFilter(r, budget, 've may bay') : r
          // Completion Pass (14 Sep 2026): the booking links are CCP-resolved when CCP is on
          // (Trip.com / Traveloka dated fare lists, airline entry pages); untouched otherwise.
          await attachCommerceLinks('get_flight_prices', filtered, { origin, destination, departDate, returnDate, passengers, platform: commercePlatform, locale: commerceLocale, userText: lastText, userTexts: recentUserTexts })
          return filtered
        }
      }),
      get_hotel_prices: tool({
        description: 'Tim gia phong khach san/resort tai mot dia diem, ket hop tim kiem web (Booking.com/Agoda) va danh sach khach san tu OpenStreetMap'
          + (budget ? `. BUDGET FILTER: Chi duoc de cap khach san co gia duoi ${budget.max.toLocaleString('vi-VN')} VND. KHONG duoc de cap: Pullman, Marriott, Hilton, Sheraton, Intercontinental, Sofitel, Novotel, Melia, Hyatt, Imperial, hay bat ky khach san 4-5 sao nao (gia > 1.500.000 VND/dem). Chi lay tu search results, khong them tu kien thuc co san.` : ''),
        parameters: z.object({
          location: z.string().describe('Dia diem/thanh pho can tim khach san (vd: Da Nang, Phu Quoc, Ha Noi)'),
          checkIn: z.string().optional().describe('Ngay check-in dang YYYY-MM-DD (khong bat buoc)'),
          checkOut: z.string().optional().describe('Ngay check-out dang YYYY-MM-DD (khong bat buoc)'),
        }),
        execute: async ({ location, checkIn, checkOut }) => {
          const [r, editorial] = await Promise.all([getHotelPrices(location, checkIn, checkOut, budget?.max, lang), travelEditorialFor(location)])
          const filtered = budget ? applyBudgetFilter(r, budget, 'khach san') : r
          const { result, pick } = rankForModel('get_hotel_prices', filtered)
          if (pick) turnPick = pick
          turnPlaceLocation = location
          await attachCommerceLinks('get_hotel_prices', result, { location, checkIn, checkOut, platform: commercePlatform, locale: commerceLocale, userText: lastText, userTexts: recentUserTexts })
          enrichment.setPlacesRecommendations(stayRecommendations(result, pickContext(pick)), producerSubject('get_hotel_prices'))
          return forModel('get_hotel_prices', withTravelEditorial(pick
            ? { ...(result as Record<string, unknown>), _tappy_ranking: buildPickPayload(pick) }
            : result, editorial))
        }
      }),
      get_transport_options: tool({
        description: 'Tim phuong an di chuyen: ve xe khach/tau hoa giua 2 tinh/thanh pho (tim kiem web, kem link dat ve cu the), hoac uoc tinh khoang cach + gia taxi/xe cong nghe (Grab/Be/Xanh SM) cho di chuyen trong thanh pho/quang duong ngan',
        parameters: z.object({
          origin: z.string().describe('Diem di (ten tinh/thanh pho hoac dia diem cu the)'),
          destination: z.string().describe('Diem den (ten tinh/thanh pho hoac dia diem cu the)'),
          mode: z.enum(['intercity', 'taxi']).optional().describe('"intercity" cho xe khach/tau giua 2 tinh thanh, "taxi" cho di chuyen trong thanh pho/quang duong ngan bang taxi/xe cong nghe. Bo trong neu khong ro.'),
          date: z.string().optional().describe('Ngay di dang YYYY-MM-DD neu user noi ro (chi cho xe khach/tau, khong bat buoc)'),
        }),
        execute: async ({ origin, destination, mode, date }) => {
          const [r, editorial] = await Promise.all([getTransportOptions(origin, destination, mode === 'taxi' ? 'taxi' : undefined, lang), travelEditorialFor(destination)])
          // Completion Pass (14 Sep 2026): the Vexere link is CCP-resolved (route page + date) when CCP is on.
          await attachCommerceLinks('get_transport_options', r, { origin, destination, departDate: date, transportMode: mode === 'taxi' ? 'taxi' : 'intercity', platform: commercePlatform, locale: commerceLocale, userText: lastText, userTexts: recentUserTexts })
          return withTravelEditorial(r, editorial)
        }
      }),
      ...(authedUserId ? {
        save_price_watch: tool({
          description: 'Lưu theo dõi giá sản phẩm để thông báo khi giá đạt mức mong muốn. Dùng khi user nói "theo dõi giá", "báo mình khi giá xuống", "alert giá", "Tappy theo dõi giá X khi dưới Y"',
          parameters: z.object({
            product_name: z.string().describe('Tên sản phẩm cần theo dõi, ví dụ: AirPods Pro, Samsung Galaxy S25'),
            target_price: z.number().describe('Giá mục tiêu bằng VND (số nguyên), ví dụ: 2000000'),
            search_query: z.string().describe('Query tìm kiếm giá sản phẩm này, ví dụ: AirPods Pro 2 giá Shopee Tiki'),
          }),
          // ── P0-2: the ONE AI write, routed through the action boundary ────
          //
          // The permission, argument, scope, execute and audit steps used to live inline here and
          // were correct only because this particular function was written carefully. They now run
          // in `runAiWriteAction`, so the next write tool inherits them instead of copying them.
          //
          // NOTHING THE MODEL OR THE CLIENTS SEE HAS CHANGED: same parameters, same limit, same
          // messages, same returned object. `authedUserId` is passed as the ACTOR — resolved from
          // the verified session far above — and the model has no way to name an owner.
          execute: async (rawArgs) => {
            const outcome = await runAiWriteAction({
              tool: 'save_price_watch',
              actor: { userId: authedUserId },
              rawArgs,
              policy: savePriceWatchPolicy(pwLang),
              req,
            })
            // The tool result shape is part of the model-facing contract: `{ ok, id, … }` on
            // success, `{ error }` on refusal. A denial reason is never handed to the model — it
            // gets the user-facing sentence and nothing about why the boundary said no.
            return outcome.ok ? outcome.result : { error: outcome.message }
          }
        }),
      } : {}),
    }),
    onFinish: async ({ usage, finishReason, text, steps }) => {
      // Prompt-cache accounting. `usage` is already the SUM across steps, but
      // cache counters live in per-step providerMetadata (the top-level
      // providerMetadata only carries the LAST step), so they are summed here.
      // Anthropic reports promptTokens EXCLUDING cached tokens, so the real
      // prompt size is promptTokens + cacheCreationTokens + cacheReadTokens —
      // never read promptTokens alone as "how big was the prompt".
      let cacheReadTokens = 0
      let cacheCreationTokens = 0
      let sawCacheMetadata = false
      for (const step of steps ?? []) {
        const meta = step.providerMetadata?.anthropic as
          { cacheReadInputTokens?: number | null; cacheCreationInputTokens?: number | null } | undefined
        if (!meta) continue
        if (typeof meta.cacheReadInputTokens === 'number') { cacheReadTokens += meta.cacheReadInputTokens; sawCacheMetadata = true }
        if (typeof meta.cacheCreationInputTokens === 'number') { cacheCreationTokens += meta.cacheCreationInputTokens; sawCacheMetadata = true }
      }
      // Phase-0: capture the model-side accounting synchronously at generation
      // complete (T9). The single tappyai_usage record now ships from the
      // client-emit transform (logUsage / timeClientEmit) so a buffered turn's
      // enrichment tail lands in the SAME record instead of being missed.
      modelFinishAt = Date.now()
      if (planningIntent) planEmitted = /\[TAPPY_PLAN\][\s\S]*\[\/TAPPY_PLAN\]/.test(text)
      auditToolResultChars = (steps ?? []).reduce((n, s) => n + (s.toolResults ?? []).reduce((m, r) => m + JSON.stringify((r as { result?: unknown }).result ?? null).length, 0), 0)
      usageAcct = {
        finishReason,
        promptTokens: usage?.promptTokens ?? null,
        completionTokens: usage?.completionTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        // null (not 0) when the provider reported no cache metadata at all, so
        // "caching is off/unsupported" stays distinguishable from "0 hits".
        cacheReadTokens: sawCacheMetadata ? cacheReadTokens : null,
        cacheCreationTokens: sawCacheMetadata ? cacheCreationTokens : null,
        // One LLM request per step. The memory-extraction generate() below is a
        // SEPARATE call, so total LLM calls = llmCalls + memoryExtract.
        llmCalls: steps?.length ?? null,
        toolCalls: (steps ?? []).reduce((n, s) => n + (s.toolCalls?.length ?? 0), 0),
      }
      if (authedUserId && worthExtract) {
        try {
          const convMessages = [
            ...trimmedMessages.map((m: { role: string; content: unknown }) => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })),
            { role: 'assistant', content: text },
          ]
          // Consultative V1 reads the LATEST user turn only (earlier turns were extracted on
          // their own turn); the habit markers the filter needs are read from the same text.
          const extractedRaw = await extractMemoryFromConversation(convMessages, existingMemory, { lastUserOnly: !!situation })
          const auditFile = process.env.AUDIT_USAGE_LOG_FILE
          if (auditFile) {
            try { appendFileSync(auditFile, JSON.stringify({ turn: auditTurn, type: 'tappyai_usage_memory', ...(lastMemoryExtractionUsage() ?? {}) }) + '\n') } catch { /* audit only */ }
          }
          // Consultative V1: what was said about TONIGHT is not a trait — the
          // deterministic post-filter drops transient timing / per-turn budget /
          // atmosphere wishes unless the user stated them as a habit.
          const extracted = situation
            ? (() => {
              const userTexts = convMessages.filter(m => m.role === 'user').map(m => m.content)
              const { memory, stats } = filterTransientMemory(extractedRaw, userTexts.slice(-1))
              console.log(JSON.stringify({ type: 'tappyai_consultative_v1', step: 'memory_filter', ...stats }))
              return memory
            })()
            : extractedRaw
          if (Object.keys(extracted).length > 0) {
            // Write with the admin client (pinned user_id) so the upsert works
            // under Bearer-token (native) auth — a fresh cookie client would
            // have no session and RLS would silently drop the write.
            await updateMemory(authedUserId, {
              location_base: extracted.location_base ?? existingMemory?.location_base ?? null,
              discovery_city: extracted.discovery_city ?? existingMemory?.discovery_city ?? null,
              companions: extracted.companions ?? existingMemory?.companions ?? null,
              timing: extracted.timing ?? existingMemory?.timing ?? null,
              personality: extracted.personality ?? existingMemory?.personality ?? null,
              preferences: { ...(existingMemory?.preferences || {}), ...(extracted.preferences || {}) },
              budget: { ...(existingMemory?.budget || {}), ...(extracted.budget || {}) },
              history: extracted.history ?? existingMemory?.history ?? [],
            }, createAdminClient())
          }
        } catch (e) {
          console.error('Memory extract/save error:', e)
        }
      } else if (authedUserId && situation) {
        // Consultative V1: the plain request that did not earn an extraction call still leaves
        // its topic in `history` — deterministically, from the user's own words, no model call.
        const topic = plainRequestTopic({ text: lastText, intent, isFirstReply })
        if (topic) {
          try {
            await updateMemory(authedUserId, { history: appendHistoryTopic(existingMemory, topic) }, createAdminClient())
          } catch (e) {
            console.error('Memory history save error:', e)
          }
        }
      }
    },
  })
  } catch (e) {
    // Log the real error server-side, but NEVER return String(e) to the client:
    // the AI registry's own error text enumerates provider/model names, which the
    // client must never learn (AI Platform boundary). Return a generic code.
    console.error('streamText init error:', e)
    return new Response(
      JSON.stringify({ error: 'ai_error' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }
  // ── Phase 2: photo-enrichment tail instrumentation ────────────────────────
  // Declared out here because the resolver closure fills them while the usage
  // record — emitted after the last byte leaves — reads them. Diagnostic only.
  type PhotoStepAgg = { n: number; totalMs: number; maxMs: number; hits: number; timeouts: number }
  const photoSteps: Partial<Record<'website' | 'places_media' | 'serper', PhotoStepAgg>> = {}
  let photoPlacesSelected = 0
  let photoPlacesEnriched = 0
  let photoTotalMs = 0
  let photoMaxPlaceMs = 0

  const baseResponse = result.toDataStreamResponse()
  // B7-A: photos are fetched only for the places the finished reply actually
  // names — the filter selects them, this resolves them. Each place degrades to
  // "no photo" independently; one slow or failing lookup never blocks the rest.
  const enrichedResponse = applyPlaceEnrichmentStreamFilter(baseResponse, lang, enrichment, async (places) => {
    const byName = new Map<string, string[]>()
    // Phase 2 instrumentation. postModelMs measured 1,490 ms median on
    // production and this resolver is the tail's only network work — but it is
    // a four-step fallback chain with four different timeouts, so the aggregate
    // does not say which step to look at. Recorded here, reported once on the
    // existing usage record. Nothing branches on any of it.
    const photoStart = Date.now()
    photoPlacesSelected = places.length
    await Promise.all(places.map(async (p) => {
      if (!p.name) return
      const placeStart = Date.now()
      try {
        const urls = await resolvePlacePhotos(
          { place_id: p.place_id, name: p.name, website_uri: p.website_uri, photo_names: p.photo_names },
          3,
          (t) => {
            const s = (photoSteps[t.step] ??= { n: 0, totalMs: 0, maxMs: 0, hits: 0, timeouts: 0 })
            s.n++; s.totalMs += t.ms; s.maxMs = Math.max(s.maxMs, t.ms)
            if (t.hit) s.hits++
            if (t.timedOut) s.timeouts++
          },
        )
        if (urls.length > 0) { byName.set(p.name, urls); photoPlacesEnriched++ }
      } catch { /* this place simply gets no photo */ }
      // Recorded for every place, enriched or not: the slowest place sets the
      // tail, and a place that found nothing can still be the slow one.
      photoMaxPlaceMs = Math.max(photoMaxPlaceMs, Date.now() - placeStart)
    }))
    photoTotalMs = Date.now() - photoStart
    return byName
    // A5 P0: a places turn (food/spa/venue) buffers and runs the fail-closed price guard even when
    // it retrieves nothing this turn — "Giá bao nhiêu?" after a restaurant recommendation used to
    // skip the boundary entirely and state a price reconstructed from general knowledge.
    // `needProfile.domain` is already derived above and is task-scoped, so a follow-up that carries
    // no place word of its own is still recognised; nothing new is persisted.
  }, undefined, undefined, travelIntent, lastText, needProfile.domain === 'places',
  /**
   * 🚨 TIKTOK REVIEW DISCOVERY — THE V1/V2 CAPABILITY, RESTORED WITH A QUERY
   * THAT CAN ACTUALLY BE ATTRIBUTED.
   *
   * V1/V2 asked the AREA ("<user query> review site:tiktok.com") and V3 kept the
   * same query behind a `wantsReviewContent` gate. Re-measured 2026-09-10: that
   * area query returns EIGHT valid TikTok posts — all listicles or videos about
   * other venues, so `attributeTikTok` refuses every one. Retrieval was never the
   * failure; asking about a district and hoping for a venue was.
   *
   * This asks about the venues on the card, batched into ONE request — the same
   * single search per turn V1/V2 paid for, now yielding attributable results.
   */
  async (names, location) => {
    tiktokEntitiesAsked = names.length
    const result = await enrichWithTikTok(names, location, serperSearch)
    tiktokSearched = result.searched
    tiktokAttributed = result.perPlace.size
    console.log(JSON.stringify({
      type: 'tappyai_tiktok_enrichment',
      entities: names.length, searched: result.searched,
      attributed: result.perPlace.size, batch: !!result.batch,
    }))
    return { perPlace: result.perPlace, batch: result.batch }
  },
  turnPlaceLocation)
  const finalResponse = (budget && budget.max < LUXURY_PRICE_FLOOR)
    ? applyLuxuryStreamFilter(enrichedResponse)
    : enrichedResponse
  // ADR-024. The key to this turn's evidence, if a shopping decision writes one.
  // Not a capability: decision_evidence_load() still refuses it unless the
  // caller's auth.uid() owns the row, so holding the id grants nothing.
  finalResponse.headers.set('X-Decision-Evidence-Id', evidenceId)

  // Phase-0: emit the single tappyai_usage record once the LAST byte has left, so
  // a buffered turn's client-emit side (TTUA, enrichment tail, true total) rides
  // the SAME record as the model-side accounting captured at onFinish. The
  // transform is a byte-identical pass-through; it changes nothing on the wire.
  const logUsage = (ttuaMs: number | null) => {
    const a = usageAcct
    const now = Date.now()

    // ── P1-3: the cost record, built ONCE ────────────────────────────────────
    //
    // This object is both the structured event and the shared half of the console line. Building
    // it once is the point: the two used to be one literal, and the moment a field was added to
    // only one of them the reconciliation the event type promises ("mirrors the console line
    // field-for-field") would quietly stop being true.
    //
    // Typed as UsageEvent, so a field that is not on the allow-listed vocabulary does not compile.
    const usageEvent: UsageEvent = {
      type: 'tappyai_usage',
      intent,
      finishReason: a?.finishReason ?? 'unknown',
      promptTokens: a?.promptTokens ?? null,
      completionTokens: a?.completionTokens ?? null,
      totalTokens: a?.totalTokens ?? null,
      cacheReadTokens: a?.cacheReadTokens ?? null,
      cacheCreationTokens: a?.cacheCreationTokens ?? null,
      llmCalls: a?.llmCalls ?? null,
      memoryExtract: (authedUserId && worthExtract) ? 1 : 0,
      toolCalls: a?.toolCalls ?? 0,
      // Total: t0 → final byte to the client (T10). Wider than the model-finish it
      // used to mark — on a buffered turn it now also covers the enrichment tail
      // the user waits through. modelFinishMs keeps the old T9 value.
      elapsedMs: now - startTime,
      preModelMs,
      ttftMs: firstTokenAt === null ? null : firstTokenAt - startTime,
      // T9 generation complete; T7 first content the client can SEE (== ttft on a
      // live turn, the whole-reply emit on a buffered one); postModelMs is the
      // enrichment/emit tail between T9 and the final byte.
      modelFinishMs: modelFinishAt === null ? null : modelFinishAt - startTime,
      ttuaMs,
      postModelMs: modelFinishAt === null ? null : now - modelFinishAt,
      toolMs: toolMs > 0 ? toolMs : null,
      providerId: AI.providerId(),
      modelRole: role,
    }

    // Buffered for delivery by a LATER request's flushPending (see the top of this handler).
    // recordEvent is an array push that cannot throw — an observability failure must never be
    // able to break the reply it is observing.
    recordEvent(usageEvent)

    console.log(JSON.stringify({
      ...usageEvent,
      // ── Console-only diagnostics ─────────────────────────────────────────
      // Deliberately NOT on the event. The allow-listed vocabulary is a privacy surface, and each
      // of these is either derivable from the fields above or too fine-grained to justify a
      // permanent field: keep the cost record small and the diagnostics where they already were.
      generationMs: firstTokenAt === null ? null : (modelFinishAt ?? now) - firstTokenAt,
      // Splits the tool-turn gap: firstStepFinishMs closes the tool-planning step,
      // toolMs is the summed tool execute() time.
      firstStepFinishMs,
      // ── Photo-enrichment tail (Phase 2) ──────────────────────────────────
      // postModelMs says the tail is ~1.5s; these say where inside it. null on
      // turns that resolved no photos, so "no enrichment ran" stays distinct
      // from "enrichment ran and took 0ms".
      photoTotalMs: photoPlacesSelected > 0 ? photoTotalMs : null,
      photoMaxPlaceMs: photoPlacesSelected > 0 ? photoMaxPlaceMs : null,
      photoPlacesSelected: photoPlacesSelected > 0 ? photoPlacesSelected : null,
      photoPlacesEnriched: photoPlacesSelected > 0 ? photoPlacesEnriched : null,
      // Per step of the fallback chain: how often it ran, how long it cost, how
      // often it actually contributed a URL, and how often it burned its own
      // timeout. A step that runs every turn and contributes nothing is the
      // clearest possible signal, and only this breakdown can show it.
      photoSteps: photoPlacesSelected > 0 ? photoSteps : null,
      retryCount: 'unknown',
      worthExtract,
      forcedTool,
      planningIntent,
      planEmitted,
      frameGoal: decisionFrame.goal,
      frameDomains: decisionFrame.domains,
      frameClarify: decisionFrame.clarify?.about ?? null,
    }))
    /**
     * AUDIT COST SINK — cost-optimization measurement (2026-09-18). Active only when
     * `AUDIT_USAGE_LOG_FILE` is set (never in production); appends one JSON line per turn with the
     * usage record, the Serper calls this turn made, and the SIZE of every prompt section, so a
     * per-section token breakdown can be derived offline. Nothing here changes the reply; a write
     * failure is swallowed.
     */
    const auditFile = process.env.AUDIT_USAGE_LOG_FILE
    if (auditFile) {
      try {
        const historyChars = modelMessages.slice(0, -1).reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0)
        appendFileSync(auditFile, JSON.stringify({
          turn: auditTurn, at: new Date().toISOString(), ...usageEvent,
          serper: serperDelta(serperAtStart),
          flags: { consultativeV1: consultativeV1Enabled(), v1Active, placeGuardV2: placeGuardAttributionV2Enabled(), snippetV2: snippetPriceGuardV2Enabled(), mediaV2: mediaPlacementV2Enabled() },
          sections: {
            sharedChars: systemShared?.length ?? 0,
            dynamicChars: (built ? built.dynamic.length : 0),
            simpleSystemChars: built ? 0 : systemPrompt.length,
            styleChars: styleBlock.length,
            consultativeChars: consultativeBlock.length,
            v1Chars: v1Block.length,
            memoryChars: memoryBlock.length,
            prefChars: prefBlock.length,
            historyChars,
            lastUserChars: lastText.length,
            toolResultChars: auditToolResultChars,
            noToolTurn,
            maxTokens: noToolTurn ? 300 : planningIntent ? 4096 : hasImage ? 1024 : 2048,
          },
        }) + '\n')
      } catch { /* audit only */ }
    }
  }
  const timedBody = finalResponse.body
    ? finalResponse.body.pipeThrough(timeClientEmit(startTime, Date.now, (t) => logUsage(t.ttuaMs)))
    : finalResponse.body
  return new Response(timedBody, { status: finalResponse.status, headers: finalResponse.headers })
}

