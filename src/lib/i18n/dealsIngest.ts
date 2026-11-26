// Display words of the deals the Accesstrade importer writes (partner_deals rows). Kept here, not in the importer, so every Vietnamese word of the page lives in src/lib/i18n.
// `category` is the VI base label the Deals page already styles by (see CATEGORY_TONE in DealsView): the same strings the admin-managed rows use.

export const DEAL_CATEGORY_SHOPPING = 'Mua sắm'
export const DEAL_CATEGORY_TRAVEL = 'Du lịch'

/** Shown as the headline when an offer has neither a coupon description nor a usable name. */
export const DEAL_FALLBACK_TITLE = {
  lazada: 'Ưu đãi Lazada',
  vexere: 'Ưu đãi Vexere',
} as const
