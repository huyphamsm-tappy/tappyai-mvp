package com.tappyai.app.chat

import androidx.annotation.StringRes
import com.tappyai.app.R

/**
 * The label a place-card action renders, resolved from the key the SERVER decided.
 *
 * Cross-platform CCP contract (14 Sep 2026): the server's one label resolver
 * (`resolveActionLabel`, src/lib/recommendation/actionLabel.ts) turns (kind, urlKind, url,
 * platform, attributed, commerce) into ONE key — "Mua trên TikTok Shop · cần đăng nhập" is
 * `v3.action.purchaseLoginOn` + platform — and projects that key on the wire. This file only maps
 * the key to a string resource; it never looks at the URL, the depth or the login boundary to
 * decide what to promise. A client that re-derived the promise is a client that could drift, which
 * is exactly what `shared/ccp/commerce-action-fixtures.json` exists to catch.
 *
 * 🚨 A key this app version has never seen falls back to a generic "Open" (or "Search on …" for a
 * search) rather than rendering the raw key — never to a stronger verb.
 */
data class PlaceActionLabel(@StringRes val resId: Int, val platform: String? = null)

fun placeActionLabel(labelKey: String, urlKind: String, platform: String?): PlaceActionLabel {
    val leaf = labelKey.substringAfterLast('.')
    val named = platform?.takeIf { it.isNotBlank() }
    // Keys that take the merchant name. The server only emits one of these when it knows the
    // platform; a payload that somehow lacks it drops to the platform-less sibling below.
    val withPlatform: Int? = if (named == null) null else when (leaf) {
        "searchOn" -> R.string.place_action_search_on
        "searchLoginOn" -> R.string.place_action_search_login_on
        "bookingSearch" -> R.string.place_action_booking_search
        "ticketSearch" -> R.string.place_action_ticket_search
        "orderSearch" -> R.string.place_action_order_search
        "viewOn" -> R.string.place_action_view_on
        "purchaseOn" -> R.string.place_action_purchase_on
        "purchaseLoginOn" -> R.string.place_action_purchase_login_on
        "purchaseAppOn" -> R.string.place_action_purchase_app_on
        "bookingOn" -> R.string.place_action_booking_on
        "bookingLoginOn" -> R.string.place_action_booking_login_on
        "bookingAppOn" -> R.string.place_action_booking_app_on
        "reservationOn" -> R.string.place_action_reservation_on
        "reservationLoginOn" -> R.string.place_action_reservation_login_on
        "reservationAppOn" -> R.string.place_action_reservation_app_on
        "ticketOn" -> R.string.place_action_ticket_on
        "ticketLoginOn" -> R.string.place_action_ticket_login_on
        "ticketAppOn" -> R.string.place_action_ticket_app_on
        "orderOn" -> R.string.place_action_order_on
        "orderLoginOn" -> R.string.place_action_order_login_on
        "orderAppOn" -> R.string.place_action_order_app_on
        "deliveryOn" -> R.string.place_action_delivery_on
        "deliveryLoginOn" -> R.string.place_action_delivery_login_on
        "deliveryAppOn" -> R.string.place_action_delivery_app_on
        "reviewOn", "reviewSearch" -> R.string.place_action_review
        else -> null
    }
    if (withPlatform != null) return PlaceActionLabel(withPlatform, named)

    // A platform key that arrived without its platform keeps the plain verb, as web does (`withPlatform` fallback).
    val base = leaf.removeSuffix("LoginOn").removeSuffix("AppOn").removeSuffix("On")
    val plain = when (base) {
        "maps" -> R.string.place_action_maps
        "directions" -> R.string.place_action_directions
        "website" -> R.string.place_action_website
        "order" -> R.string.place_action_order
        "delivery" -> R.string.place_action_delivery
        "booking" -> R.string.place_action_booking
        "reservation" -> R.string.place_action_reservation
        "ticket" -> R.string.place_action_ticket
        "purchase" -> R.string.place_action_purchase
        "call" -> R.string.place_action_call
        "review", "reviewOn", "reviewSearch", "reviewSearchGeneric" -> R.string.place_action_review
        "social" -> R.string.place_action_social
        "searchGeneric", "search", "bookingSearch", "ticketSearch", "orderSearch" -> R.string.place_action_search_generic
        else -> null
    }
    if (plain != null) return PlaceActionLabel(plain)
    // Unknown key: a search with a platform is still honestly "Search on X"; anything else is "Open".
    return if (urlKind == "search" && named != null) PlaceActionLabel(R.string.place_action_search_on, named) else PlaceActionLabel(R.string.place_action_open)
}
