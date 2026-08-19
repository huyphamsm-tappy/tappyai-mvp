import { tool } from 'ai'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMemoryBlock, extractMemoryFromConversation, updateMemory, type UserMemory } from '@/lib/memory/memoryService'
import { webSearch, resolvePlacePhotos } from '@/lib/ai/tools/common'
import { getWeather, getGoldPrice } from '@/lib/ai/tools/weather'
import { searchProducts } from '@/lib/ai/tools/shopping'
import { getNews, searchPlaces } from '@/lib/ai/tools/food'
import { getFlightPrices, getHotelPrices, getTransportOptions } from '@/lib/ai/tools/travel'
import { AI, type ModelRole } from '@/lib/ai/llm'
import { deriveChatRoutingHints } from '@/lib/ai/llm/routing/chatHints'
import { validateClientInput } from '@/lib/ai/security/clientInput'
import { fenceUntrusted } from '@/lib/ai/security/fence'
import { classifyIntent, detectLang, detectExplicitLangRequest, detectForcedTool, detectLocationIntent, detectPlanningIntent, detectDecisionStage, isSimpleQuery } from '@/lib/ai/intent'
import { type Budget, extractBudget, applyBudgetFilter, LUXURY_PRICE_FLOOR, applyLuxuryStreamFilter } from '@/lib/ai/budget'
import { buildSystem, buildSystemSimple, buildPrefBlock } from '@/lib/ai/promptBuilder'
import { applyPlaceEnrichmentStreamFilter, type TurnEvidence } from '@/lib/ai/streamEnrichment'
import { decideResponseMode, mediaBudgetFor, placesWithinBudget } from '@/lib/ai/mediaPolicy'
import { buildGroundedFactsBlock } from '@/lib/ai/groundedFacts'
import { normalizeToolCandidates } from '@/lib/ai/candidateEvidence'
import { buildEvidenceStatusBlock, buildStateContextBlock, usableCandidates, visibleCandidates, type EvidenceStatus } from '@/lib/ai/stateContext'
import { applyDelta, extractDelta, unseenCandidateCount, type ConsultationDelta } from '@/lib/ai/consultationDelta'
import { buildRankingBlock, rankCandidates } from '@/lib/ai/candidateRanking'
import { RECOMMENDATION_SCHEMA, buildDecisionToolBlock, renderRecommendation, validateDecision, type RecommendationDecision } from '@/lib/ai/recommendationDecision'
import { buildNoCandidateResponse, buildRejectionQuestionBlock, buildRejectionResponse, buildSearchFailedResponse, shouldUseDeterministicRejection, shouldUseDeterministicResponse, toDataStreamBody } from '@/lib/ai/noCandidateResponse'
import { buildProductQuery, classifyProductResult, filterIrrelevantProducts, productRecordsFrom, shouldPreSearchProducts } from '@/lib/ai/productPreSearch'
import { buildPlaceQuery, classifyPlaceResult, placeRecordsFrom, shouldPreSearchPlaces } from '@/lib/ai/placePreSearch'
import {
  createState,
  isValidConversationId,
  loadState,
  newConversationId,
  ownerScopeFor,
  saveState,
  type ConversationState,
} from '@/lib/ai/conversationState'
import { splitToolResult, createEnrichmentCollector } from '@/lib/ai/toolResultSplit'
import { shouldExtractMemory } from '@/lib/ai/memoryGate'
import { buildChatPromptContext } from '@/lib/ai/contextBuilder'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import { FREE_DAILY_LIMIT, ANON_DAILY_LIMIT, vnToday, countTodayUserMessages } from '@/lib/config/product'

export const maxDuration = 60

