import { tool } from 'ai'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccountRestriction, accountRestrictionMessage, accountRestrictionCode } from '@/lib/account/accountStatus'
import { buildMemoryBlock, extractMemoryFromConversation, updateMemory, type UserMemory } from '@/lib/memory/memoryService'
import { webSearch, resolvePlacePhotos } from '@/lib/ai/tools/common'
import { getWeather, getGoldPrice } from '@/lib/ai/tools/weather'
import { searchProducts } from '@/lib/ai/tools/shopping'
import { getNews, searchPlaces } from '@/lib/ai/tools/food'
import { getFlightPrices, getHotelPrices, getTransportOptions } from '@/lib/ai/tools/travel'
import { AI, type ModelRole } from '@/lib/ai/llm'
import { validateClientInput } from '@/lib/ai/security/clientInput'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { fenceUntrusted } from '@/lib/ai/security/fence'
import { classifyIntent, detectLang, detectExplicitLangRequest, detectForcedTool, detectLocationIntent, detectPlanningIntent, isSimpleQuery } from '@/lib/ai/intent'
import { deriveNeedProfile, type StoredPreferences } from '@/lib/ai/consultative/needProfile'
import { resolveDecisionStage } from '@/lib/ai/consultative/refinement'
import { normalizePlaces, normalizeHotels, normalizeShopping } from '@/lib/ai/consultative/candidate'
import { rankCandidates } from '@/lib/ai/consultative/rank'
import { shortlistShopping } from '@/lib/ai/consultative/shortlist'
import { derivePick, buildPickPayload, buildRankingInstructionBlock, buildShoppingGroundingBlock, isExplicitChoiceRequest } from '@/lib/ai/consultative/pick'
import { resolveTripContext, buildTransportModeBlock } from '@/lib/ai/consultative/tripContext'
import { pw, normalizePwLang } from '@/lib/priceWatch/messages'
import { type Budget, extractBudget, applyBudgetFilter, LUXURY_PRICE_FLOOR, applyLuxuryStreamFilter } from '@/lib/ai/budget'
import { buildSystem, buildSystemSimple, buildPrefBlock } from '@/lib/ai/promptBuilder'
import { applyPlaceEnrichmentStreamFilter } from '@/lib/ai/streamEnrichment'
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

  // resolveDecisionStage defers to the shipped detectDecisionStage whenever it
  // fires, and fills the gap where it returns null but the structured need
  // actually changed — "nâng ngân sách lên 35 triệu" is a refinement because a
  // budget moved, not because it contains a keyword. See consultative/refinement.ts.
  const decisionStage = resolveDecisionStage(messages)

  // Load user memory + kiểm tra freemium limit. Quota values + measurement live
  // in @/lib/config/product — the single owner of every business value.
  let memoryBlock = ''
  let prefBlock = ''
  /** Durable preferences, reused by the need profile as a LOW-WEIGHT prior. */
  let storedPrefs: StoredPreferences | null = null
  let authedUserId: string | null = null
  let existingMemory: UserMemory | null = null
  let isPro = false
  // True once a token-based ANONYMOUS session's quota was enforced server-side
  // (keyed by anonymous_id) — the legacy cookie counter below is then skipped.
  let anonQuotaByToken = false
  /**
   * The count the token authority reported, mirrored into the cookie.
   *
   * ============================================================================
   * WHY THE COOKIE IS MIRRORED AND NOT MERELY SKIPPED — dual-authority closure
   * ============================================================================
   * There are two anonymous counters: the `anon_chat_usage` row (keyed by anonymous_id,
   * durable) and the `tappy_anon` cookie (keyed by browser). The row is authoritative; the
   * cookie exists so a guest is still capped when the RPC is unavailable.
   *
   * 🚨 They were INDEPENDENT, which made the fallback a second allowance: a guest who used
   * all five through the RPC and then hit one transient RPC failure met a cookie counter that
   * had never been written and started again at zero. "Authoritative with a fallback" only
   * holds if the fallback inherits what the authority already counted.
   *
   * Mirroring costs one header on a request that is already setting none. The row stays the
   * authority — the cookie is never read while the RPC answers, and a cleared cookie still
   * cannot raise the cap, because the row is what the next successful call reads.
   */
  let anonTokenCount: number | null = null
  try {
    const { user, supabase } = await getRequestUser(req)
    if (user?.is_anonymous) {
      // Anonymous session minted by POST /api/auth/anonymous. Same Bearer
      // pipeline as logged-in users (getRequestUser verified the JWT); quota is
      // keyed by anonymous_id = auth.uid() inside a SECURITY DEFINER function —
      // the client never sends or computes quota information. No memory,
      // preferences, or subscription lookups for anonymous identities.
      const { data: usedToday, error: quotaError } = await supabase.rpc('anon_chat_usage_increment')
      if (!quotaError && typeof usedToday === 'number') {
        anonQuotaByToken = true
        anonTokenCount = usedToday
        if (usedToday > ANON_DAILY_LIMIT) {
          return new Response(
            JSON.stringify({
              error: 'anon_limit_reached',
              message: serverMessage('chat.anonLimit', requestLocale(req), { n: ANON_DAILY_LIMIT }),
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
      const chatContext = await buildChatPromptContext(user.id, supabase)
      existingMemory = chatContext.memory
      if (existingMemory) memoryBlock = buildMemoryBlock(existingMemory, forcedTool)
      if (chatContext.prefs) { prefBlock = buildPrefBlock(chatContext.prefs); storedPrefs = chatContext.prefs }

      // Inject Google Calendar events if connected
      try {
        const { getUpcomingEvents, formatEventsForPrompt } = await import('@/lib/integrations/googleCalendar')
        const calEvents = await getUpcomingEvents(user.id)
        if (calEvents.length > 0) {
          memoryBlock = (memoryBlock || '') + formatEventsForPrompt(calEvents)
        }
      } catch { /* calendar optional */ }

        // Kiểm tra subscription từ DB
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', user.id)
        .single()
      if (subData?.status === 'active' && subData?.current_period_end) {
        isPro = new Date(subData.current_period_end) > new Date()
      }

      if (!isPro) {
        // Đếm số tin nhắn user đã gửi hôm nay (theo giờ VN UTC+7).

        // Ước tính số message từ conversations hôm nay — đơn giản: nếu vượt FREE_DAILY_LIMIT thì chặn.
        // Cách chính xác hơn cần track message count riêng — dùng tạm cách này cho MVP.
        // Shared VN-day measurement from @/lib/config/product — the same helper
        // the subscription page displays from, so display and enforcement can
        // never disagree. (Also drops a redundant count-only query this route
        // used to run and never read.)
        const totalMsgs = await countTodayUserMessages(supabase, user.id)

        if (totalMsgs >= FREE_DAILY_LIMIT) {
          return new Response(
            JSON.stringify({
              error: 'free_limit_reached',
              message: serverMessage('chat.freeLimit', requestLocale(req), { n: FREE_DAILY_LIMIT }),
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
  if (anonTokenCount !== null) {
    // Mirror the authoritative count into the fallback counter — see `anonTokenCount`. Written
    // even when the RPC has already refused this request, so a guest at the cap stays at the cap
    // if the next request has to fall back.
    anonSetCookie = `tappy_anon=${vnToday()}:${anonTokenCount}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax; Secure`
  } else if (!authedUserId && !anonQuotaByToken) {
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
          message: serverMessage('chat.anonLimit', requestLocale(req), { n: ANON_DAILY_LIMIT }),
          upgradeUrl: '/login',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
    anonSetCookie = `tappy_anon=${today}:${anonCount + 1}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax; Secure`
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
  const enrichment = createEnrichmentCollector()
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

  // Whether this turn ASKED Tappy to decide. The need profile cannot carry it —
  // it models what the user wants from the PRODUCT, not what they want from us —
  // and only the route knows which message is the current one.
  const pickSignals = { explicitChoiceRequest: isExplicitChoiceRequest(lastText) }

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
  const rankForModel = (toolName: 'search_places' | 'get_hotel_prices' | 'search_products', result: unknown) => {
    if (!result || typeof result !== 'object') return { result, pick: null }
    const r = result as Record<string, unknown>
    const candidates = toolName === 'search_places' ? normalizePlaces(r)
      : toolName === 'get_hotel_prices' ? normalizeHotels(r)
        : normalizeShopping(r)
    if (candidates.length < 2) return { result, pick: null }

    const ranked = rankCandidates(candidates, needProfile)
    if (!ranked.rankable) return { result, pick: null }

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
      } else {
        r[key] = [...sorted, ...untouched]
      }
    }

    return { result: r, pick: derivePick(ranked, needProfile, pickSignals) }
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
  // The ranking instruction is only carried on turns that can actually produce a
  // ranked result — Places and Hotel are the two domains with structured
  // candidate attributes today. A weather or gold lookup pays nothing for it.
  const isDecisionDomain = needProfile.domain === 'places'
    || needProfile.domain === 'hotel'
    || needProfile.domain === 'shopping'

  // The transport-mode stage is decided HERE, deterministically, not by the
  // model noticing it should ask. resolveTripContext folds the history, so the
  // question is asked exactly once and never on a non-trip turn.
  const tripContext = resolveTripContext(messages)

  const consultativeBlock = [
    isDecisionDomain ? buildRankingInstructionBlock() : '',
    // Shopping evidence carries price/store/rating and nothing else, so the
    // model must be told what it may NOT assert — measured live 2026-08-17
    // asserting weight and battery that no candidate supplied.
    needProfile.domain === 'shopping' ? buildShoppingGroundingBlock() : '',
    tripContext.shouldAskTransportMode ? buildTransportModeBlock() : '',
  ].filter(Boolean).join('')

  const built = noToolTurn ? null : buildSystem(
    budget, locationIntent, isFirstReply, memoryBlock, lang, prefBlock, userLocation, planningIntent, hasImage, decisionStage,
    consultativeBlock || undefined,
  )
  const systemShared = built?.shared
  const systemPrompt = (built ? built.dynamic : buildSystemSimple(lang, memoryBlock)) + styleBlock

  let result
  try {
  // Provider-specific optimizations (e.g. prompt caching of this large system
  // prompt) are applied inside the active provider adapter — not here.
  result = AI.stream({
    role,
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
      search_places: tool({
        description: 'Tim dia diem, nha hang, cafe, spa, khach san, diem tham quan/du lich (thang canh, bao tang, cong vien, danh lam), benh vien, giai tri (rap phim, karaoke, gym, bar...) tai Viet Nam. Voi quan an/nha hang/cafe/spa/giai tri se kem gia mon/dich vu/ve tham khao tu Google Search (Serper)',
        parameters: z.object({
          query: z.string().describe('Tu khoa tim kiem (vd: pho ngon, cafe dep, spa tot, diem tham quan)'),
          location: z.string().optional().describe('Khu vuc (vd: Ha Noi, Quan 1 Ho Chi Minh, Da Nang)'),
          type: z.enum(['restaurant', 'cafe', 'spa', 'hotel', 'bar', 'gym', 'cinema', 'attraction']).optional()
        }),
        execute: async ({ query, location, type }) => {
          console.log(JSON.stringify({ type: 'tappyai_tool_called', tool: 'search_places', query, location, placeType: type, hasLocationBias: !!userLocation }))
          const r = await searchPlaces(query, location, type, lang, userLocation)
          const filtered = budget ? applyBudgetFilter(r, budget, query) : r
          // Deterministic ranking runs BEFORE the model sees the result, so the
          // order it reads is already the order that fits this user.
          const { result, pick } = rankForModel('search_places', filtered)
          if (pick) turnPick = pick
          return forModel('search_places', pick
            ? { ...(result as Record<string, unknown>), _tappy_ranking: buildPickPayload(pick) }
            : result)
        }
      }),
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
          const { result, pick } = rankForModel('search_products', filtered)
          if (pick) turnPick = pick
          return forModel('search_products', pick
            ? { ...(result as Record<string, unknown>), _tappy_ranking: buildPickPayload(pick) }
            : result)
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
          const filtered = budget ? applyBudgetFilter(r, budget, 'khach san') : r
          const { result, pick } = rankForModel('get_hotel_prices', filtered)
          if (pick) turnPick = pick
          return forModel('get_hotel_prices', pick
            ? { ...(result as Record<string, unknown>), _tappy_ranking: buildPickPayload(pick) }
            : result)
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
          description: 'Lưu theo dõi giá sản phẩm để thông báo khi giá đạt mức mong muốn. Dùng khi user nói "theo dõi giá", "báo mình khi giá xuống", "alert giá", "Tappy theo dõi giá X khi dưới Y"',
          parameters: z.object({
            product_name: z.string().describe('Tên sản phẩm cần theo dõi, ví dụ: AirPods Pro, Samsung Galaxy S25'),
            target_price: z.number().describe('Giá mục tiêu bằng VND (số nguyên), ví dụ: 2000000'),
            search_query: z.string().describe('Query tìm kiếm giá sản phẩm này, ví dụ: AirPods Pro 2 giá Shopee Tiki'),
          }),
          execute: async ({ product_name, target_price, search_query }) => {
            if (!authedUserId) return { error: pw.needLogin(pwLang) }
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
              if ((count ?? 0) >= 10) return { error: pw.limitReached(pwLang) }
              const { data, error } = await supabaseW
                .from('price_watches')
                .insert({ user_id: authedUserId, product_name, target_price: Math.round(target_price), search_query })
                .select('id')
                .single()
              if (error) {
                console.error('[chat/save_price_watch] insert failed:', error.code ?? error.message)
                return { error: pw.saveError(pwLang) }
              }
              return { ok: true, id: data.id, product_name, target_price, message: pw.saved(pwLang, product_name, Math.round(target_price)) }
            } catch (e) {
              // W2/C44 — String(e) put a raw exception into a tool result the model then reads out.
              console.error('[chat/save_price_watch] failed:', e instanceof Error ? e.message : e)
              return { error: pw.saveError(pwLang) }
            }
          }
        }),
      } : {}),
    },
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
  const baseResponse = result.toDataStreamResponse()
  // B7-A: photos are fetched only for the places the finished reply actually
  // names — the filter selects them, this resolves them. Each place degrades to
  // "no photo" independently; one slow or failing lookup never blocks the rest.
  const enrichedResponse = applyPlaceEnrichmentStreamFilter(baseResponse, lang, enrichment, async (places) => {
    const byName = new Map<string, string[]>()
    await Promise.all(places.map(async (p) => {
      if (!p.name) return
      try {
        const urls = await resolvePlacePhotos(
          { place_id: p.place_id, name: p.name, website_uri: p.website_uri },
          3,
        )
        if (urls.length > 0) byName.set(p.name, urls)
      } catch { /* this place simply gets no photo */ }
    }))
    return byName
  })
  const finalResponse = (budget && budget.max < LUXURY_PRICE_FLOOR)
    ? applyLuxuryStreamFilter(enrichedResponse)
    : enrichedResponse
  // Persist the incremented anonymous question count for the day.
  if (anonSetCookie) finalResponse.headers.set('Set-Cookie', anonSetCookie)
  return finalResponse
}

