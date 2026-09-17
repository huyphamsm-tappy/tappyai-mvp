import type { CommerceRequest, Configuration, Offer } from '../domain/types'
import { getProvider } from '../registry'
import { isoToCompact, q } from '../validation/url'
import type { DirectLinkBuild, DiscoveryHint, ProviderAdapter } from './types'
import { authLimitation, baseOffer, ownedUrl } from './shared'

// ── CGV — Entertainment (cinema) · verified L4 guest, login before seats ─────
// Film page: https://www.cgv.vn/default/<film-slug>.html
//   "Mua vé" opens the showtime picker (date · city · format · cinema · time).
// Session URL (OBSERVED ONCE as the login referer, 13 Sep 2026):
//   https://www.cgv.vn/default/cinemas/booking/tickets/site/<siteCode>/seq/<sessionId>/dy/<YYYYMMDD>/
//   Clicking a showtime redirects to /customer/account/login/referer/<base64 of that URL>
//   — login (e-mail/phone + password + image CAPTCHA) is demanded BEFORE the
//   seat map. The session URL is therefore emitted only when the caller
//   already holds a real session id; CCP never fabricates one, and it is
//   labelled 'observed', not 'verified', so it ranks below the film page in
//   confidence and the user is told login comes first.

const entry = getProvider('cgv')!
const FILM_PATH = /^\/default\/([a-z0-9-]+)\.html$/
const RESERVED_SLUGS = new Set(['movies', 'cinemas', 'customer', 'news', 'online-store', 'about', 'culture'])

export const cgvAdapter: ProviderAdapter = {
  providerId: 'cgv',
  entry,
  supports(request: CommerceRequest) {
    return request.domain === 'entertainment' && request.intentType === 'buy_ticket'
  },
  toOffer(request, hint: DiscoveryHint, now = new Date()) {
    let slug = hint.subjectRef ?? null
    const u = ownedUrl(entry, hint)
    if (u) {
      const m = u.pathname.match(FILM_PATH)
      if (m && !RESERVED_SLUGS.has(m[1])) slug = slug ?? m[1]
    }
    if (!slug || !/^[a-z0-9-]{2,80}$/.test(slug) || RESERVED_SLUGS.has(slug)) return null
    return baseOffer(entry, request, slug, `https://www.cgv.vn/default/${slug}.html`, hint.title ?? request.subject, now)
  },
  buildDirectLink(offer: Offer, configuration: Configuration | undefined): DirectLinkBuild | null {
    const auth = authLimitation(offer.depthProfile, offer.merchantName)
    const base: DirectLinkBuild = {
      url: offer.canonicalUrl,
      depth: 3,
      paramsPreserved: ['filmRef'],
      paramsPageOnly: ['city', 'cinemaRef', 'date', 'showtime', 'format'],
      paramsDropped: [],
      expiresAt: null,
      grammar: 'verified',
      limitations: ['Bấm "Mua vé" trên trang phim để chọn rạp, ngày và suất chiếu.', ...(auth ? [auth] : [])],
    }
    if (!configuration || configuration.kind !== 'cinema') return base
    // Only a caller that already resolved a session (site code + sequence id)
    // gets the deeper URL. Both identifiers come from CGV's own picker.
    if (configuration.sessionRef && configuration.cinemaRef && configuration.date) {
      const m = configuration.sessionRef.match(/^(\d{1,12})$/)
      const site = configuration.cinemaRef.match(/^(\d{3})$/)
      if (m && site) {
        return {
          url: `https://www.cgv.vn/default/cinemas/booking/tickets/site/${q(site[1])}/seq/${q(m[1])}/dy/${isoToCompact(configuration.date)}/`,
          depth: 4,
          paramsPreserved: ['filmRef', 'cinemaRef', 'sessionRef', 'date'],
          paramsPageOnly: ['showtime', 'format'],
          paramsDropped: [],
          expiresAt: new Date(`${configuration.date}T23:59:59+07:00`).toISOString(),
          grammar: 'observed',
          limitations: [auth ?? 'CGV yêu cầu đăng nhập trước khi chọn ghế.', 'Sau khi đăng nhập, CGV đưa bạn về đúng suất đã chọn.'],
        }
      }
    }
    return base
  },
}
