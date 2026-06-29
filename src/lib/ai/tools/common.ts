import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// ===== In-memory cache =====
type CacheEntry = { data: unknown; expires: number }
const cache = new Map<string, CacheEntry>()

export function getCache(key: string): unknown | null {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.data
  if (hit) cache.delete(key)
  return null
}

export function setCache(key: string, data: unknown, ttlMs: number) {
  if (cache.size > 300) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) cache.delete(firstKey)
  }
  cache.set(key, { data, expires: Date.now() + ttlMs })
}

// ===== SUPABASE CACHE CLIENT =====
let _cacheDb: ReturnType<typeof createSupabaseClient> | null | undefined = undefined
function getCacheClient() {
  if (_cacheDb !== undefined) return _cacheDb
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  _cacheDb = url && key ? createSupabaseClient(url, key) : null
  return _cacheDb
}

// ===== FETCH PLACE PHOTO BY NAME via Serper Images (cached in Supabase) =====
export async function fetchPlacePhotoByName(placeId: string, placeName: string): Promise<string | null> {
  const db = getCacheClient()
  // 1. Check Supabase cache first
  if (db) {
    try {
      const { data } = await db
        .from('place_photos')
        .select('photo_url')
        .eq('place_id', placeId)
        .maybeSingle()
      if (data?.photo_url) return data.photo_url as string
    } catch { /* ignore */ }
  }
  // 2. Serper image search
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey || !placeName) return null
  try {
    const resp = await Promise.race([
      fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: placeName, gl: 'vn', hl: 'vi', num: 3 }),
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ])
    if (!(resp as Response).ok) return null
    const data = await (resp as Response).json()
    const images = data?.images as Array<{ imageUrl?: string }> | undefined
    const photoUri = images?.[0]?.imageUrl
    if (!photoUri) return null
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'serper_image', placeId, placeName, photoUri: photoUri.slice(0, 60) }))
    // 3. Cache in Supabase (fire-and-forget)
    if (db) {
      db.from('place_photos')
        .upsert({ place_id: placeId, photo_url: photoUri })
        .catch(() => {})
    }
    return photoUri
  } catch {
    return null
  }
}

// Encode ky tu '(' ')' trong URL de khong vo cu phap markdown link
export function sanitizeUrlForMarkdown(link: string): string {
  return link.replace(/\(/g, '%28').replace(/\)/g, '%29')
}

// ===== SERPER: Google Search API =====
export async function serperSearch(query: string): Promise<Array<{ title: string; link: string; snippet: string }> | null> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return null
  try {
    const resp = await Promise.race([
      fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, gl: 'vn', hl: 'vi', num: 8 })
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ])
    if (!(resp as Response).ok) return null
    const data = await (resp as Response).json()
    const organic = (data?.organic || []) as Array<{ title?: string; link?: string; snippet?: string }>
    const results = organic
      .filter(r => r.title && r.link)
      .slice(0, 6)
      .map(r => ({ title: r.title as string, link: sanitizeUrlForMarkdown(r.link as string), snippet: r.snippet || '' }))
    return results
  } catch {
    return null
  }
}

// ===== WEB SEARCH: DuckDuckGo HTML (free, no API key) =====
export async function webSearch(query: string) {
  const cacheKey = 'websearch:' + query.toLowerCase().trim()
  const cached = getCache(cacheKey)
  if (cached) return cached

  const fallbackUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
  let result: unknown

  const serperResults = await serperSearch(query)
  if (serperResults && serperResults.length > 0) {
    result = { query, source: 'Google (Serper)', results: serperResults, search_url: fallbackUrl }
    setCache(cacheKey, result, 5 * 60 * 1000)
    return result
  }

  try {
    const resp = await Promise.race([
      fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://duckduckgo.com/',
          'Origin': 'https://duckduckgo.com',
          'Sec-Fetch-Mode': 'navigate',
        }
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ])
    const html = await (resp as Response).text()

    const results: Array<{ title: string; link: string; snippet: string }> = []
    const blockRegex = /<a[^>]*class="result__a"[^>]*href="(.*?)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    const stripTags = (s: string) => s
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .trim()

    let match: RegExpExecArray | null
    while ((match = blockRegex.exec(html)) && results.length < 6) {
      let link = match[1]
      const uddg = link.match(/uddg=([^&]+)/)
      if (uddg) link = decodeURIComponent(uddg[1])
      else if (link.startsWith('//')) link = 'https:' + link
      const title = stripTags(match[2])
      const snippet = stripTags(match[3])
      if (title && link) results.push({ title, link, snippet })
    }

    result = results.length === 0
      ? { note: 'Khong tim thay ket qua tu dong cho "' + query + '". HAY hien thi link sau cho user de tu tim: ' + fallbackUrl, results: [], search_url: fallbackUrl }
      : { query, source: 'DuckDuckGo', results, search_url: fallbackUrl }
  } catch {
    result = { note: 'Khong the tim kiem tu dong luc nay. HAY hien thi link sau cho user de tu tim: ' + fallbackUrl, results: [], search_url: fallbackUrl }
  }
  setCache(cacheKey, result, 5 * 60 * 1000)
  return result
}
