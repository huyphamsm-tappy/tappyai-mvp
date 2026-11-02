// ── Source policy (owner 01/11/2026): another AI product's answer or chat page is never a source ──────────────────────────────────────────
//
// UAT: a history answer linked AIHAY, a competing AI product, as a reference. "Nghiêm cấm không được sử dụng nguồn của bất cứ AI nào."
// The rule is about the SOURCE's own address, never about the person's words: pages written by an AI product's chat or answer engine are not
// read (read_page) and never reach the model as a search row, so they cannot be cited, listed under "Nguồn" or kept by the link guard
// (stripUnownedLinks only keeps links a tool returned). A company's own site (its blog, its announcements) is a primary source and stays.
// The lists are DATA: a host (and every subdomain of it), or a path of a general host. Add a product by adding it here.
// Review 01/11 (independent reviewer): an address is read in the forms it really arrives in - scheme-less ("aihay.vn/a"), protocol-relative,
// a displayed link ("aihay.vn › hoi-dap"), wrapped by a redirector / archive / reader (google.com/url?q=, r.jina.ai/, web.archive.org/web/…/) -
// and every object a tool returns is checked, not only the rows of an array.

const AI_PRODUCT_HOSTS: readonly string[] = [
  'aihay.vn', 'aihay.net', 'aihay.com', 'aihay.ai', 'aihay.org', 'aihay.app', 'ai-hay.vn', 'ai-hay.com', 'ai-hay.net',
  'chatgpt.com', 'chat.openai.com',
  'perplexity.ai',
  'gemini.google.com', 'bard.google.com', 'notebooklm.google.com', 'aistudio.google.com',
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
  'duck.ai',
]

/** An AI product that lives on a PATH of a general host. */
const AI_PRODUCT_PATHS: ReadonlyArray<{ host: string; path: RegExp }> = [
  { host: 'bing.com', path: /^\/chat(?:\/|$)/i },
  { host: 'huggingface.co', path: /^\/chat(?:\/|$)/i },
]

// Owner 01/11: AIHAY also has an app. A store page lives on the store's own host, so the host alone says nothing: the page is blocked when
// its address (or, for a result row, its title) names the product. Only on these hosts, so an ordinary article about "AI hay" is untouched.
const APP_STORE_HOSTS: readonly string[] = ['play.google.com', 'apps.apple.com', 'itunes.apple.com', 'galaxy.store', 'appgallery.huawei.com']
const APP_BRAND = /ai[-_]?hay/i
const onHost = (h: string, list: readonly string[]) => list.some(d => h === d || h.endsWith(`.${d}`))

/** An address as a URL: scheme-less and protocol-relative forms get https, a displayed link ("host › path") is its first token. Null when it is none. */
function parseUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim().split(/\s+/)[0] ?? ''
  if (!s) return null
  if (s.startsWith('//')) s = `https:${s}`
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(s) && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/:?#]|$)/i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null
  } catch {
    return null
  }
}

const hostname = (u: URL) => u.hostname.toLowerCase().replace(/\.$/, '')

/** The address a redirector, an archive or a page reader wraps, or null. Only these known wrappers: a URL inside a query of any other site means nothing. */
function innerOf(u: URL, h: string): string | null {
  if (/^(?:[a-z0-9-]+\.)*google\.[a-z.]+$/.test(h) && (u.pathname === '/url' || u.pathname.startsWith('/goto'))) {
    const v = u.searchParams.get('q') ?? u.searchParams.get('url')
    return v && /^https?:/i.test(v) ? v : null
  }
  if (h === 'webcache.googleusercontent.com') return /cache:(?:[\w-]+:)?(https?:\/\/.+)$/i.exec(u.searchParams.get('q') ?? '')?.[1] ?? null
  if (h === 'r.jina.ai') {
    const rest = u.pathname.slice(1) + u.search
    return /^https?:/i.test(rest) ? rest : null
  }
  if (h === 'web.archive.org' || h === 'archive.org') return /\/web\/\d+[a-z_]*\/(https?:\/\/.*)$/i.exec(u.pathname + u.search)?.[1] ?? null
  return null
}

