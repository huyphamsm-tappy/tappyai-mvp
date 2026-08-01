package com.tappyai.app.deals

/**
 * One curated partner deal — mirrors the web PRODUCTION `PartnerDeal` public shape
 * (`src/lib/deals/partnerDeals.ts`, admin-managed `partner_deals` rows). The old hardcoded
 * "shopee-deals" model (discount/emoji/source/badge) is gone on prod; this is the current contract.
 * Optional promo fields ([discountLabel]/[voucherCode]/[endAt]) drive the badge / voucher chip /
 * countdown, each shown only when present.
 */
data class Deal(
    val id: String,
    val partnerName: String,
    // [category] is the localized display label; [categoryKey] is the language-independent
    // styling key (the vi base label) so the category→colour map survives a language switch.
    val category: String,
    val categoryKey: String,
    val title: String,
    val description: String?,
    val officialUrl: String,
    val logoImage: String?,
    val discountLabel: String?,
    val voucherCode: String?,
    val endAt: String?,
)
