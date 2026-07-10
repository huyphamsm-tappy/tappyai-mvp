import { streamText, tool } from 'ai'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMemoryBlock, extractMemoryFromConversation, updateMemory, type UserMemory } from '@/lib/memory/memoryService'
import { webSearch } from '@/lib/ai/tools/common'
import { getWeather, getGoldPrice } from '@/lib/ai/tools/weather'
import { searchProducts } from '@/lib/ai/tools/shopping'
import { getNews, searchPlaces } from '@/lib/ai/tools/food'
import { getFlightPrices, getHotelPrices, getTransportOptions } from '@/lib/ai/tools/travel'
import { getModel, type ModelTier } from '@/lib/ai/provider'
import { classifyIntent, detectLang, detectForcedTool, detectLocationIntent, detectPlanningIntent, isSimpleQuery, isShoppingQuery } from '@/lib/ai/intent'
import { type Budget, extractBudget, applyBudgetFilter, LUXURY_PRICE_FLOOR, applyLuxuryStreamFilter } from '@/lib/ai/budget'
import { buildSystem, buildSystemSimple, buildPrefBlock } from '@/lib/ai/promptBuilder'
import { applyPlaceEnrichmentStreamFilter } from '@/lib/ai/streamEnrichment'
import { buildChatPromptContext } from '@/lib/ai/contextBuilder'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'

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

  const { messages, userLocation: rawUserLocation, userPreferences: rawUserPrefs, responseStyle: rawResponseStyle } = await req.json()

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
  const lang = detectLang(lastText)
  const forcedTool = detectForcedTool(lastText)
  const worthExtract = lastText.trim().length > 20
  const userMessages = messages.filter((m: { role: string }) => m.role === 'user')
  const isFirstReply = userMessages.length <= 1

  // Load user memory + kiá»ƒm tra freemium limit
  // Free (logged-in) daily cap. Temporarily 15/day during the free test phase —
  // Pro upgrade is hidden until we have a legal entity for payments, so when this
  // runs out we tell the user to come back tomorrow instead of upselling Pro.
  const FREE_DAILY_LIMIT = 15
  let memoryBlock = ''
  let prefBlock = ''
  let authedUserId: string | null = null
  let existingMemory: UserMemory | null = null
  let isPro = false
  try {
    const { user, supabase } = await getRequestUser(req)
    if (user) {
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
        const now = new Date()
        const vnOffset = 7 * 60 * 60 * 1000
        const vnMidnight = new Date(Math.floor((now.getTime() + vnOffset) / 86400000) * 86400000 - vnOffset)
        const { count } = await supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('updated_at', vnMidnight.toISOString())

        // Æ¯á»›c tÃ­nh sá»‘ message tá»« conversations hÃ´m nay â€” Ä‘Æ¡n giáº£n: náº¿u > FREE_DAILY_LIMIT conversations thÃ¬ cháº·n
        // CÃ¡ch chÃ­nh xÃ¡c hÆ¡n cáº§n track message count riÃªng â€” dÃ¹ng táº¡m cÃ¡ch nÃ y cho MVP
        const { data: todayConvs } = await supabase
          .from('conversations')
          .select('messages')
          .eq('user_id', user.id)
          .gte('updated_at', vnMidnight.toISOString())

        const totalMsgs = (todayConvs || []).reduce((sum, c) => {
          const msgs = Array.isArray(c.messages) ? c.messages : []
          return sum + msgs.filter((m: { role: string }) => m.role === 'user').length
        }, 0)

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
  } catch { /* no-op if auth fails */ }

  // Freemium policy: anonymous visitors get a small taste — FREE_ANON_LIMIT basic
  // questions per day — then must log in. The count lives in an httpOnly cookie
  // (server-set, so ordinary users can't tamper; clearing cookies resets it,
  // which is acceptable for a top-of-funnel teaser). Everything past chat
  // (reviews, saves, upload, …) still requires an account.
  const FREE_ANON_LIMIT = 5
  let anonSetCookie: string | null = null
  if (!authedUserId) {
    const nowMs = Date.now()
    const vnToday = new Date(Math.floor((nowMs + 7 * 60 * 60 * 1000) / 86400000) * 86400000).toISOString().slice(0, 10)
    const cookieHeader = req.headers.get('cookie') || ''
    const m = cookieHeader.match(/(?:^|;\s*)tappy_anon=([^;]+)/)
    let anonCount = 0
    if (m) {
      const [d, c] = decodeURIComponent(m[1]).split(':')
      if (d === vnToday) anonCount = parseInt(c, 10) || 0
    }
    if (anonCount >= FREE_ANON_LIMIT) {
      return new Response(
        JSON.stringify({
          error: 'anon_limit_reached',
          message: `Bạn đã dùng hết ${FREE_ANON_LIMIT} câu hỏi miễn phí hôm nay. Đăng nhập để tiếp tục trò chuyện với Tappy!`,
          upgradeUrl: '/login',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
    anonSetCookie = `tappy_anon=${vnToday}:${anonCount + 1}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax; Secure`
  }

  // Inject freeform user preferences from client request body
  const rawPrefsArr = Array.isArray(rawUserPrefs)
    ? (rawUserPrefs as unknown[]).filter(p => typeof p === 'string').slice(0, 50) as string[]
    : []
  if (rawPrefsArr.length > 0) {
    const freeformBlock = `\n\n===== Sá»ž THÃCH & THÃ”NG TIN CÃ NHÃ‚N Cá»¦A USER =====\n${rawPrefsArr.map(p => `- ${p}`).join('\n')}\nHÃ£y luÃ´n ghi nhá»› vÃ  Ã¡p dá»¥ng nhá»¯ng sá»Ÿ thÃ­ch nÃ y khi gá»£i Ã½.\n==================================================`
    prefBlock = prefBlock ? prefBlock + freeformBlock : freeformBlock
  }

  const tier: ModelTier = (planningIntent || hasImage) ? 'planning' : isSimpleQuery(lastText, isFirstReply) ? 'simple' : 'standard'
  console.log(JSON.stringify({ type: 'tappyai_model', model: tier, planningIntent }))

  // Truncate history to last 10 messages to control token costs
  const trimmedMessages = messages.length > 10 ? messages.slice(-10) : messages

  // Anthropic prompt caching only applies when cacheControl is attached to a specific
  // message object — passing it as a top-level streamText() option alongside a plain
  // `system` string is silently ignored by the SDK (verified in node_modules/ai's
  // convertToLanguageModelPrompt: the string-system code path never reads provider
  // metadata at all). Passing the system prompt as the first `messages[]` entry instead
  // is the code path that actually attaches cache_control, so repeat requests within the
  // ~5min cache window get the (large, mostly-static) system prompt at a cached rate
  // instead of full price.
  const systemPrompt = (intent === 'chitchat'
    ? buildSystemSimple(lang, memoryBlock)
    : buildSystem(budget, locationIntent, isFirstReply, memoryBlock, lang, prefBlock, userLocation, planningIntent, hasImage, forcedTool)
  ) + styleBlock

  let result
  try {
  result = streamText({
    model: getModel(tier),
    messages: [
      {
        role: 'system' as const,
        content: systemPrompt,
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
      },
      ...trimmedMessages,
    ],
    maxTokens: intent === 'chitchat' ? 300 : planningIntent ? 3000 : hasImage ? 1024 : 2048,
    maxSteps: intent === 'chitchat' ? 1 : planningIntent ? 8 : hasImage ? 3 : 5,
    // @ts-ignore — experimental_prepareStep exists in AI SDK but missing from this version's types; do not remove
    experimental_prepareStep: async ({ stepNumber }: { stepNumber: number }) => {
      if (intent === 'chitchat') return { toolChoice: 'none' as const }
      if (stepNumber === 0) {
        if (forcedTool === 'search_products' && locationIntent === 'offline') {
          return { toolChoice: { type: 'tool' as const, toolName: 'search_places' } }
        }
        if (!forcedTool && locationIntent === 'offline') {
          return { toolChoice: { type: 'tool' as const, toolName: 'search_places' } }
        }
        if (!forcedTool && locationIntent === 'unknown' && isShoppingQuery(lastText)) {
          return { toolChoice: 'none' as const }
        }
        if (forcedTool) return { toolChoice: { type: 'tool' as const, toolName: forcedTool } }
        return { toolChoice: 'required' as const }
      }
      return { toolChoice: 'none' as const }
    },
    tools: {
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
          return budget ? applyBudgetFilter(r, budget, query) : r
        }
      }),
      get_news: tool({
        description: 'Lay tin tuc moi nhat tu VnExpress, Tuoi Tre, Dan Tri',
        parameters: z.object({ query: z.string().describe('Tu khoa tin tuc can tim') }),
        execute: async ({ query }) => getNews(query)
      }),
      ...(locationIntent !== 'offline' ? { search_products: tool({
        description: 'Tim san pham/shop mua sam: gia tren Shopee/Tiki/Lazada, website rieng cua shop, dia chi cua hang vat ly (neu co), Facebook/TikTok cua shop - tat ca tu Google Search (Serper)',
        parameters: z.object({ query: z.string().describe('Ten san pham can tim mua') }),
        execute: async ({ query }) => {
          const r = await searchProducts(query)
          return budget ? applyBudgetFilter(r, budget, query) : r
        }
      }) } : {}),
      web_search: tool({
        description: 'Tim kiem tong quat tren internet de lay thong tin moi nhat (ty gia, gia xang, su kien, kien thuc can xac thuc...) khi cac tool khac khong phu hop',
        parameters: z.object({ query: z.string().describe('Tu khoa can tim kiem (vd: ty gia USD hom nay)') }),
        execute: async ({ query }) => webSearch(query)
      }),
      get_weather: tool({
        description: 'Lay thong tin thoi tiet hien tai va du bao hom nay (nhiet do, tinh trang troi, do am, gio) cho mot dia diem tai Viet Nam, du lieu realtime tu wttr.in',
        parameters: z.object({ location: z.string().describe('Ten thanh pho/tinh can xem thoi tiet (vd: Ha Noi, Da Nang, TP HCM)') }),
        execute: async ({ location }) => getWeather(location)
      }),
      get_gold_price: tool({
        description: 'Lay gia vang SJC, PNJ, DOJI, vang the gioi (XAU/USD) realtime, cap nhat moi 5 phut tu vang.today',
        parameters: z.object({ query: z.string().optional().describe('Loai vang user hoi, vd: SJC, PNJ, vang the gioi (khong bat buoc)') }),
        execute: async ({ query }) => getGoldPrice(query || '')
      }),
      get_flight_prices: tool({
        description: 'Tim gia ve may bay re gan nhat giua 2 thanh pho/san bay, du lieu tu Travelpayouts (Aviasales)',
        parameters: z.object({
          origin: z.string().describe('Diem di (ten thanh pho hoac ma san bay IATA, vd: Ha Noi, HAN)'),
          destination: z.string().describe('Diem den (ten thanh pho hoac ma san bay IATA, vd: TP HCM, SGN)'),
        }),
        execute: async ({ origin, destination }) => {
          const r = await getFlightPrices(origin, destination)
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
          const r = await getHotelPrices(location, checkIn, checkOut, budget?.max)
          return budget ? applyBudgetFilter(r, budget, 'khach san') : r
        }
      }),
      get_transport_options: tool({
        description: 'Tim phuong an di chuyen: ve xe khach/tau hoa giua 2 tinh/thanh pho (tim kiem web, kem link dat ve cu the), hoac uoc tinh khoang cach + gia taxi/xe cong nghe (Grab/Be/Xanh SM) cho di chuyen trong thanh pho/quang duong ngan',
        parameters: z.object({
          origin: z.string().describe('Diem di (ten tinh/thanh pho hoac dia diem cu the)'),
          destination: z.string().describe('Diem den (ten tinh/thanh pho hoac dia diem cu the)'),
          mode: z.enum(['intercity', 'taxi']).optional().describe('"intercity" cho xe khach/tau giua 2 tinh thanh, "taxi" cho di chuyen trong thanh pho/quang duong ngan bang taxi/xe cong nghe. Bo trong neu khong ro.'),
        }),
        execute: async ({ origin, destination, mode }) => getTransportOptions(origin, destination, mode === 'taxi' ? 'taxi' : undefined)
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
    onFinish: async ({ usage, finishReason, text }) => {
      console.log(JSON.stringify({
        type: 'tappyai_usage',
        intent,
        finishReason,
        promptTokens: usage?.promptTokens ?? null,
        completionTokens: usage?.completionTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        elapsedMs: Date.now() - startTime,
        worthExtract,
        forcedTool,
      }))
      if (authedUserId && worthExtract) {
        try {
          const convMessages = [
            ...messages.map((m: { role: string; content: unknown }) => ({
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
    console.error('streamText init error:', e)
    return new Response(
      JSON.stringify({ error: 'ai_error', message: String(e) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const baseResponse = result.toDataStreamResponse()
  const enrichedResponse = applyPlaceEnrichmentStreamFilter(baseResponse)
  const finalResponse = (budget && budget.max < LUXURY_PRICE_FLOOR)
    ? applyLuxuryStreamFilter(enrichedResponse)
    : enrichedResponse
  // Persist the incremented anonymous question count for the day.
  if (anonSetCookie) finalResponse.headers.set('Set-Cookie', anonSetCookie)
  return finalResponse
}