export async function POST(req: Request) {
  const startTime = Date.now()

  // Flood guard: cap requests per client IP (applies to anonymous and
  // authenticated callers alike, before any expensive LLM/tool work). The
  // per-user daily freemium cap below is a separate, longer-window control.
  const rl = rateLimit(`chat:${clientIp(req)}`, 30, 60_000)
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ error: 'Bạn gửi quá nhanh, vui lòng thử lại sau giây lát.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) } },
    )
  }

  // ── P3-S1: the client input trust boundary ────────────────────────────────
  // Everything below this point works on SERVER-CONSTRUCTED values. The client's
  // objects are never forwarded: validateClientInput rebuilds each message from
  // an allowlist, so a forged role, a fabricated tool result, or a
  // provider-specific field cannot survive into prompt construction or reach a
  // provider. It also applies the single bounded client-input budget, which the
  // old per-messages char cap did not cover for preferences.
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
    // Size rejections keep their existing 413 + user-facing copy; every other
    // contract violation is a 400 with a machine-readable code.
    const isSize = validated.code === 'message_too_long'
      || validated.code === 'preference_budget_exceeded'
      || validated.code === 'input_budget_exceeded'
      || validated.code === 'image_too_large'
    return new Response(
      JSON.stringify(isSize
        ? { error: validated.code, message: 'Tin nhắn quá dài. Vui lòng rút gọn.' }
        : { error: validated.code }),
      { status: isSize ? 413 : 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const messages = validated.messages
  const { userLocation: rawUserLocation, responseStyle: rawResponseStyle } = rawBody as {
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

  const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
  const rawContent = lastUserMsg?.content
  const lastText = typeof rawContent === 'string'
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.map(c => (c.type === 'text' ? c.text : '')).join(' ')
      : ''

  // Detect if last message contains an image
  const hasImage = Array.isArray(rawContent) && rawContent.some(
    (c: { type?: string }) => c.type === 'image' || c.type === 'image_url'
  )

  const intent = classifyIntent(lastText)
  const budget = extractBudget(lastText)
  const locationIntent = detectLocationIntent(lastText)
  const planningIntent = detectPlanningIntent(lastText)
  // Response language = the user's LATEST message, unless they explicitly ask
  // for another one ("Answer in English", "Trả lời bằng tiếng Việt") — that
  // request always wins. Never derived from UI locale, browser language,
  // profile, country, or earlier turns (none of those are read here).
  const lang = detectExplicitLangRequest(lastText) ?? detectLang(lastText)
  const forcedTool = detectForcedTool(lastText)
  // Whether this turn earns a third LLM call for memory extraction. Was
  // `lastText.length > 20`, which measured wrong in both directions: it fired on
  // weather/gold/news lookups that store nothing, and dropped "Tôi ăn chay."
  // (12 chars) — a hard dietary constraint. See memoryGate.ts.
  const worthExtract = shouldExtractMemory({ text: lastText, intent, forcedTool })
  const userMessages = messages.filter((m: { role: string }) => m.role === 'user')
  const isFirstReply = userMessages.length <= 1
  // Where in the decision this turn sits (C2). "Rẻ hơn" only means "tighten the
  // current task" if there IS one, so refinement is gated on a prior assistant
  // turn — read from the history already on the request, not a second LLM call.
  const hasPriorAssistantTurn = messages.some((m: { role: string }) => m.role === 'assistant')
  const decisionStage = detectDecisionStage(lastText, { hasPriorAssistantTurn })

  // Load user memory + kiểm tra freemium limit. Quota values + measurement live
  // in @/lib/config/product — the single owner of every business value.
  let memoryBlock = ''
  let prefBlock = ''
  let authedUserId: string | null = null
  // Anonymous *session* id (auth.uid() of the anonymous JWT). Used only to scope
  // conversation state to the session that created it — never sent to a client.
  let anonUserId: string | null = null
  let existingMemory: UserMemory | null = null
  let isPro = false
  // True once a token-based ANONYMOUS session's quota was enforced server-side
  // (keyed by anonymous_id) — the legacy cookie counter below is then skipped.
  let anonQuotaByToken = false
  try {
    const { user, supabase } = await getRequestUser(req)
    if (user?.is_anonymous) anonUserId = user.id
    if (user?.is_anonymous) {
      // Anonymous session minted by POST /api/auth/anonymous. Same Bearer
      // pipeline as logged-in users (getRequestUser verified the JWT); quota is
      // keyed by anonymous_id = auth.uid() inside a SECURITY DEFINER function —
      // the client never sends or computes quota information. No memory,
      // preferences, or subscription lookups for anonymous identities.
      const { data: usedToday, error: quotaError } = await supabase.rpc('anon_chat_usage_increment')
      if (!quotaError && typeof usedToday === 'number') {
        anonQuotaByToken = true
        if (usedToday > ANON_DAILY_LIMIT) {
          return new Response(
            JSON.stringify({
              error: 'anon_limit_reached',
              message: `Bạn đã dùng hết ${ANON_DAILY_LIMIT} câu hỏi miễn phí hôm nay. Đăng nhập để tiếp tục trò chuyện với Tappy!`,
              upgradeUrl: '/login',
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          )
        }
      } else {
        // RPC unavailable (migration not applied yet / transient) — fall back to
        // the legacy cookie cap below rather than leaving the request uncapped.
        console.error('[chat] anon quota rpc failed, falling back to cookie cap:', quotaError?.message)
      }
    } else if (user) {
      authedUserId = user.id
      const chatContext = await buildChatPromptContext(user.id, supabase)
      existingMemory = chatContext.memory
      if (existingMemory) memoryBlock = buildMemoryBlock(existingMemory, forcedTool)
      if (chatContext.prefs) prefBlock = buildPrefBlock(chatContext.prefs)

      // Inject Google Calendar events if connected
      try {
        const { getUpcomingEvents, formatEventsForPrompt } = await import('@/lib/integrations/googleCalendar')
        const calEvents = await getUpcomingEvents(user.id)
        if (calEvents.length > 0) {
          memoryBlock = (memoryBlock || '') + formatEventsForPrompt(calEvents)
        }
      } catch { /* calendar optional */ }

      // Kiá»ƒm tra subscription tá»« DB
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', user.id)
        .single()
      if (subData?.status === 'active' && subData?.current_period_end) {
        isPro = new Date(subData.current_period_end) > new Date()
      }

      if (!isPro) {
        // Äáº¿m sá»‘ tin nháº¯n user Ä‘Ã£ gá»­i hÃ´m nay (theo giá» VN UTC+7)

        // Æ¯á»›c tÃ­nh sá»‘ message tá»« conversations hÃ´m nay â€” Ä‘Æ¡n giáº£n: náº¿u > FREE_DAILY_LIMIT conversations thÃ¬ cháº·n
        // CÃ¡ch chÃ­nh xÃ¡c hÆ¡n cáº§n track message count riÃªng â€” dÃ¹ng táº¡m cÃ¡ch nÃ y cho MVP
        // Shared VN-day measurement from @/lib/config/product — the same helper
        // the subscription page displays from, so display and enforcement can
        // never disagree. (Also drops a redundant count-only query this route
        // used to run and never read.)
        const totalMsgs = await countTodayUserMessages(supabase, user.id)

        if (totalMsgs >= FREE_DAILY_LIMIT) {
          return new Response(
            JSON.stringify({
              error: 'free_limit_reached',
              message: `Bạn đã dùng hết ${FREE_DAILY_LIMIT} tin nhắn miễn phí hôm nay. Hẹn gặp lại bạn vào ngày mai nhé!`,
            }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
          )
        }
      }
    }
  } catch (e) {
    // Identity/quota resolution is best-effort so a transient auth/DB error can't
    // hard-fail chat. This favors availability over strict enforcement: on error
    // the daily cap for THIS request may be skipped. Log it so the fail-open is
    // observable rather than silent.
    console.error('[chat] auth/quota resolution failed (proceeding unmetered):', e)
  }

  // Freemium policy: anonymous visitors get a small taste — FREE_ANON_LIMIT basic
  // questions per day — then must log in. The count lives in an httpOnly cookie
  // (server-set, so ordinary users can't tamper; clearing cookies resets it,
  // which is acceptable for a top-of-funnel teaser). Everything past chat
  // (reviews, saves, upload, …) still requires an account.
  let anonSetCookie: string | null = null
  if (!authedUserId && !anonQuotaByToken) {
    const today = vnToday()
    const cookieHeader = req.headers.get('cookie') || ''
    const m = cookieHeader.match(/(?:^|;\s*)tappy_anon=([^;]+)/)
    let anonCount = 0
    if (m) {
      const [d, c] = decodeURIComponent(m[1]).split(':')
      if (d === today) anonCount = parseInt(c, 10) || 0
    }
    if (anonCount >= ANON_DAILY_LIMIT) {
      return new Response(
        JSON.stringify({
          error: 'anon_limit_reached',
          message: `Bạn đã dùng hết ${ANON_DAILY_LIMIT} câu hỏi miễn phí hôm nay. Đăng nhập để tiếp tục trò chuyện với Tappy!`,
          upgradeUrl: '/login',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
    anonSetCookie = `tappy_anon=${today}:${anonCount + 1}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax; Secure`
  }

  // Freeform user preferences. Already bounded and normalised to single-line
  // DATA at the trust boundary (P3-S1): an item can no longer carry a line
  // break, so it cannot open a section or forge a block header inside the
  // system prompt. P3-S2 additionally fences the items below as DATA, so they
  // cannot be confused with the instruction that follows them.
  const rawPrefsArr = validated.preferences
  if (rawPrefsArr.length > 0) {
    const freeformBlock = `\n\n===== Sá»ž THÃCH & THÃ”NG TIN CÃ NHÃ‚N Cá»¦A USER =====\n${fenceUntrusted('user_preferences', rawPrefsArr.map(p => `- ${p}`).join('\n'))}\nHÃ£y luÃ´n ghi nhá»› vÃ  Ã¡p dá»¥ng nhá»¯ng sá»Ÿ thÃ­ch nÃ y khi gá»£i Ã½.\n==================================================`
    prefBlock = prefBlock ? prefBlock + freeformBlock : freeformBlock
  }

  // Request-scoped enrichment channel (B4). Photos and order/platform links are
  // carved out of every place-tool result so they never enter the model's
  // context — the prompt forbids the model from writing them, and
  // applyPlaceEnrichmentStreamFilter injects them positionally afterwards. This
  // const lives and dies with this request: no module state, no key to collide
  // on, nothing shared between users or carried across warm invocations.
  // ---- Consultative conversation state (Task 3C) -------------------------
  // Placed after every gate above, so a rate-limited or over-quota request
  // never mints state. Ownership is derived HERE, server-side: the client's
  // conversationId is a lookup key and nothing more — `loadState` refuses it
  // unless the caller's own scope matches. With neither an authenticated user
  // nor an anonymous session there is no identity to scope to, so state stays
  // off rather than being shared across callers.
  const ownerScope = ownerScopeFor({ userId: authedUserId, anonId: anonUserId })
  const requestedConvId = (rawBody as { conversationId?: unknown }).conversationId
  let hadCandidatesBefore = false
  let convState: ConversationState | null = null
  let consultationDelta: ConsultationDelta | null = null
  let conversationId = ''
  if (ownerScope) {
    if (isValidConversationId(requestedConvId)) {
      convState = await loadState(requestedConvId, ownerScope)
    }
    // Unknown, expired, malformed, or someone else's id all land here and get a
    // FRESH conversation — never an error that would confirm the id exists.
    if (!convState) convState = createState(newConversationId(), ownerScope)
    conversationId = convState.conversationId
    // Read BEFORE this turn's delta touches anything: whether the user already
    // had options in front of them is what separates the one illustrated turn
    // from every follow-up.
    hadCandidatesBefore = convState.candidates.length > 0
    convState.turn += 1
    if (decisionStage) convState.decisionStage = decisionStage

    // Task 3E: read what THIS message does to the consultation, then fold it in.
    // Accumulative — a short turn ("tầm 25 triệu") adds to the task, it never
    // replaces it, so requirements stated several turns ago survive.
    consultationDelta = extractDelta(lastText, convState, decisionStage, convState.turn)
    convState = applyDelta(convState, consultationDelta)
  }

  const enrichment = createEnrichmentCollector()
  // Task 3D: candidates are harvested from the MODEL-facing half, which is where
  // the facts are — B4 carves out only photos and order links, so address,
  // rating, maps_link and price all survive here. (3C read the enrichment half
  // instead, which is exactly why candidates persisted with `facts: {}`.)
  const freshCandidates: ReturnType<typeof normalizeToolCandidates> = []
  // Task 3F-2: "the provider errored" and "the provider found nothing" are
  // different facts about the world and must not collapse into one message.
  // Read from the tool result itself: our place/product tools return an `error`
  // field on failure and an empty list when they genuinely found nothing.
  let anySearchRan = false
  let anySearchFailed = false
  const forModel = (toolName: string, result: unknown) => {
    const { model, enrichment: carved } = splitToolResult(toolName, result)
    enrichment.add(carved)
    anySearchRan = true
    const r = model as { error?: unknown; results?: unknown[]; search_results?: unknown[] } | null
    if (r && typeof r === 'object' && r.error) anySearchFailed = true
    if (convState) freshCandidates.push(...normalizeToolCandidates(toolName, model, Date.now()))
    return model
  }

  const role: ModelRole = (planningIntent || hasImage) ? 'planning' : isSimpleQuery(lastText, isFirstReply) ? 'fast' : 'smart'
  console.log(JSON.stringify({ type: 'tappyai_model', model: role, planningIntent }))

  // Truncate history to last 10 messages to control token costs
  const trimmedMessages = messages.length > 10 ? messages.slice(-10) : messages

  // Split so the provider can cache the invariant rulebook and leave everything
  // request-shaped (clock, language, memory, prefs, budget, GPS, style) after
  // the breakpoint. The chitchat path has no rulebook to share — its prompt is
  // ~300 tokens, far below any provider's minimum cacheable size — so it passes
  // everything as `system` and shares nothing.
  // A bare acknowledgement takes the same no-tool path as chitchat: there is
  // nothing to search for, and the previous turn already produced the result the
  // user is agreeing to. Cheaper AND the right behaviour — a confirmation must
  // never restart a search.
  const noToolTurn = intent === 'chitchat' || decisionStage === 'confirmation'
  const built = noToolTurn ? null : buildSystem(
    budget, locationIntent, isFirstReply, memoryBlock, lang, prefBlock, userLocation, planningIntent, hasImage, decisionStage,
  )
  const systemShared = built?.shared
  // Task 3D — THE READ PATH. Accumulated state and the previous turn's grounded
  // candidates go into `dynamic`, never `shared`: this is request-shaped, so
  // putting it in the cached prefix would break B1's byte-stability. Appended
  // after styleBlock so it is among the last things read before generating.
  // buildStateContextBlock is an allow-list projection — ownerScope, storage
  // keys and auth ids have no path into it.
  // ── Task 3F-2.5: product pre-search gate ─────────────────────────────────
  // PRODUCTS ONLY. Place/hotel search stay on the LLM tool path untouched.
  //
  // Runs here — after the delta, before any prompt block or stream — so the
  // server knows the search outcome BEFORE a token is generated. That is the
  // whole point: an empty product search can no longer reach free-form
  // generation, which is how T1 previously invented a machine, a price, and a
  // 16GB answer to a stated 32GB requirement.
  let preSearchSeed: TurnEvidence | undefined
  let productPreSearched = false
  if (shouldPreSearchProducts({ delta: consultationDelta, forcedTool, state: convState, locationIntent: locationIntent !== 'unknown' }) && convState) {
    const query = buildProductQuery(convState, lastText)
    const raw = await searchProducts(query, lang)
    const filtered = budget ? applyBudgetFilter(raw, budget, query) : raw
    // Same wrapper the tool path uses, so B4 carving, enrichment collection and
    // candidate normalisation behave identically to an LLM-issued call.
    const model = forModel('search_products', filtered)
    const outcome = classifyProductResult(model)
    convState.lastSearchOutcome = outcome
    productPreSearched = true

    if (outcome === 'ok') {
      convState.candidates = filterIrrelevantProducts(freshCandidates.slice(), convState)
      convState.lastSearchContext = { query, tool: 'search_products', at: Date.now() }
      // Feed the stream filter what the missing `9:`/`a:` frames would have
      // given it (Task 3F-2.4), so photos, order links and money-guard
      // grounding survive the move.
      preSearchSeed = {
        places: [],
        productRecords: productRecordsFrom(model) as TurnEvidence['productRecords'],
        productQueries: [query],
      }
    } else if (outcome === 'failed' || convState.hardConstraints.length > 0) {
      // Empty WITH stated requirements, or a provider failure -> answer
      // deterministically, never via the model.
      //
      // An empty result with NO hard constraints deliberately falls through to
      // the existing LLM path: there is no requirement to protect, the
      // hard-constraint wording would render empty, and turning every
      // no-result turn into a template is exactly the over-reach this gate is
      // meant to avoid.
      const text = outcome === 'failed'
        ? buildSearchFailedResponse(convState, lang)
        : buildNoCandidateResponse(convState, lang)
      await saveState(convState)
      const headers: Record<string, string> = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Conversation-Id': conversationId,
        'Access-Control-Expose-Headers': 'X-Conversation-Id',
      }
      if (anonSetCookie) headers['Set-Cookie'] = anonSetCookie
      console.log(JSON.stringify({ type: 'tappyai_product_presearch', outcome, hardConstraints: convState.hardConstraints.length }))
      return new Response(toDataStreamBody(text), { headers })
    }
  }

  // ── Place pre-search ──────────────────────────────────────────────────────
  // The same move, for the sibling path. Measured 2026-08-19: the place tool
  // returned ten real venues and the reply presented two the tool never named.
  // Searching first is what puts the initial place turn under the SAME
  // grounded-facts regime that already governs every follow-up turn — the raw
  // tool output arriving mid-stream has nothing said about it, the candidate
  // table does. It also costs one model request instead of two.
  let placePreSearched = false
  if (!productPreSearched && shouldPreSearchPlaces({
    delta: consultationDelta, forcedTool, state: convState,
    locationIntent: locationIntent !== 'unknown', planningIntent: !!planningIntent, hasImage,
  }) && convState) {
    const { query, location } = buildPlaceQuery(convState, lastText)
    const raw = await searchPlaces(query, location, undefined, lang, userLocation)
    const filtered = budget ? applyBudgetFilter(raw, budget, query) : raw
    // Same wrapper as the tool path, so B4 carving, enrichment collection and
    // candidate normalisation behave identically to an LLM-issued call.
    const model = forModel('search_places', filtered)
    const outcome = classifyPlaceResult(model)
    convState.lastSearchOutcome = outcome
    placePreSearched = true
    console.log(JSON.stringify({ type: 'tappyai_place_presearch', outcome, results: freshCandidates.length }))

    if (outcome === 'ok') {
      convState.candidates = freshCandidates.slice()
      convState.lastSearchContext = { query, tool: 'search_places', at: Date.now() }
      // Feed the filter what the missing `9:`/`a:` frames would have carried, so
      // photos and order links still inject.
      preSearchSeed = {
        places: placeRecordsFrom(model) as TurnEvidence['places'],
        productRecords: [],
        productQueries: [],
      }
    }
    // An empty or failed place search deliberately falls through to the normal
    // path: the zero-evidence block already forbids naming a venue, and turning
    // every no-result place turn into a template is the over-reach the product
    // gate was careful to avoid.
  }

  const stateBlock = buildStateContextBlock(convState, consultationDelta?.searchImpact)
  // Task 3F: the ranking is computed HERE, deterministically, from the candidates
  // the previous turn grounded — the model receives an ordered set with reasons
  // and exclusions rather than a raw list to summarise. Empty string when there
  // is nothing held, so a cold first turn is unchanged.
  const rankingBlock = convState && convState.candidates.length > 0
    ? buildRankingBlock(rankCandidates(convState.candidates, convState), convState)
    : ''
  // Task 3F-2: the zero-evidence guard. Deliberately NOT gated on the candidate
  // count being > 0 — it exists precisely when there is nothing to recommend
  // from, which is when the model was observed inventing products and prices.
  // Rejected options do NOT count as evidence. Reading `candidates.length` here
  // announced 'candidates' on a turn whose state block listed none, because the
  // array still holds what the user just turned down — the model was told it had
  // options and shown none in the same prompt.
  const visibleCount = convState ? visibleCandidates(convState).length : 0
  // …and rows with nothing but a search snippet are not evidence at all. A
  // product search that returns only articles must read as "the provider
  // answered with nothing usable", which is what search_empty means — not as
  // six things to choose between.
  const usableCount = convState ? usableCandidates(convState).length : 0
  const evidenceStatus: EvidenceStatus =
    !convState ? 'none'
      : usableCount > 0 ? 'candidates'
        : convState.lastSearchOutcome === 'failed' ? 'search_failed'
          // 'ok' with nothing usable is the same fact as 'empty' from the
          // decision's point of view: the provider answered and none of it can
          // support a recommendation. Saying 'none' here would drop the turn
          // into the free-form path that fabricated the Air M2.
          : convState.lastSearchOutcome === 'empty' || convState.lastSearchOutcome === 'ok' ? 'search_empty'
            : 'none'
  const evidenceBlock = buildEvidenceStatusBlock(evidenceStatus, convState)

  // ── Task 3F-2.2: deterministic zero-candidate reply ───────────────────────
  // The one path where the model is not asked at all. Prompt-level prohibition
  // was measured failing here three times (12 unsupported numeric claims before
  // the directives, 12-13 after), including recommending 16GB against a stated
  // 32GB requirement. Composing the reply from state instead makes fabrication
  // impossible by construction rather than by instruction.
  //
  // Returns BEFORE any LLM call. State is still saved and the conversation id
  // still returned, so the next turn continues normally.
  if (convState && shouldUseDeterministicResponse(convState, evidenceStatus, usableCount, consultationDelta?.searchImpact.required ?? false)) {
    const text = buildNoCandidateResponse(convState, lang)
    await saveState(convState)
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Conversation-Id': conversationId,
      'Access-Control-Expose-Headers': 'X-Conversation-Id',
    }
    if (anonSetCookie) headers['Set-Cookie'] = anonSetCookie
    console.log(JSON.stringify({ type: 'tappyai_no_candidate_deterministic', hardConstraints: convState.hardConstraints.length }))
    return new Response(toDataStreamBody(text), { headers })
  }

  // ── Part E: deterministic rejection reply ─────────────────────────────────
  // Fires only when every held candidate has been shown and rejected, so the
  // same search would return the same turned-down options. Guarantees exactly
  // one question on the turn where two were measured. See the module comment.
  // USABLE, not merely visible: a rejection that leaves only rows with no
  // price, spec or address has left nothing to consult over, and the free-form
  // path is where the multi-question interrogations were measured.
  if (convState && shouldUseDeterministicRejection(convState, decisionStage, usableCount)) {
    const text = buildRejectionResponse(convState, lang)
    await saveState(convState)
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Conversation-Id': conversationId,
      'Access-Control-Expose-Headers': 'X-Conversation-Id',
    }
    if (anonSetCookie) headers['Set-Cookie'] = anonSetCookie
    console.log(JSON.stringify({ type: 'tappyai_rejection_deterministic', rejected: convState.rejections.length }))
    return new Response(toDataStreamBody(text), { headers })
  }
  // Rejection turns that still have something to offer keep the LLM — the
  // deterministic reply above only covers an emptied table. What they do NOT
  // keep is the model's freedom to choose WHICH dimension to probe: that choice
  // was the questionnaire's source. One question, computed from state, is
  // handed over as a finished sentence. Last block before generation.
  // The search policy has to be ENFORCED, not advised. Measured: on "cho mình
  // thêm vài quán khác" the policy computed required:false with seven unseen
  // candidates held, and the model called search_places anyway — a provider
  // call and a fresh candidate set the user never needed.
  //
  // Same shape as the product pre-search exception, narrowed to reuse: the tool
  // is withheld ONLY when there is genuinely something to reuse. Initial
  // discovery, a location change, a new hard constraint and an exhausted pool
  // all set searchImpact.required, so all of them keep the tool.
  const withholdPlaceSearch = placePreSearched || (!!convState
    && consultationDelta?.searchImpact.required === false
    && usableCount > 0
    && unseenCandidateCount(convState) > 0)
  // The factual surface. Built from VISIBLE candidates only — this turn's
  // rejection is already applied (applyDelta runs before ranking), so a
  // just-rejected option has no facts to state and nothing to be recommended
  // from. Facts are composed here; the model supplies the reasoning.
  const groundedFactsBlock = convState ? buildGroundedFactsBlock(visibleCandidates(convState), lang) : ''
  const rejectionQuestionBlock = convState && decisionStage === 'rejection' && visibleCount > 0
    ? buildRejectionQuestionBlock(convState, lang)
    : ''
  // The server already searched, so `search_products` is withheld below. The
  // rulebook still says "dùng tool search_products" for prices, which left the
  // model reaching for a tool that was not there: measured finishReason
  // 'tool-calls' with toolCalls 0 and an EMPTY reply on every pre-searched
  // turn. This states the fact; it is not an instruction about behaviour.
  const reuseBlock = placePreSearched
    ? `\n\n===== LUOT NAY: DA TIM DIA DIEM XONG (SERVER) =====
Mot lan tim dia diem da chay o server cho luot nay; ket qua chinh la cac lua chon o tren.
Tool search_places KHONG co trong danh sach tool cua luot nay — dung goi no.
CHI duoc neu ten nhung quan da liet ket o tren. KHONG duoc them bat ky quan nao khac,
du ban co biet no that su ton tai — mot cai ten khong co trong danh sach la mot cai ten bia.
====================================================`
    : withholdPlaceSearch
    ? `\n\n===== LUOT NAY: DUNG LAI CAC LUA CHON DA CO =====
Van con lua chon TRONG BANG CHUNG o tren ma user CHUA duoc xem. Hay tra loi tu nhung lua chon do.
Tool search_places KHONG co trong danh sach tool cua luot nay — dung goi no.
=================================================`
    : ''
  const preSearchedBlock = productPreSearched
    ? `\n\n===== LUOT NAY: DA TIM SAN PHAM XONG (SERVER) =====
Mot lan tim san pham da chay o server cho luot nay; ket qua chinh la BANG CHUNG o tren.
Tool search_products KHONG co trong danh sach tool cua luot nay — dung goi no, se khong co ket qua tra ve.
Hay tra loi TRUC TIEP tu du lieu da co.
====================================================`
    : ''
  const systemPrompt = (built ? built.dynamic : buildSystemSimple(lang, memoryBlock)) + styleBlock + stateBlock + rankingBlock + evidenceBlock + groundedFactsBlock + reuseBlock + preSearchedBlock + rejectionQuestionBlock

  // Routing hints (P2). These describe the KIND of job this turn is, built
  // entirely from signals computed above — planning detection, image detection,
  // budget extraction and language are NOT repeated here. No provider, no model,
  // no user text: the router stays the sole authority on what serves the turn,
  // and it is currently observed in shadow only.
  const routingHints = deriveChatRoutingHints({
    noToolTurn,
    planningIntent,
    hasImage,
    hasBudget: budget !== null,
    lang,
  })

  // ── D3: the grounded decision path ────────────────────────────────────────
  // On a decision turn the model no longer writes the reply. It returns IDs and
  // CLOSED reason codes through `submit_recommendation`; recommendationDecision
  // validates both against each candidate's OWN evidence and renders every
  // visible sentence. A code the evidence cannot support is dropped, so an
  // unsupported claim has no path to the user.
  //
  // ONE request: maxSteps 1 with a forced named tool. Higher maxSteps re-applies
  // toolChoice on the follow-up step (prepareToolsAndToolChoice runs inside
  // streamStep on this SDK), which loops and returns empty text — measured.
  const d3DecisionTurn = !!convState && decisionStage === 'decision' && usableCount > 0
  if (d3DecisionTurn && convState) {
    const ranked = rankCandidates(convState.candidates, convState).ranked.map(r => r.candidate)
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Conversation-Id': conversationId,
      'Access-Control-Expose-Headers': 'X-Conversation-Id',
    }
    if (anonSetCookie) headers['Set-Cookie'] = anonSetCookie

    try {
      const decisionRun = AI.stream({
        role,
        routing: routingHints,
        abortSignal: req.signal,
        systemShared,
        system: systemPrompt + buildDecisionToolBlock(ranked, convState, lang),
        messages: trimmedMessages,
        maxTokens: 600,
        maxSteps: 1,
        toolChoice: { type: 'tool', toolName: 'submit_recommendation' },
        tools: {
          submit_recommendation: tool({
            description: 'Chot MOT lua chon cho user. Chi gui ID va ma ly do — KHONG viet cau mo ta ve lua chon.',
            parameters: RECOMMENDATION_SCHEMA,
          }),
        },
      })
      // streamText's `toolCalls` promise only settles once the stream is
      // drained. Nothing else reads this stream — the reply is composed here,
      // not forwarded — so drain it explicitly or the await never returns.
      await decisionRun.consumeStream()
      const calls = await decisionRun.toolCalls
      // This branch returns before the general path's onFinish, so its tokens
      // would otherwise be invisible in tappyai_usage. Account for them here.
      const decisionUsage = await decisionRun.usage.catch(() => null)
      const args = calls.find(c => c.toolName === 'submit_recommendation')?.args as
        | RecommendationDecision | undefined

      // No tool call, or malformed arguments: fall through to the existing safe
      // deterministic reply rather than to a free-form model answer, which is
      // exactly the leakage this path exists to remove.
      if (args) {
        const validated = validateDecision(args, convState, ranked)
        const text = renderRecommendation(validated, lang)
        convState.presentedCandidates = [...new Set([
          ...(convState.presentedCandidates ?? []),
          ...[validated.recommended?.candidateId, validated.alternative?.candidateId].filter(Boolean) as string[],
        ])]
        convState.lastPresentedCandidates = [validated.recommended?.candidateId, validated.alternative?.candidateId]
          .filter(Boolean) as string[]
        await saveState(convState)
        console.log(JSON.stringify({
          type: 'tappyai_d3_decision', reasons: validated.reasons.length,
          tradeoffs: validated.tradeoffs.length,
          dropped: validated.dropped.length, recommended: !!validated.recommended,
          llmCalls: 1, searchCalls: 0, photoResolveCalls: 0,
          promptTokens: decisionUsage?.promptTokens ?? null,
          completionTokens: decisionUsage?.completionTokens ?? null,
          droppedCodes: validated.dropped.map(d => d.code),
        }))
        return new Response(toDataStreamBody(text, 'd3-decision'), { headers })
      }
      console.log(JSON.stringify({ type: 'tappyai_d3_fallback', why: 'no tool call' }))
    } catch (e) {
      console.log(JSON.stringify({ type: 'tappyai_d3_fallback', why: String(e).slice(0, 120) }))
    }
    // Fallback: facts we can stand behind, composed by the server. Never a
    // free-form model recommendation.
    const fallback = renderRecommendation(
      validateDecision({ recommendedId: ranked[0]?.candidateId ?? '', reasonCodes: [] }, convState, ranked),
      lang,
    )
    await saveState(convState)
    return new Response(toDataStreamBody(fallback, 'd3-fallback'), { headers })
  }

  let result
  try {
  // Provider-specific optimizations (e.g. prompt caching of this large system
  // prompt) are applied inside the active provider adapter — not here.
  result = AI.stream({
    role,
    routing: routingHints,
    // Cancel the upstream generation (and skip the onFinish memory-extraction
    // call) if the client disconnects — otherwise it runs to maxDuration billing
    // tokens for a response nobody is receiving.
    abortSignal: req.signal,
    systemShared,
    system: systemPrompt,
    messages: trimmedMessages,
    // Completion cap. Place/product replies previously hit finishReason:"length"
    // at 2048 (deterministic image/review/order URLs are token-heavy). Those are
    // now injected by streamEnrichment instead of written by the LLM (see prompt),
    // so actual output is smaller — this raised ceiling is headroom, not the norm.
    maxTokens: noToolTurn ? 300 : planningIntent ? 4096 : hasImage ? 1024 : 3072,
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
    tools: noToolTurn ? undefined : {
      ...(withholdPlaceSearch ? {} : { search_places: tool({
        description: 'Tim dia diem, nha hang, cafe, spa, khach san, diem tham quan/du lich (thang canh, bao tang, cong vien, danh lam), benh vien, giai tri (rap phim, karaoke, gym, bar...) tai Viet Nam. Voi quan an/nha hang/cafe/spa/giai tri se kem gia mon/dich vu/ve tham khao tu Google Search (Serper)',
        parameters: z.object({
          query: z.string().describe('Tu khoa tim kiem (vd: pho ngon, cafe dep, spa tot, diem tham quan)'),
          location: z.string().optional().describe('Khu vuc (vd: Ha Noi, Quan 1 Ho Chi Minh, Da Nang)'),
          type: z.enum(['restaurant', 'cafe', 'spa', 'hotel', 'bar', 'gym', 'cinema', 'attraction']).optional()
        }),
        execute: async ({ query, location, type }) => {
          console.log(JSON.stringify({ type: 'tappyai_tool_called', tool: 'search_places', query, location, placeType: type, hasLocationBias: !!userLocation }))
          const r = await searchPlaces(query, location, type, lang, userLocation)
          return forModel('search_places', budget ? applyBudgetFilter(r, budget, query) : r)
        }
      }) }),
      get_news: tool({
        description: 'Lay tin tuc moi nhat tu VnExpress, Tuoi Tre, Dan Tri',
        parameters: z.object({ query: z.string().describe('Tu khoa tin tuc can tim') }),
        execute: async ({ query }) => getNews(query, lang)
      }),
      // Task 3F-2.5: withheld once the server has already searched this turn.
      // Structural, not advisory — the model cannot re-run a search it no longer
      // has, so the "searched exactly once" property does not depend on it
      // choosing well.
      ...(locationIntent !== 'offline' && !productPreSearched ? { search_products: tool({
        description: 'Tim san pham/shop mua sam: gia tren Shopee/Tiki/Lazada, website rieng cua shop, dia chi cua hang vat ly (neu co), Facebook cua shop - tat ca tu Google Search (Serper)',
        parameters: z.object({ query: z.string().describe('Ten san pham can tim mua') }),
        execute: async ({ query }) => {
          const r = await searchProducts(query, lang)
          return forModel('search_products', budget ? applyBudgetFilter(r, budget, query) : r)
        }
      }) } : {}),
      web_search: tool({
        description: 'Tim kiem tong quat tren internet de lay thong tin moi nhat (ty gia, gia xang, su kien, kien thuc can xac thuc...) khi cac tool khac khong phu hop',
        parameters: z.object({ query: z.string().describe('Tu khoa can tim kiem (vd: ty gia USD hom nay)') }),
        execute: async ({ query }) => webSearch(query, lang)
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
        description: 'Tim gia ve may bay re gan nhat giua 2 thanh pho/san bay, du lieu tu Travelpayouts (Aviasales)',
        parameters: z.object({
          origin: z.string().describe('Diem di (ten thanh pho hoac ma san bay IATA, vd: Ha Noi, HAN)'),
          destination: z.string().describe('Diem den (ten thanh pho hoac ma san bay IATA, vd: TP HCM, SGN)'),
        }),
        execute: async ({ origin, destination }) => {
          const r = await getFlightPrices(origin, destination, lang)
          return budget ? applyBudgetFilter(r, budget, 've may bay') : r
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
          const r = await getHotelPrices(location, checkIn, checkOut, budget?.max, lang)
          return forModel('get_hotel_prices', budget ? applyBudgetFilter(r, budget, 'khach san') : r)
        }
      }),
      get_transport_options: tool({
        description: 'Tim phuong an di chuyen: ve xe khach/tau hoa giua 2 tinh/thanh pho (tim kiem web, kem link dat ve cu the), hoac uoc tinh khoang cach + gia taxi/xe cong nghe (Grab/Be/Xanh SM) cho di chuyen trong thanh pho/quang duong ngan',
        parameters: z.object({
          origin: z.string().describe('Diem di (ten tinh/thanh pho hoac dia diem cu the)'),
          destination: z.string().describe('Diem den (ten tinh/thanh pho hoac dia diem cu the)'),
          mode: z.enum(['intercity', 'taxi']).optional().describe('"intercity" cho xe khach/tau giua 2 tinh thanh, "taxi" cho di chuyen trong thanh pho/quang duong ngan bang taxi/xe cong nghe. Bo trong neu khong ro.'),
        }),
        execute: async ({ origin, destination, mode }) => getTransportOptions(origin, destination, mode === 'taxi' ? 'taxi' : undefined, lang)
      }),
      ...(authedUserId ? {
        save_price_watch: tool({
          description: 'LÆ°u theo dÃµi giÃ¡ sáº£n pháº©m Ä‘á»ƒ thÃ´ng bÃ¡o khi giÃ¡ Ä‘áº¡t má»©c mong muá»‘n. DÃ¹ng khi user nÃ³i "theo dÃµi giÃ¡", "bÃ¡o mÃ¬nh khi giÃ¡ xuá»‘ng", "alert giÃ¡", "Tappy theo dÃµi giÃ¡ X khi dÆ°á»›i Y"',
          parameters: z.object({
            product_name: z.string().describe('TÃªn sáº£n pháº©m cáº§n theo dÃµi, vÃ­ dá»¥: AirPods Pro, Samsung Galaxy S25'),
            target_price: z.number().describe('GiÃ¡ má»¥c tiÃªu báº±ng VND (sá»‘ nguyÃªn), vÃ­ dá»¥: 2000000'),
            search_query: z.string().describe('Query tÃ¬m kiáº¿m giÃ¡ sáº£n pháº©m nÃ y, vÃ­ dá»¥: AirPods Pro 2 giÃ¡ Shopee Tiki'),
          }),
          execute: async ({ product_name, target_price, search_query }) => {
            if (!authedUserId) return { error: 'Cáº§n Ä‘Äƒng nháº­p Ä‘á»ƒ theo dÃµi giÃ¡' }
            try {
              // authedUserId is already verified above via getRequestUser (cookie or
              // Bearer JWT) — use the admin client for this write instead of a fresh
              // cookie-based createClient(), which would silently find no session for
              // a Bearer-authenticated (native) request.
              const supabaseW = createAdminClient()
              const { count } = await supabaseW
                .from('price_watches')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', authedUserId)
                .eq('status', 'active')
              if ((count ?? 0) >= 10) return { error: 'Báº¡n Ä‘Ã£ theo dÃµi tá»‘i Ä‘a 10 sáº£n pháº©m. Há»§y bá»›t Ä‘á»ƒ thÃªm má»›i.' }
              const { data, error } = await supabaseW
                .from('price_watches')
                .insert({ user_id: authedUserId, product_name, target_price: Math.round(target_price), search_query })
                .select('id')
                .single()
              if (error) return { error: 'Lá»—i lÆ°u theo dÃµi: ' + error.message }
              return { ok: true, id: data.id, product_name, target_price, message: `ÄÃ£ lÆ°u! Tappy sáº½ kiá»ƒm tra giÃ¡ ${product_name} má»—i 6 tiáº¿ng vÃ  bÃ¡o báº¡n khi xuá»‘ng dÆ°á»›i ${(target_price / 1000000).toFixed(1)} triá»‡u.` }
            } catch (e) {
              return { error: String(e) }
            }
          }
        }),
      } : {}),
    },
    onFinish: async ({ usage, finishReason, text, steps }) => {
      // Prompt-cache accounting. `usage` is already the SUM across steps, but
      // cache counters are reported per step (any top-level copy carries only
      // the LAST step), so they are summed here. The provider reports
      // promptTokens EXCLUDING cached tokens, so the real prompt size is
      // promptTokens + cacheCreationTokens + cacheReadTokens — never read
      // promptTokens alone as "how big was the prompt".
      //
      // The per-step shape is vendor-specific and is read through the adapter
      // (AI.usageMetrics), not here. Reading it inline used to bind this route
      // to one vendor: the counters would silently go null under any other
      // provider — cost telemetry going dark exactly when a provider change
      // makes it matter most.
      let cacheReadTokens = 0
      let cacheCreationTokens = 0
      let sawCacheMetadata = false
      for (const step of steps ?? []) {
        // null means "not reported"; 0 means "reported as zero". Only the
        // former leaves sawCacheMetadata false.
        const { cacheReadTokens: read, cacheCreationTokens: created } = AI.usageMetrics(step)
        if (read !== null) { cacheReadTokens += read; sawCacheMetadata = true }
        if (created !== null) { cacheCreationTokens += created; sawCacheMetadata = true }
      }
      console.log(JSON.stringify({
        type: 'tappyai_usage',
        intent,
        finishReason,
        promptTokens: usage?.promptTokens ?? null,
        completionTokens: usage?.completionTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        // null (not 0) when the provider reported no cache metadata at all, so
        // "caching is off/unsupported" stays distinguishable from "0 hits".
        cacheReadTokens: sawCacheMetadata ? cacheReadTokens : null,
        cacheCreationTokens: sawCacheMetadata ? cacheCreationTokens : null,
        // One LLM request per step — the direct measure the cost work is judged on.
        // The memory-extraction generate() below is a SEPARATE call not counted
        // here; memoryExtract is its 0/1 flag, so total LLM calls = llmCalls + memoryExtract.
        llmCalls: steps?.length ?? null,
        memoryExtract: (authedUserId && worthExtract) ? 1 : 0,
        toolCalls: (steps ?? []).reduce((n, s) => n + (s.toolCalls?.length ?? 0), 0),
        elapsedMs: Date.now() - startTime,
        worthExtract,
        forcedTool,
        // Consultative cost shape, per turn. `searchCalls` counts BOTH the
        // model's tool calls and the server-side product pre-search, so a turn
        // that reuses held evidence is visibly 0 and a duplicate search cannot
        // hide behind the pre-search path.
        responseMode,
        searchCalls: (steps ?? []).reduce(
          (n, s) => n + (s.toolCalls ?? []).filter(t => /search/i.test(t.toolName)).length, 0,
        ) + (productPreSearched ? 1 : 0),
        candidateCount: convState?.candidates.length ?? 0,
        unseenCandidates: unseenCandidateCount(convState),
        maxImages: mediaBudget.maxImages,
      }))
      if (authedUserId && worthExtract) {
        try {
          const convMessages = [
            ...trimmedMessages.map((m: { role: string; content: unknown }) => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })),
            { role: 'assistant', content: text },
          ]
          const extracted = await extractMemoryFromConversation(convMessages, existingMemory)
          if (Object.keys(extracted).length > 0) {
            // Write with the admin client (pinned user_id) so the upsert works
            // under Bearer-token (native) auth — a fresh cookie client would
            // have no session and RLS would silently drop the write.
            await updateMemory(authedUserId, {
              location_base: extracted.location_base ?? existingMemory?.location_base ?? null,
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
  // What KIND of turn this is, and therefore how much media it may spend. Only
  // the turn that first puts options in front of the user earns images.
  const responseMode = decideResponseMode({
    stage: decisionStage,
    moreOptions: consultationDelta?.moreOptions ?? false,
    hadCandidatesBefore,
  })
  const mediaBudget = mediaBudgetFor(responseMode)

  const baseResponse = result.toDataStreamResponse()
  // B7-A: photos are fetched only for the places the finished reply actually
  // names — the filter selects them, this resolves them. Each place degrades to
  // "no photo" independently; one slow or failing lookup never blocks the rest.
  const enrichedResponse = applyPlaceEnrichmentStreamFilter(baseResponse, lang, enrichment, async (places) => {
    const byName = new Map<string, string[]>()
    // Media policy decides BEFORE the provider is called, so a photo that would
    // not be rendered is never paid for. Measured before this: three places
    // named x three photos each = nine fetches and nine images, repeated on
    // every follow-up turn about the same places.
    const budgeted = placesWithinBudget(places, mediaBudget)
    if (budgeted.length === 0) {
      console.log(JSON.stringify({ type: 'tappyai_media', responseMode, photoResolveCalls: 0, imagesReturned: 0, placesNamed: places.length }))
      return byName
    }
    let imagesReturned = 0
    await Promise.all(budgeted.map(async (p) => {
      if (!p.name) return
      try {
        const urls = await resolvePlacePhotos(
          { place_id: p.place_id, name: p.name, website_uri: p.website_uri },
          mediaBudget.photosPerPlace,
        )
        if (urls.length > 0) {
          const room = Math.max(0, mediaBudget.maxImages - imagesReturned)
          const take = urls.slice(0, Math.min(mediaBudget.photosPerPlace, room))
          if (take.length > 0) { byName.set(p.name, take); imagesReturned += take.length }
        }
      } catch { /* this place simply gets no photo */ }
    }))
    console.log(JSON.stringify({ type: 'tappyai_media', responseMode, photoResolveCalls: budgeted.length, imagesReturned, placesNamed: places.length }))
    return byName
  }, async (evidence) => {
    // Task 3C: record what the tools actually returned this turn, so the NEXT
    // turn can recommend from evidence instead of from the model's own prose.
    // Only tool-supplied fields are stored — there is no slot the model can fill.
    if (!convState) return
    // REPLACE, never merge: a new search answers a changed question, and mixing
    // this turn's evidence with the previous turn's is exactly how a stale price
    // gets presented as current. No search this turn -> keep what we had.
    if (freshCandidates.length > 0) {
      convState.candidates = filterIrrelevantProducts(freshCandidates, convState)
      convState.lastSearchContext = { query: lastText.slice(0, 120), tool: 'mixed', at: Date.now() }
    }
    // Task 3F-2: record HOW the search ended, so the next turn can tell "there
    // is nothing" apart from "we could not look". Only overwritten when a search
    // actually ran — a no-tool turn must not erase the previous outcome.
    // What the user was actually shown, as canonical ids. Two sources, one
    // record: candidates a search produced this turn, and HELD candidates the
    // reply named without searching. The second is what reuse turns depend on —
    // without it a rejection after a reuse turn landed on whatever was shown
    // several turns earlier, leaving the option the user just rejected eligible.
    const shownIds = [
      ...(evidence.presentedIds ?? []),
      ...freshCandidates.filter(c => (evidence.presentedNames ?? []).includes(c.name)).map(c => c.candidateId),
    ]
    if (shownIds.length > 0) {
      // ACCUMULATE across the consultation: everything the user has seen stays
      // seen. Replacing the list would make a candidate shown two turns ago
      // "unseen" again and offer it back as a fresh option.
      convState.presentedCandidates = [...new Set([...(convState.presentedCandidates ?? []), ...shownIds])]
      // …and record THIS reply separately, because "quán đó" means what was
      // just said, not everything shown so far.
      convState.lastPresentedCandidates = [...new Set(shownIds)]
    }
    if (anySearchRan) {
      convState.lastSearchOutcome = anySearchFailed ? 'failed' : freshCandidates.length > 0 ? 'ok' : 'empty'
    }
    // Identity grounding on the PRESENTATION turn, measured rather than assumed.
    // The decision turn composes its own prose (D3) and cannot fabricate; this
    // turn still writes freely, and it was caught naming venues the tool never
    // returned. Reported only — editing the reply here would be the
    // post-generation mutation this project ruled out.
    const ungrounded = evidence.ungroundedNames ?? []
    if (ungrounded.length > 0) {
      console.log(JSON.stringify({
        type: 'tappyai_identity_ungrounded', count: ungrounded.length,
        presented: (evidence.presentedNames ?? []).length,
        candidates: convState.candidates.length, preSearched: placePreSearched || productPreSearched,
      }))
    }
    await saveState(convState)
    // The filter needs the held pool to tell which candidates a NON-searching
    // turn named. Names for matching, ids for the record.
  }, {
    places: preSearchSeed?.places ?? [],
    productRecords: preSearchSeed?.productRecords ?? [],
    productQueries: preSearchSeed?.productQueries ?? [],
    heldCandidates: (convState?.candidates ?? []).map(c => ({ candidateId: c.candidateId, name: c.name })),
  })
  const finalResponse = (budget && budget.max < LUXURY_PRICE_FLOOR)
    ? applyLuxuryStreamFilter(enrichedResponse)
    : enrichedResponse
  // Persist the incremented anonymous question count for the day.
  if (anonSetCookie) finalResponse.headers.set('Set-Cookie', anonSetCookie)
  // The client needs the id to continue this conversation on the next turn. A
  // header rather than a stream frame: the AI SDK data protocol is shared with
  // every existing client, and an unknown frame type would break the ones that
  // have not been updated. Absent header simply means "state is off".
  if (conversationId) {
    finalResponse.headers.set('X-Conversation-Id', conversationId)
    finalResponse.headers.set('Access-Control-Expose-Headers', 'X-Conversation-Id')
  }
  return finalResponse
}

