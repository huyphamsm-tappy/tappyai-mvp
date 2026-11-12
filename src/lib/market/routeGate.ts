// R13 §5.5 / §6 in the chat route (flag MARKET_GATE): every market-bound tool is judged by evaluateGate (market, region, vertical, capability, action) BEFORE it runs.
//   - The market is an INPUT: the explicit `x-tappy-market` request header when present, else Viet Nam (the one active market; today's behaviour). An IP address or the person's language never decides it.
//   - An empty or malformed header is "no market": the gate refuses (fail closed); it never falls back to Viet Nam.
//   - A refusal is a tool RESULT (the model reads it and tells the person), never a throw. Tools that are not market-bound (calculator, plan/option presenters, think_deeper, the price-watch write) are not touched.
import { DEFAULT_REGISTRY, evaluateGate, type GateQuery, type Registry } from './marketGate'

export const DEFAULT_MARKET_ID = 'vn'
export const MARKET_HEADER = 'x-tappy-market'

export function resolveRequestMarket(headers: Headers): { marketId: string | null; userNamedMarket: boolean } {
  const raw = headers.get(MARKET_HEADER)
  if (raw === null) return { marketId: DEFAULT_MARKET_ID, userNamedMarket: false }
  const v = raw.trim().toLowerCase()
  return { marketId: /^[a-z0-9_-]{1,16}$/.test(v) ? v : null, userNamedMarket: true }
}

const SCOPE: Record<string, string> = {
  search_places: 'food', get_news: 'general', search_products: 'shopping', web_search: 'general', get_weather: 'general', get_weather_forecast: 'general',
  get_gold_price: 'general', get_flight_prices: 'travel', get_hotel_prices: 'hotels', get_transport_options: 'travel',
}
export const MARKET_GATED_TOOLS = Object.keys(SCOPE)

/** The gate query of one tool call (without the market), or null when the tool is not market-bound. */
export function toolGateQuery(name: string, args: unknown): Pick<GateQuery, 'vertical' | 'capability' | 'action'> | null {
  let vertical = SCOPE[name]
  if (!vertical) return null
  if (name === 'search_places') {
    const type = String((args as { type?: unknown } | null | undefined)?.type ?? '').toLowerCase()
    vertical = type === 'hotel' ? 'hotels' : type === 'attraction' ? 'attractions' : type === 'mall' ? 'shopping' : 'food'
  }
  return { vertical, capability: 'search', action: name }
}

export function wrapToolsWithMarketGate<T extends Record<string, unknown>>(
  tools: T,
  base: { marketId: string | null; userNamedMarket?: boolean; regionId?: string | null; cityId?: string | null },
  registry: Registry = DEFAULT_REGISTRY,
  onDeny?: (info: { tool: string; reason: string }) => void,
): T {
  for (const [name, t] of Object.entries(tools)) {
    const def = t as { execute?: (...a: unknown[]) => unknown }
    const orig = def?.execute
    if (typeof orig !== 'function' || !SCOPE[name]) continue
    def.execute = async (...a: unknown[]) => {
      const q = toolGateQuery(name, a[0])
      const d = q ? evaluateGate({ ...base, ...q }, registry) : null
      if (d && !d.allowed) {
        onDeny?.({ tool: name, reason: d.reason })
        return {
          error: 'market_unavailable', reason: d.reason,
          note: 'This capability is not available for the market of this request. Tell the person plainly that Tappy currently serves Viet Nam, do not call this tool again this turn' + (d.guidance?.askSupportedDestination ? ', and ask which supported destination they mean.' : '.'),
        }
      }
      return orig.apply(def, a)
    }
  }
  return tools
}
