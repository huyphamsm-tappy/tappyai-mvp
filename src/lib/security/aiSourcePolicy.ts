// ── Source policy (owner 01/11/2026): another AI product's answer or chat page is never a source ──────────────────────────────────────────
//
// UAT: a history answer linked AIHAY, a competing AI product, as a reference. "Nghiêm cấm không được sử dụng nguồn của bất cứ AI nào."
// The rule is about the SOURCE's own address, never about the person's words: pages written by an AI product's chat or answer engine are not
// read (read_page) and never reach the model as a search row, so they cannot be cited, listed under "Nguồn" or kept by the link guard
// (stripUnownedLinks only keeps links a tool returned). A company's own site (its blog, its announcements) is a primary source and stays.
// The list is DATA: a host (and every subdomain of it). Add a product by adding its host here.

const AI_PRODUCT_HOSTS: readonly string[] = [
  'aihay.vn', 'aihay.net', 'aihay.com', 'ai-hay.vn',
  'chatgpt.com', 'chat.openai.com',
  'perplexity.ai',
  'gemini.google.com', 'bard.google.com', 'notebooklm.google.com',
  'claude.ai',
  'copilot.microsoft.com',
  'poe.com',
  'grok.com',
  'chat.deepseek.com',
  'you.com',
  'phind.com',
  'meta.ai',
  'character.ai',
  'chat.mistral.ai',
  'kimi.com', 'kimi.ai',
  'chat.qwen.ai',
]

function hostOf(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u.hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return null
  }
}

// Owner 01/11: AIHAY also has an app. A store page lives on the store's own host, so the host alone says nothing: the page is blocked when
// its address (or, for a result row, its title) names the product. Only on these hosts, so an ordinary article about "AI hay" is untouched.
const APP_STORE_HOSTS: readonly string[] = ['play.google.com', 'apps.apple.com', 'itunes.apple.com', 'galaxy.store', 'appgallery.huawei.com']
const APP_BRAND = /ai[-_]?hay/i
const onHost = (h: string, list: readonly string[]) => list.some(d => h === d || h.endsWith(`.${d}`))

/** True when the address is a page of another AI product (its domain or a subdomain of it, or its app's store page). Pure. */
export function isAiProductSource(url: unknown): boolean {
  const h = hostOf(url)
  if (!h) return false
  if (onHost(h, AI_PRODUCT_HOSTS)) return true
  if (!onHost(h, APP_STORE_HOSTS)) return false
  try {
    const u = new URL(url as string)
    return APP_BRAND.test(decodeURIComponent(`${u.pathname}${u.search}`))
  } catch {
    return false
  }
}

const URL_KEY = /^(link|url|website|website_uri|source_url|official_url)$/i

const isAiRow = (v: unknown): boolean => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const row = v as Record<string, unknown>
  return Object.entries(row).some(([k, x]) => {
    if (!URL_KEY.test(k)) return false
    if (isAiProductSource(x)) return true
    const h = hostOf(x)
    return !!h && onHost(h, APP_STORE_HOSTS) && [row.title, row.name].some(t => typeof t === 'string' && APP_BRAND.test(t))
  })
}

/** The result without the rows whose address is an AI product (at any depth), and how many were dropped. The input is not changed. Pure. */
export function withoutAiSources<T>(result: T, depth = 0): { value: T; dropped: number } {
  if (!result || typeof result !== 'object' || depth > 6) return { value: result, dropped: 0 }
  if (Array.isArray(result)) {
    let dropped = 0
    const out: unknown[] = []
    for (const item of result) {
      if (isAiRow(item)) { dropped++; continue }
      const r = withoutAiSources(item, depth + 1)
      dropped += r.dropped
      out.push(r.value)
    }
    return { value: (dropped ? out : result) as T, dropped }
  }
  let dropped = 0
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(result as Record<string, unknown>)) {
    const r = withoutAiSources(v, depth + 1)
    dropped += r.dropped
    out[k] = r.value
  }
  return { value: (dropped ? out : result) as T, dropped }
}

type Exec = (args: unknown, opts: unknown) => Promise<unknown>

/**
 * Wraps every tool of the turn once, innermost (before the budget and ticket wrappers): the arguments of a page read lose any AI-product
 * address (a call left with none is refused, the reader never runs), and whatever a tool returns loses the AI-product rows before the
 * reader, the link guard or the model see it. One count line per turn that dropped something; never the addresses.
 */
export function wrapToolsWithoutAiSources(tools: Record<string, unknown>): void {
  for (const [name, t] of Object.entries(tools)) {
    const tool = t as { execute?: Exec } | null
    if (!tool || typeof tool.execute !== 'function') continue
    const inner = tool.execute.bind(tool)
    tool.execute = async (args, opts) => {
      let a = args
      const rec = args as { urls?: unknown; url?: unknown } | null
      if (rec && Array.isArray(rec.urls)) {
        const kept = rec.urls.filter(u => !isAiProductSource(u))
        if (kept.length !== rec.urls.length) {
          console.log(JSON.stringify({ type: 'tappyai_ai_source_dropped', tool: name, where: 'args', n: rec.urls.length - kept.length }))
          if (kept.length === 0) return { error: 'source_not_allowed', note: 'That page belongs to another AI product and is not used as a source. Use another source.' }
          a = { ...rec, urls: kept }
        }
      } else if (rec && isAiProductSource(rec.url)) {
        console.log(JSON.stringify({ type: 'tappyai_ai_source_dropped', tool: name, where: 'args', n: 1 }))
        return { error: 'source_not_allowed', note: 'That page belongs to another AI product and is not used as a source. Use another source.' }
      }
      const r = withoutAiSources(await inner(a, opts))
      if (r.dropped) console.log(JSON.stringify({ type: 'tappyai_ai_source_dropped', tool: name, where: 'result', n: r.dropped }))
      return r.value
    }
  }
}
