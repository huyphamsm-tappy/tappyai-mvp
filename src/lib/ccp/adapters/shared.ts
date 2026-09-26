import type { CommerceRequest, Offer, TransactionDepthProfile } from '../domain/types'
import type { ProviderRegistryEntry } from '../registry/types'
import { depthProfileFor, isAllowedHost } from '../registry'
import { decayConfidence, makeFreshness } from '../domain/freshness'
import type { DiscoveryHint } from './types'

// Helpers shared by the five adapters — kept tiny so each adapter reads as its
// own grammar, not as a framework.

/** Parse a hint URL and confirm it belongs to this provider's allow-listed hosts. */
export function ownedUrl(entry: ProviderRegistryEntry, hint: DiscoveryHint): URL | null {
  if (!hint.url) return null
  try {
    const u = new URL(hint.url)
    if (u.protocol !== 'https:') return null
    if (!isAllowedHost(entry, u.hostname)) return null
    return u
  } catch {
    return null
  }
}

export function profileOrThrow(entry: ProviderRegistryEntry, request: CommerceRequest): TransactionDepthProfile {
  const p = depthProfileFor(entry, request.intentType)
  if (!p) throw new Error(`${entry.providerId}: no depth profile for ${request.intentType}`)
  return p
}

/** Identity-level Offer scaffold: no price, no availability unless the adapter adds them. */
export function baseOffer(
  entry: ProviderRegistryEntry,
  request: CommerceRequest,
  subjectRef: string,
  canonicalUrl: string,
  title: string,
  now: Date = new Date(),
): Offer {
  const profile = profileOrThrow(entry, request)
  const confidence = decayConfidence(1, profile.verifiedOn, now)
  return {
    providerId: entry.providerId,
    merchantId: entry.merchantId,
    merchantName: entry.merchantName,
    domain: request.domain,
    subjectRef,
    canonicalUrl,
    title,
    depthProfile: profile,
    rights: entry.rights,
    freshness: makeFreshness(`registry:${entry.providerId}`, entry.freshness.identity, { now, confidence }),
  }
}

/** Standard limitation sentence for a merchant login boundary (user-facing, vi). */
export function authLimitation(profile: TransactionDepthProfile, merchantName: string): string | null {
  switch (profile.authRequiredAt) {
    case 'before_selection':
      return `${merchantName} yêu cầu đăng nhập trước khi chọn ghế/vé; sau khi đăng nhập bạn tiếp tục đến thanh toán.`
    case 'before_checkout':
      return `${merchantName} yêu cầu đăng nhập trước khi thanh toán; chọn xong trên trang rồi đăng nhập để tiếp tục.`
    case 'before_configuration':
      return `${merchantName} yêu cầu đăng nhập trước khi chọn.`
    case 'at_order':
      return `${merchantName} gửi mã OTP qua SMS khi bạn bấm đặt hàng.`
    case 'app_only':
      return `${merchantName} chỉ nhận đơn trong ứng dụng.`
    default:
      return null
  }
}