/** True when the address is a page of another AI product (its domain, a path of a general host, its app's store page, or any of those wrapped). Pure. */
export function isAiProductSource(url: unknown, depth = 0): boolean {
  const u = parseUrl(url)
  if (!u) return false
  const h = hostname(u)
  if (onHost(h, AI_PRODUCT_HOSTS)) return true
  if (AI_PRODUCT_PATHS.some(r => onHost(h, [r.host]) && r.path.test(u.pathname))) return true
  if (onHost(h, APP_STORE_HOSTS)) {
    const raw = `${u.pathname}${u.search}`
    let decoded = raw
    try { decoded = decodeURIComponent(raw) } catch { /* a malformed escape: the raw text is still read */ }
    if (APP_BRAND.test(raw) || APP_BRAND.test(decoded)) return true
  }
  if (depth < 2) {
    const inner = innerOf(u, h)
    if (inner) return isAiProductSource(inner, depth + 1)
  }
  return false
}

const URL_KEY = /^(link|url|href|uri|website|website_uri|source|source_?url|page_?url|canonical(?:_?url)?|official_url|displayed_?link|site)$/i

const isAiRow = (v: unknown): boolean => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const row = v as Record<string, unknown>
  return Object.entries(row).some(([k, x]) => {
    if (!URL_KEY.test(k)) return false
    if (isAiProductSource(x)) return true
    const u = parseUrl(x)
    return !!u && onHost(hostname(u), APP_STORE_HOSTS) && [row.title, row.name].some(t => typeof t === 'string' && APP_BRAND.test(t))
  })
}

const NOT_ALLOWED_NOTE = 'That page belongs to another AI product and is not used as a source. Use another source.'

function walk<T>(result: T, depth: number): { value: T; dropped: number } {
  if (!result || typeof result !== 'object' || depth > 12) return { value: result, dropped: 0 }
  if (Array.isArray(result)) {
    let dropped = 0
    const out: unknown[] = []
    for (const item of result) {
      if (isAiRow(item)) { dropped++; continue }
      const r = walk(item, depth + 1)
      dropped += r.dropped
      out.push(r.value)
    }
    return { value: (dropped ? out : result) as T, dropped }
  }
  let dropped = 0
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(result as Record<string, unknown>)) {
    // a single object (a Serper answer box, a knowledge graph) is a row too
    if (v && typeof v === 'object' && !Array.isArray(v) && isAiRow(v)) { dropped++; continue }
    const r = walk(v, depth + 1)
    dropped += r.dropped
    out[k] = r.value
  }
  return { value: (dropped ? out : result) as T, dropped }
}

/**
 * The result without the rows and objects whose address is an AI product (at any depth), and how many were dropped. A result that is itself
 * such a page (a page read) becomes a refusal. The input is not changed. Pure.
 */
export function withoutAiSources<T>(result: T): { value: T; dropped: number } {
  if (isAiRow(result)) return { value: { error: 'source_not_allowed', note: NOT_ALLOWED_NOTE } as T, dropped: 1 }
  return walk(result, 0)
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
          if (kept.length === 0) return { error: 'source_not_allowed', note: NOT_ALLOWED_NOTE }
          a = { ...rec, urls: kept }
        }
      } else if (rec && isAiProductSource(rec.url)) {
        console.log(JSON.stringify({ type: 'tappyai_ai_source_dropped', tool: name, where: 'args', n: 1 }))
        return { error: 'source_not_allowed', note: NOT_ALLOWED_NOTE }
      }
      const r = withoutAiSources(await inner(a, opts))
      if (r.dropped) console.log(JSON.stringify({ type: 'tappyai_ai_source_dropped', tool: name, where: 'result', n: r.dropped }))
      return r.value
    }
  }
}
