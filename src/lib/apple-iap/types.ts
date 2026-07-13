// Apple App Store Server Notifications V2 payload types.
// Reference: https://developer.apple.com/documentation/appstoreservernotifications

export type NotificationType =
  | 'SUBSCRIBED'
  | 'DID_RENEW'
  | 'EXPIRED'
  | 'DID_FAIL_TO_RENEW'
  | 'GRACE_PERIOD_EXPIRED'
  | 'REVOKE'
  | 'REFUND'
  | 'DID_CHANGE_RENEWAL_STATUS'
  | 'PRICE_INCREASE'
  | 'CONSUMPTION_REQUEST'
  | 'RENEWAL_EXTENDED'
  | 'OFFER_REDEEMED'
  | 'TEST'

export type NotificationSubtype =
  | 'INITIAL_BUY'
  | 'RESUBSCRIBE'
  | 'DOWNGRADE'
  | 'UPGRADE'
  | 'AUTO_RENEW_ENABLED'
  | 'AUTO_RENEW_DISABLED'
  | 'VOLUNTARY'
  | 'BILLING_RETRY'
  | 'PRICE_INCREASE'
  | 'PRODUCT_NOT_FOR_SALE'
  | 'BILLING_RECOVERY'
  | 'PENDING'
  | 'ACCEPTED'

/** Decoded from the top-level signedPayload JWS. */
export interface NotificationPayload {
  notificationType: NotificationType
  subtype?: NotificationSubtype
  notificationUUID: string
  version: string
  signedDate: number
  data: NotificationData
  /** Present for TEST notifications only. */
  summary?: unknown
}

export interface NotificationData {
  appAppleId: number
  bundleId: string
  bundleVersion: string
  environment: string
  signedTransactionInfo: string
  signedRenewalInfo?: string
  consumptionRequestReason?: string
}

/** Decoded from data.signedTransactionInfo JWS. */
export interface JWSTransaction {
  transactionId: string
  originalTransactionId: string
  webOrderLineItemId?: string
  bundleId: string
  productId: string
  subscriptionGroupIdentifier?: string
  purchaseDate: number          // ms since epoch
  originalPurchaseDate: number
  expiresDate?: number          // ms since epoch — present for subscriptions
  quantity: number
  type: string
  appAccountToken?: string
  inAppOwnershipType: string
  signedDate: number
  environment: string
  transactionReason?: string
  storefront?: string
  storefrontId?: string
  price?: number
  currency?: string
  revocationDate?: number
  revocationReason?: number
  isUpgraded?: boolean
  offerType?: number
  offerIdentifier?: string
}

/** Decoded from data.signedRenewalInfo JWS. */
export interface JWSRenewalInfo {
  originalTransactionId: string
  productId: string
  autoRenewProductId?: string
  autoRenewStatus: number       // 1 = auto-renew on, 0 = off
  expirationIntent?: number
  gracePeriodExpiresDate?: number
  isInBillingRetryPeriod?: boolean
  offerType?: number
  offerIdentifier?: string
  signedDate: number
  environment: string
  recentSubscriptionStartDate?: number
  renewalDate?: number
  renewalPrice?: number
  currency?: string
}
