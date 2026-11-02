// Link / QR check: the REASON a signal gives, in Vietnamese and English (owner 02/10, asked for by the Android session).
//
// The engine's own `detail` strings are English technical lines ("Domain has no A record…") and stay as they are for old app builds.
// Every evidence item additionally carries `reasonCode` + `reason_vi` + `reason_en`, built here from (provider, finding, data points), so
// a client shows the language it needs — or translates from the code. Additive: nothing was renamed or removed.
//
// Wording rules (same as the verdict wording): a reason describes what was OBSERVED about the link; it never concludes that a named
// organisation or domain "is a scam", and never says "an toàn".

import type { EvidenceCategory, SignalSeverity } from './types'

export interface ReasonInput {
  source: string
  finding: string
  severity: SignalSeverity
  detail: string
  dataPoints: Record<string, unknown>
  category?: EvidenceCategory
}

export interface Reason { code: string; vi: string; en: string }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)
/** A brand/domain name taken from data goes INTO a sentence: strip markup and marker characters, bound the length. */
const word = (v: unknown, max = 60): string => String(v ?? '').replace(/[\u0000-\u001f\u007f\[\]{}()<>`|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

const THREAT_VI: Record<string, string> = {
  SOCIAL_ENGINEERING: 'trang giả mạo để lấy thông tin (lừa đảo trực tuyến)',
  SOCIAL_ENGINEERING_EXTENDED_COVERAGE: 'trang giả mạo để lấy thông tin (lừa đảo trực tuyến)',
  MALWARE: 'trang phát tán phần mềm độc hại',
  UNWANTED_SOFTWARE: 'trang cài phần mềm không mong muốn',
}
const THREAT_EN: Record<string, string> = {
  SOCIAL_ENGINEERING: 'a page that imitates another to steal information (phishing)',
  SOCIAL_ENGINEERING_EXTENDED_COVERAGE: 'a page that imitates another to steal information (phishing)',
  MALWARE: 'a page that spreads malicious software',
  UNWANTED_SOFTWARE: 'a page that installs unwanted software',
}

/** Every reason the link engine can give. `code` is stable (`<source>.<finding>`) so an app can also translate it on its own. */
export function reasonFor(i: ReasonInput): Reason {
  const code = `${i.source}.${i.finding}`
  const dp = i.dataPoints ?? {}
  switch (i.finding) {
    case 'BLOCKLISTED':
      return { code, vi: 'Tên miền nằm trong danh sách trang web xấu của Việt Nam mà TappyAI đối chiếu.', en: 'The domain appears on a Vietnamese bad-site list that TappyAI checks against.' }
    case 'NO_A_RECORD':
      return { code, vi: 'Tên miền chưa trỏ tới máy chủ nào (không có bản ghi địa chỉ). Hay gặp ở tên miền bỏ không hoặc mới đăng ký.', en: 'The domain does not point to any server yet (no address record). Common with parked or newly registered domains.' }
    case 'NO_NS_RECORD':
      return { code, vi: 'Tên miền không khai báo máy chủ tên (không có bản ghi NS).', en: 'The domain declares no name servers (no NS record).' }
    case 'UNSAFE_REDIRECT':
      return { code, vi: 'Đường link chuyển hướng tới một địa chỉ không được phép truy cập (địa chỉ nội bộ).', en: 'The link redirects to an address that must not be visited (an internal address).' }
    case 'CROSS_DOMAIN_REDIRECT': {
      const n = (i.detail.match(/(\d+)\s+different/i)?.[1]) ?? null
      return { code, vi: n ? `Đường link chuyển qua ${n} tên miền khác nhau trước khi tới trang cuối.` : 'Đường link chuyển qua nhiều tên miền khác nhau trước khi tới trang cuối.', en: n ? `The link passes through ${n} different domains before the final page.` : 'The link passes through several different domains before the final page.' }
    }
    case 'EXCESSIVE_REDIRECTS':
    case 'MULTIPLE_REDIRECTS': {
      const n = Array.isArray(dp.hops) ? dp.hops.length : num(i.detail.match(/(\d+)\s+redirect/i)?.[1] ? Number(i.detail.match(/(\d+)\s+redirect/i)?.[1]) : null)
      return { code, vi: n ? `Đường link chuyển hướng ${n} lần trước khi tới trang cuối.` : 'Đường link chuyển hướng nhiều lần trước khi tới trang cuối.', en: n ? `The link redirects ${n} times before the final page.` : 'The link redirects several times before the final page.' }
    }
    case 'INVALID_CERT':
      return { code, vi: 'Chứng chỉ bảo mật (SSL) của trang không hợp lệ hoặc đã hết hạn.', en: 'The page’s security certificate (SSL) is invalid or expired.' }
    case 'EXPIRING_SOON': {
      const n = num(dp.daysRemaining)
      return { code, vi: n !== null ? `Chứng chỉ bảo mật (SSL) của trang sắp hết hạn (còn ${n} ngày).` : 'Chứng chỉ bảo mật (SSL) của trang sắp hết hạn.', en: n !== null ? `The page’s security certificate (SSL) expires soon (${n} days left).` : 'The page’s security certificate (SSL) expires soon.' }
    }
    case 'NO_SSL':
      return { code, vi: 'Không xác minh được chứng chỉ bảo mật (SSL) của trang.', en: 'The page’s security certificate (SSL) could not be verified.' }
    case 'NEWLY_REGISTERED':
    case 'RECENTLY_REGISTERED': {
      const n = num(dp.ageDays)
      return { code, vi: n !== null ? `Tên miền mới được đăng ký cách đây ${n} ngày.` : 'Tên miền mới được đăng ký gần đây.', en: n !== null ? `The domain was registered only ${n} days ago.` : 'The domain was registered very recently.' }
    }
    case 'BRAND_IMPERSONATION': {
      const brand = word(dp.brand)
      return { code, vi: brand ? `Tên miền có chứa tên «${brand}» nhưng không nằm trong các tên miền chính thức mà TappyAI có của tổ chức này.` : 'Tên miền có chứa tên một tổ chức quen thuộc nhưng không nằm trong các tên miền chính thức mà TappyAI có.', en: brand ? `The domain contains the name “${brand}” but is not one of the official domains TappyAI has for that organisation.` : 'The domain contains the name of a well-known organisation but is not one of the official domains TappyAI has.' }
    }
    case 'OFFICIAL_DOMAIN': {
      const brand = word(dp.brand)
      return { code, vi: brand ? `Tên miền trùng với tên miền chính thức của «${brand}» trong danh bạ TappyAI.` : 'Tên miền trùng với một tên miền chính thức trong danh bạ TappyAI.', en: brand ? `The domain matches an official domain of “${brand}” in the TappyAI directory.` : 'The domain matches an official domain in the TappyAI directory.' }
    }
    case 'NO_REDIRECTS': return { code, vi: 'Đường link không chuyển hướng.', en: 'The link does not redirect.' }
    case 'FEW_REDIRECTS': return { code, vi: 'Đường link chuyển hướng ít lần, trong cùng một tên miền.', en: 'The link redirects a few times, within the same domain.' }
    case 'ESTABLISHED': {
      const n = num(dp.ageDays)
      return { code, vi: n !== null ? `Tên miền đã được đăng ký cách đây ${n} ngày.` : 'Tên miền đã được đăng ký từ lâu.', en: n !== null ? `The domain was registered ${n} days ago.` : 'The domain was registered a long time ago.' }
    }
    case 'VALID': return { code, vi: 'Chứng chỉ bảo mật (SSL) của trang hợp lệ.', en: 'The page’s security certificate (SSL) is valid.' }
    case 'RESOLVED': return { code, vi: 'Tên miền có bản ghi DNS bình thường.', en: 'The domain has ordinary DNS records.' }
    case 'NOT_LISTED': return { code, vi: 'Tên miền không nằm trong danh sách trang web xấu mà TappyAI đối chiếu.', en: 'The domain is not on the bad-site list TappyAI checks against.' }
    case 'CLEAN': return { code, vi: 'Google Web Risk không ghi nhận cảnh báo cho địa chỉ này.', en: 'Google Web Risk has no warning recorded for this address.' }
    default: {
      if (i.source === 'webRisk' && (THREAT_VI[i.finding] || i.severity === 'critical')) {
        return { code, vi: `Google Web Risk có cảnh báo về địa chỉ này: ${THREAT_VI[i.finding] ?? 'nội dung bị coi là nguy hiểm'}.`, en: `Google Web Risk has a warning about this address: ${THREAT_EN[i.finding] ?? 'content it treats as dangerous'}.` }
      }
      return { code, vi: 'Công cụ kiểm tra ghi nhận một điểm đáng chú ý ở đường link này.', en: 'The checker noted something worth your attention about this link.' }
    }
  }
}

/** The codes `reasonFor` knows — the test pins that every finding the providers can emit has a real sentence. */
export const KNOWN_REASON_FINDINGS = [
  'BLOCKLISTED', 'NOT_LISTED', 'NO_A_RECORD', 'NO_NS_RECORD', 'RESOLVED', 'UNSAFE_REDIRECT', 'CROSS_DOMAIN_REDIRECT', 'EXCESSIVE_REDIRECTS',
  'MULTIPLE_REDIRECTS', 'FEW_REDIRECTS', 'NO_REDIRECTS', 'INVALID_CERT', 'EXPIRING_SOON', 'NO_SSL', 'VALID', 'NEWLY_REGISTERED',
  'RECENTLY_REGISTERED', 'ESTABLISHED', 'BRAND_IMPERSONATION', 'OFFICIAL_DOMAIN', 'CLEAN',
] as const
