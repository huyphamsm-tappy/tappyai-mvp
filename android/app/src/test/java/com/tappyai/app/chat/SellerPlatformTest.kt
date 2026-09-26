package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Test

/** The Kotlin twin of web's sellerPlatform — a free-text seller maps to a fixed enum, and the
 *  raw string is never surfaced. Mirrors src/lib/commerce/sellerPlatform.test.ts. */
class SellerPlatformTest {

    @Test
    fun `known marketplaces bucket case-insensitively`() {
        assertEquals("shopee", sellerPlatform("Shopee"))
        assertEquals("shopee", sellerPlatform("shopee vietnam"))
        assertEquals("lazada", sellerPlatform("Lazada"))
        assertEquals("tiki", sellerPlatform("Tiki"))
        assertEquals("tiki", sellerPlatform("Tiki Trading"))
        assertEquals("tiktok", sellerPlatform("TikTok Shop"))
    }

    @Test
    fun `TikTok is not mis-bucketed as tiki`() {
        assertEquals("tiktok", sellerPlatform("TikTok Shop"))
    }

    @Test
    fun `everything else and null is other`() {
        assertEquals("other", sellerPlatform("CellphoneS"))
        assertEquals("other", sellerPlatform("Điện Máy Xanh"))
        assertEquals("other", sellerPlatform(""))
        assertEquals("other", sellerPlatform(null))
    }
}
