// Known multi-level public suffixes relevant to Vietnamese domains.
// A full PSL (tldts/psl package) is deferred; this covers the VN ccTLD cases
// that cause incorrect eTLD+1 extraction with naive parts.slice(-2).
const MULTI_LEVEL_TLDS = new Set([
  'com.vn', 'net.vn', 'org.vn', 'edu.vn', 'gov.vn', 'ac.vn', 'biz.vn',
  'info.vn', 'pro.vn', 'health.vn', 'name.vn', 'int.vn',
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.au', 'org.au', 'net.au', 'edu.au',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp',
  'co.kr', 'or.kr', 'ne.kr',
  'com.sg', 'org.sg', 'edu.sg', 'gov.sg',
  'com.my', 'org.my', 'edu.my', 'gov.my',
  'co.th', 'or.th', 'ac.th', 'go.th',
  'com.tw', 'org.tw', 'edu.tw', 'gov.tw',
  'com.cn', 'org.cn', 'net.cn', 'gov.cn',
  'co.id', 'or.id', 'ac.id', 'go.id',
  'com.ph', 'org.ph', 'edu.ph', 'gov.ph',
])

export function registrableDomain(hostname: string): string {
  const h = hostname.toLowerCase()
  const parts = h.split('.')
  if (parts.length <= 2) return h

  const last2 = parts.slice(-2).join('.')
  if (MULTI_LEVEL_TLDS.has(last2) && parts.length > 2) {
    return parts.slice(-3).join('.')
  }
  return last2
}
