package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Android offer-link classifier must stay in lockstep with web's `offerDestination` /
 * `offerActionLabel` (src/components/chat/structured/OfferRow.tsx) so the two platforms cannot drift:
 * a Serper google-search redirect is a SEARCH (→ "Tìm trên …", fires shopping_search_click), a real
 * merchant product page is DIRECT (→ "Xem"/"Xem trên …", no event). Same cases web reasons about.
 */
class OfferDestinationTest {

    // 1. The Serper /shopping google redirect — the whole reason this exists.
    @Test
    fun `google shopping redirect is a search, not a product page`() {
        val d = offerDestination("https://www.google.com/search?ibp=oshop&q=tai+nghe", "Shopee")!!
        assertEquals("Google", d.platform) // the site the link opens, not the seller
        assertFalse("a search redirect is never direct", d.direct)
        assertFalse("google is not the named seller", d.isSeller)
        assertEquals(OfferLabelKind.VIEW_ON_SEARCH, offerLabelKind(d))
        // → shopping_search_click fires (the tap gate is !direct)
        assertTrue(!d.direct)
    }

    // 2. A genuine seller product page keeps the plain "Xem" label and fires nothing.
    @Test
    fun `a real shopee product page is direct and by the named seller`() {
        val d = offerDestination("https://shopee.vn/Tai-nghe-Sony-i.123.456789", "Shopee")!!
        assertEquals("Shopee", d.platform)
        assertTrue(d.direct)
        assertTrue(d.isSeller)
        assertEquals(OfferLabelKind.VIEW, offerLabelKind(d))
        assertFalse("no event on a direct product page", !d.direct)
    }

    // 3. A direct product page on a platform that is NOT the named seller → "Xem trên …".
    @Test
    fun `direct product on a non-seller platform labels view-on`() {
        val d = offerDestination("https://tiki.vn/dien-thoai-p246810.html", "CellphoneS")!!
        assertEquals("Tiki", d.platform)
        assertTrue(d.direct)
        assertFalse(d.isSeller)
        assertEquals(OfferLabelKind.VIEW_ON, offerLabelKind(d))
    }

    // 4. A catalog/search path on a real merchant host is still a search.
    @Test
    fun `a merchant search or catalog path is a search`() {
        assertFalse(offerDestination("https://lazada.vn/catalog/?q=abc", "Lazada")!!.direct)
        assertFalse(offerDestination("https://tiki.vn/search/nike", "Tiki")!!.direct)
    }

    // 5. Any query string marks the link a search (mirrors web's `u.search.length > 1`).
    @Test
    fun `a query string makes the link a search`() {
        val d = offerDestination("https://tiki.vn/p?spid=99", "Tiki")!!
        assertFalse(d.direct)
        assertEquals(OfferLabelKind.VIEW_ON_SEARCH, offerLabelKind(d))
    }

    // 6. A bare root is not a product page.
    @Test
    fun `a bare host root is not direct`() {
        assertFalse(offerDestination("https://shopee.vn/", "Shopee")!!.direct)
    }

    // 7. Null / blank / unparseable → no destination → the safe "Xem" label, no event.
    @Test
    fun `null blank or unparseable url yields no destination`() {
        assertNull(offerDestination(null, "Shopee"))
        assertNull(offerDestination("", "Shopee"))
        assertNull(offerDestination("not a url", "Shopee"))
        assertEquals(OfferLabelKind.VIEW, offerLabelKind(null))
    }
}
