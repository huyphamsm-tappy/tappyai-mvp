package com.tappyai.app.deals

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the Deals LazyColumn key against duplicates.
 *
 * Compose throws `IllegalArgumentException: Key "" was already used` from `subcompose` during
 * measure when two items share a key, which kills the whole tab before it draws — that is the
 * crash this file exists to prevent, and it reproduced on production `com.tappyai.app`
 * versionCode 4 as well as the debug build. It is worth pinning because the crash is invisible in
 * source review (the item lambda is inlined, so no `com.tappyai` frame appears in the stack) and
 * because it is data-driven: `DealDto.url` defaults to `""`, so a single backend field rename
 * silently turns EVERY deal blank and takes the screen down.
 */
class DealListKeysTest {

    private fun deal(url: String, title: String = "Deal") = Deal(
        title = title,
        category = "Ăn uống",
        discount = "-50%",
        url = url,
        source = "Shopee",
        emoji = "🛍️",
        badge = null,
    )

    /** The regression: two blank urls both keyed `""` under the old `key = { it.url }`. */
    @Test
    fun `two deals with blank urls get distinct keys`() {
        val keys = dealListKeys(listOf(deal(""), deal("")))

        assertEquals(2, keys.toSet().size)
    }

    /** The shape actually served by production `/api/deals`: no `url` field at all, so the DTO
     *  default blanks all seven rows. This is the exact list that crashed the device. */
    @Test
    fun `an all-blank feed produces one unique key per deal`() {
        val deals = List(7) { deal("", title = "Partner $it") }

        val keys = dealListKeys(deals)

        assertEquals(7, keys.size)
        assertEquals(7, keys.toSet().size)
    }

    /** Blank is not the only way to collide — the same partner url can appear twice. */
    @Test
    fun `duplicate non-blank urls get distinct keys`() {
        val keys = dealListKeys(listOf(deal("https://shopee.vn/x"), deal("https://shopee.vn/x")))

        assertEquals(2, keys.toSet().size)
    }

    /** A url that is only whitespace is as unusable as an empty one and must not collide. */
    @Test
    fun `whitespace-only urls are treated as blank and do not collide`() {
        val keys = dealListKeys(listOf(deal(""), deal("   "), deal("\n")))

        assertEquals(3, keys.toSet().size)
    }

    /**
     * The whole reason `key` is passed at all: a unique url must survive as its own key, so
     * scroll position and item state stay attached to the deal across reloads. Falling back to
     * bare indices everywhere would silence the crash and lose that.
     */
    @Test
    fun `unique urls are used verbatim as keys`() {
        val keys = dealListKeys(listOf(deal("https://a.vn"), deal("https://b.vn")))

        assertEquals(listOf("https://a.vn", "https://b.vn"), keys)
    }

    /** Keys line up positionally with the list they came from — the screen indexes into them. */
    @Test
    fun `keys are positionally aligned with the input list`() {
        val deals = listOf(deal("https://a.vn"), deal(""), deal("https://b.vn"))

        val keys = dealListKeys(deals)

        assertEquals(deals.size, keys.size)
        assertEquals("https://a.vn", keys[0])
        assertEquals("https://b.vn", keys[2])
    }

    /** Same input, same keys — otherwise Compose would drop item state on every recomposition. */
    @Test
    fun `key derivation is deterministic`() {
        val deals = listOf(deal(""), deal("https://a.vn"), deal("https://a.vn"), deal(""))

        assertEquals(dealListKeys(deals), dealListKeys(deals))
    }

    @Test
    fun `an empty feed yields no keys`() {
        assertTrue(dealListKeys(emptyList()).isEmpty())
    }
}
