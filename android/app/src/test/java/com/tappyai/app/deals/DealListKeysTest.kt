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
 * because it is data-driven: `DealDto.officialUrl` defaults to `""`, so a single backend field
 * rename silently turns EVERY deal blank and takes the screen down.
 */
class DealListKeysTest {

    /**
     * A deal whose only identity is [url] (i.e. `officialUrl`), with a BLANK id.
     *
     * That is deliberate and is the shape the original crash had: the feed sends neither the field
     * the DTO declares nor anything else usable, so identity falls all the way through. Every case
     * below exercises the url fallback; the id-first cases are separate tests at the bottom.
     */
    private fun deal(url: String, title: String = "Deal") = Deal(
        id = "",
        partnerName = "Shopee",
        category = "Ăn uống",
        categoryKey = "Ăn uống",
        title = title,
        description = null,
        officialUrl = url,
        logoImage = null,
        discountLabel = "-50%",
        voucherCode = null,
        endAt = null,
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

    // ── id is the primary identity ────────────────────────────────────────────────────────────
    // The feed does send a uuid `id`, so that is what identity should come from; `officialUrl` is
    // the fallback. Both fields default to "" in the DTO, so both paths have to stay total.

    private fun deal(id: String, url: String, title: String = "Deal") =
        deal(url, title).copy(id = id)

    /** id wins when present — two deals sharing a partner url are still distinct rows. */
    @Test
    fun `ids are preferred over urls as keys`() {
        val keys = dealListKeys(
            listOf(
                deal(id = "uuid-a", url = "https://shopee.vn"),
                deal(id = "uuid-b", url = "https://shopee.vn"),
            ),
        )

        assertEquals(listOf("uuid-a", "uuid-b"), keys)
    }

    /** A blank id must not swallow a perfectly good url — that would lose key stability. */
    @Test
    fun `a blank id falls back to the url`() {
        val keys = dealListKeys(listOf(deal(id = "", url = "https://shopee.vn")))

        assertEquals(listOf("https://shopee.vn"), keys)
    }

    /** The next rename: if the backend drops `id`, seven blank ids must not collide. */
    @Test
    fun `duplicate ids get distinct keys`() {
        val keys = dealListKeys(List(7) { deal(id = "same", url = "", title = "Partner $it") })

        assertEquals(7, keys.size)
        assertEquals(7, keys.toSet().size)
    }

    /** Both identity fields blank — the worst case, and still no collision and no throw. */
    @Test
    fun `deals with neither id nor url get distinct keys`() {
        val keys = dealListKeys(List(7) { deal(id = "   ", url = "\n", title = "Partner $it") })

        assertEquals(7, keys.toSet().size)
    }

    /**
     * Why blanks get their own `deal-index:` namespace instead of just falling through to the
     * duplicate counter.
     *
     * Dropping that branch still yields distinct keys among the blanks themselves — the counter
     * would hand them `""`, `"#2"`, `"#3"` — which is why this looks like dead code until you put a
     * real id next to them. `"#2"` is a string a backend is allowed to send, and then the synthetic
     * key and the genuine one are the same value, and the tab dies exactly as before. Prefixing
     * blanks moves them out of the space real identities live in.
     */
    @Test
    fun `synthetic keys for blank deals cannot collide with a real id`() {
        val keys = dealListKeys(
            listOf(
                deal(id = "", url = ""),
                deal(id = "", url = ""),
                deal(id = "#2", url = "https://a.vn"),
            ),
        )

        assertEquals("blank deals must not be keyed into the same space as real ids", 3, keys.toSet().size)
        assertEquals("#2", keys[2])
    }
}
