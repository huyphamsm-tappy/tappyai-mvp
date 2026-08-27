import { tool } from 'ai'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { timeClientEmit } from './emitTiming'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccountRestriction, accountRestrictionMessage, accountRestrictionCode } from '@/lib/account/accountStatus'
import { buildMemoryBlock, extractMemoryFromConversation, updateMemory, type UserMemory } from '@/lib/memory/memoryService'
import { webSearch, resolvePlacePhotos } from '@/lib/ai/tools/common'
import { getWeather, getGoldPrice } from '@/lib/ai/tools/weather'
import { searchProducts } from '@/lib/ai/tools/shopping'
import { getNews, searchPlaces } from '@/lib/ai/tools/food'
import { getFlightPrices, getHotelPrices, getTransportOptions } from '@/lib/ai/tools/travel'
import { AI, type ModelRole } from '@/lib/ai/llm'
import { validateClientInput, readDecisionEvidenceId } from '@/lib/ai/security/clientInput'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { fenceUntrusted } from '@/lib/ai/security/fence'
import { classifyIntent, detectLang, detectExplicitLangRequest, detectForcedTool, detectTravelIntent, detectLocationIntent, detectPlanningIntent, detectMovieRecommendationIntent, isSimpleQuery } from '@/lib/ai/intent'
import { deriveNeedProfile, type StoredPreferences } from '@/lib/ai/consultative/needProfile'
import { resolveDecisionStage, taskSwitched } from '@/lib/ai/consultative/refinement'
import { normalizePlaces, normalizeHotels, normalizeShopping, type Candidate } from '@/lib/ai/consultative/candidate'
import { rankCandidates } from '@/lib/ai/consultative/rank'
import { shortlistShopping, shortlistCandidates } from '@/lib/ai/consultative/shortlist'
import { proposeRelaxation } from '@/lib/ai/consultative/relaxation'
import { classifyTurnIntent } from '@/lib/ai/consultative/intentGate'
import { derivePick, buildPickPayload, buildRankingInstructionBlock, buildShoppingGroundingBlock, isExplicitChoiceRequest, hasImplicitPurchaseIntent } from '@/lib/ai/consultative/pick'
import { buildShoppingSynthesis, buildSynthesisPayload, buildSynthesisInstructionBlock } from '@/lib/ai/consultative/synthesis'
import { buildSynthesisView, renderShoppingMarker } from '@/lib/ai/consultative/synthesisView'
import { buildDecisionEvidence, renderDecisionEvidenceBlock, renderMissingEvidenceBlock, type DecisionEvidence } from '@/lib/ai/consultative/decisionEvidence'
import { resolveTripContext, buildTransportModeBlock } from '@/lib/ai/consultative/tripContext'
import { pw, normalizePwLang } from '@/lib/priceWatch/messages'
import { type Budget, extractBudget, applyBudgetFilter, LUXURY_PRICE_FLOOR, applyLuxuryStreamFilter } from '@/lib/ai/budget'
import { buildSystem, buildSystemSimple, buildPrefBlock } from '@/lib/ai/promptBuilder'
import { applyPlaceEnrichmentStreamFilter } from '@/lib/ai/streamEnrichment'
import { splitToolResult, createEnrichmentCollector } from '@/lib/ai/toolResultSplit'
import { shouldExtractMemory } from '@/lib/ai/memoryGate'
import { sanitizePriorAssistantContent } from '@/lib/ai/sanitizePriorAssistantContent'
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
  // A "recommend me a movie/show" turn must NOT be routed to the place search
  // (which answers with cinemas). We drop search_places for the turn so the model
  // recommends titles from film knowledge; a venue/showtime ask keeps the tool.
  const movieRecommend = detectMovieRecommendationIntent(lastText)
  // Response language = the user's LATEST message, unless they explicitly ask
  // for another one ("Answer in English", "Trả lời bằng tiếng Việt") — that
  // request always wins. Never derived from UI locale, browser language,
  // profile, country, or earlier turns (none of those are read here).
  const lang = detectExplicitLangRequest(lastText) ?? detectLang(lastText)
  const forcedTool = detectForcedTool(lastText)
  // P0: a travel turn buffers and runs the fail-closed dynamic-fact guard, so no
  // fabricated fare/price/schedule/availability can reach the user.
  const travelIntent = detectTravelIntent(lastText)
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

  try {
    const { user, supabase } = await getRequestUser(req)
    // Anonymous sessions qualify: a Supabase anonymous identity is a real
    // auth.uid() on the `authenticated` role, which is exactly what the RPCs
    // key on. Guests are the majority web path and the one that fabricated.
    if (user) evidenceDb = supabase
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

      // Four reads that need nothing but `user.id` and never feed each other.
      // Run serially they were ~2-3s of dead air before the model was even
      // called (measured on prod 1e6c867: authenticated TTFB 3.6-4.0s against
      // 1.0s anonymous on the same tool-free question).
      //
      // Their position AFTER the restriction gate is deliberately unchanged: a
      // blocked account still returns above, so it still costs no LLM tokens and
      // no third-party calls. Only the four post-gate reads move in parallel.
      const [chatContext, calendarBlock, subResult, todayMsgCount] = await Promise.all([
        buildChatPromptContext(user.id, supabase),
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
        // Speculative on purpose. The count is only ENFORCED for non-Pro users,
        // but waiting for `isPro` to decide whether to ask would put this read
        // straight back on the serial path it was moved off. A Pro user's count
        // is computed and then ignored: one read, no behavioural change.
        //
        // Shared VN-day measurement from @/lib/config/product — the same helper
        // the subscription page displays from, so display and enforcement can
        // never disagree.
        countTodayUserMessages(supabase, user.id),
      ])

      existingMemory = chatContext.memory
      if (existingMemory) memoryBlock = buildMemoryBlock(existingMemory, forcedTool)
      if (chatContext.prefs) { prefBlock = buildPrefBlock(chatContext.prefs); storedPrefs = chatContext.prefs }
      // Appended AFTER the memory block is built, exactly as the sequential
      // version did — calendar events extend the memory block, never replace it.
      if (calendarBlock) memoryBlock = (memoryBlock || '') + calendarBlock

      const subData = subResult.data
      if (subData?.status === 'active' && subData?.current_period_end) {
        isPro = new Date(subData.current_period_end) > new Date()
      }

      if (!isPro && todayMsgCount >= FREE_DAILY_LIMIT) {
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
  const rankForModel = (toolName: 'search_places' | 'get_hotel_prices' | 'search_products', result: unknown) => {
    if (!result || typeof result !== 'object') return { result, pick: null }
    const r = result as Record<string, unknown>
    const candidates = toolName === 'search_places' ? normalizePlaces(r)
      : toolName === 'get_hotel_prices' ? normalizeHotels(r)
        : normalizeShopping(r)
    if (candidates.length < 2) return { result, pick: null }

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
      const sl = shortlistCandidates(ranked.ranked, 3)
      if (sl.selected.length > 0) {
        (result as Record<string, unknown>)._tappy_shortlist = sl.selected.map((s, idx) => ({
          rank: idx,
          id: s.entry.candidate.id,
          name: s.entry.candidate.name,
          role: s.role,
        }))
      }
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
  const modelMessages = trimmedMessages.map((m) => {
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
  })

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
  /** onFinish accounting, captured synchronously so the flush-time record can ship it. */
  let usageAcct: {
    finishReason: string
    promptTokens: number | null; completionTokens: number | null; totalTokens: number | null
    cacheReadTokens: number | null; cacheCreationTokens: number | null
    llmCalls: number | null; toolCalls: number
  } | null = null

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
    tools: noToolTurn ? undefined : timeTools({
      // A movie/show RECOMMENDATION turn drops the place search entirely, so the
      // model can't answer "recommend a movie" with a list of cinemas — it
      // recommends titles from film knowledge instead (see detectMovieRecommendationIntent).
      ...(movieRecommend ? {} : { search_places: tool({
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
          if (!pick) return forModel('search_products', result)
          const evidenceBlock = await freezeShoppingEvidence(result, pick, shortlistedCandidates)
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
            _tappy_ranking: buildPickPayload(pick),
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
  // ── Phase 2: photo-enrichment tail instrumentation ────────────────────────
  // Declared out here because the resolver closure fills them while the usage
  // record — emitted after the last byte leaves — reads them. Diagnostic only.
  type PhotoStepAgg = { n: number; totalMs: number; maxMs: number; hits: number; timeouts: number }
  const photoSteps: Partial<Record<'website' | 'places_detail' | 'places_media' | 'serper', PhotoStepAgg>> = {}
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
          { place_id: p.place_id, name: p.name, website_uri: p.website_uri },
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
  }, undefined, undefined, travelIntent, lastText)
  const finalResponse = (budget && budget.max < LUXURY_PRICE_FLOOR)
    ? applyLuxuryStreamFilter(enrichedResponse)
    : enrichedResponse
  // Persist the incremented anonymous question count for the day.
  if (anonSetCookie) finalResponse.headers.set('Set-Cookie', anonSetCookie)
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
    console.log(JSON.stringify({
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
      elapsedMs: Date.now() - startTime,
      preModelMs,
      ttftMs: firstTokenAt === null ? null : firstTokenAt - startTime,
      generationMs: firstTokenAt === null ? null : (modelFinishAt ?? Date.now()) - firstTokenAt,
      // T9 generation complete; T7 first content the client can SEE (== ttft on a
      // live turn, the whole-reply emit on a buffered one); postModelMs is the
      // enrichment/emit tail between T9 and the final byte.
      modelFinishMs: modelFinishAt === null ? null : modelFinishAt - startTime,
      ttuaMs,
      postModelMs: modelFinishAt === null ? null : Date.now() - modelFinishAt,
      // Splits the tool-turn gap: firstStepFinishMs closes the tool-planning step,
      // toolMs is the summed tool execute() time.
      firstStepFinishMs,
      toolMs: toolMs > 0 ? toolMs : null,
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
      providerId: AI.providerId(),
      modelRole: role,
      retryCount: 'unknown',
      worthExtract,
      forcedTool,
    }))
  }
  const timedBody = finalResponse.body
    ? finalResponse.body.pipeThrough(timeClientEmit(startTime, Date.now, (t) => logUsage(t.ttuaMs)))
    : finalResponse.body
  return new Response(timedBody, { status: finalResponse.status, headers: finalResponse.headers })
}

