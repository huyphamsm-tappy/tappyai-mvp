package com.tappyai.app.chat

import com.tappyai.app.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The V3 place decision section — the Web Information Contract, on a phone.
 *
 * INFORMATION: [placeCardFacts] is the one function the card draws from, row for row, so what
 * it returns for a full Google-like row IS what the user sees (the composable adds no field of
 * its own — pinned below by reading the source). The fixture is the shape web's `LivePlace`
 * carries; nothing here invents a field the wire does not have.
 *
 * CAROUSEL: the pages are the server's rows in the server's order, every one of them; a chip
 * removes pages without reordering, and a card's "#N" is its position in the SERVER list. The
 * swipe itself is Compose's `HorizontalPager` and is verified on the device; here its use — and
 * the absence of a vertical stack — is pinned by reading the source.
 */
class PlaceDecisionSectionTest {

    // ── Fixtures: the canonical wire shapes ─────────────────────────────────

    private fun liveAction(kind: String, url: String, urlKind: String = "direct", platform: String? = null, attributed: Boolean? = null) =
        LivePlaceAction(kind = kind, urlKind = urlKind, url = url, labelKey = "v3.action.$kind", platform = platform, attributed = attributed)

    /** A Google-like row, every optional field present — the prod web screenshot's data. */
    private val gocHue = LivePlace(
        id = "place:google:ChIJgocHue",
        domain = "food",
        kind = "place",
        name = "GÓC HUẾ - Nguyễn Thái Bình",
        image = "https://lh3.googleusercontent.com/places/goc-hue.jpg",
        address = "8 Nguyễn Thái Bình, Phường Nguyễn Thái Bình, Quận 1",
        rating = 4.7,
        ratingCount = 888,
        openingHours = "08:00–21:30",
        openNow = true,
        phone = "+84 28 3821 4455",
        priceLevel = 2,
        priceSignal = "~60k/tô",
        priceRangeText = "100-200 N ₫",
        tappyRating = LiveTappyRating(avg = 4.5, count = 12),
        distanceKm = 1.2,
        categories = listOf("vietnamese_restaurant", "restaurant", "cafe"),
        flags = listOf("wifi", "outdoorSeating"),
        rank = 0,
        shortlistPosition = 1,
        recommended = true,
        reasons = listOf(LivePlaceReason("rating", "4.7⭐ · 888 đánh giá")),
        tradeOff = LivePlaceReason("distance", "xa trung tâm hơn khoảng 1,5km"),
        actions = listOf(
            liveAction("order", "https://shopeefood.vn/tim-kiem?q=G%C3%93C%20HU%E1%BA%BE", urlKind = "search", platform = "ShopeeFood"),
            liveAction("order", "https://food.grab.com/vn/en/s?searchKeyword=G%C3%93C%20HU%E1%BA%BE", urlKind = "search", platform = "GrabFood"),
            liveAction("maps", "https://maps.google.com/?cid=123"),
            liveAction("review", "https://www.youtube.com/results?search_query=G%C3%93C%20HU%E1%BA%BE%20review", urlKind = "search", attributed = false),
            liveAction("website", "https://gochue.vn"),
            liveAction("call", "tel:+842838214455"),
        ),
    )

    private fun card(
        name: String,
        rank: Int,
        rating: Double? = null,
        ratingCount: Int? = null,
        openNow: Boolean? = null,
        flags: List<String> = emptyList(),
        actions: List<PlaceCardAction> = emptyList(),
    ) = PlaceCardView(name = name, rank = rank, rating = rating, ratingCount = ratingCount, openNow = openNow, flags = flags, actions = actions)

    private fun action(kind: String, url: String, urlKind: String = "direct", platform: String? = null, attributed: Boolean? = null) =
        PlaceCardAction(kind = kind, urlKind = urlKind, url = url, labelKey = "v3.action.$kind", platform = platform, attributed = attributed)

    // ── INFORMATION 1-18: the full-data card, through the real projection ───

    private val fullFacts = placeCardFacts(gocHue.toCardView(), position = 0, ranked = true)

    @Test
    fun `1 rating and 2 review count`() {
        assertEquals(4.7, fullFacts.rating!!, 0.0)
        assertEquals(888, fullFacts.ratingCount)
        assertNull("a hotel class never shows beside a guest rating", fullFacts.stars)
    }

    @Test
    fun `3 rank badge and lead treatment, popular because 888 ratings carry it`() {
        assertEquals(1, fullFacts.rankLabel)
        assertTrue(fullFacts.lead)
        assertTrue(fullFacts.popular)
        // Second place: numbered, not the lead, never popular.
        val second = placeCardFacts(gocHue.toCardView(), position = 1, ranked = true)
        assertEquals(2, second.rankLabel)
        assertFalse(second.lead)
        assertFalse(second.popular)
        // An unranked set prints no position at all (RANK-07).
        val unranked = placeCardFacts(gocHue.toCardView(), position = 0, ranked = false)
        assertNull(unranked.rankLabel)
        assertFalse(unranked.lead)
        assertFalse(unranked.popular)
    }

    @Test
    fun `4 image and 5 name`() {
        assertEquals("https://lh3.googleusercontent.com/places/goc-hue.jpg", fullFacts.image)
        assertEquals("GÓC HUẾ - Nguyễn Thái Bình", fullFacts.name)
    }

    @Test
    fun `6 address, 7 hours, 8 open state`() {
        assertEquals("8 Nguyễn Thái Bình, Phường Nguyễn Thái Bình, Quận 1", fullFacts.address)
        assertEquals("08:00–21:30", fullFacts.openingHours)
        assertEquals(true, fullFacts.openNow)
    }

    @Test
    fun `9 price level as a band and 10 distance`() {
        assertEquals("₫₫", fullFacts.priceBand)
        assertEquals(1.2, fullFacts.distanceKm!!, 0.0)
        assertNull(priceBand(0))
        assertNull(priceBand(5))
        assertEquals("₫₫₫₫", priceBand(4))
    }

    @Test
    fun `11 categories, at most two, and 12 amenities first`() {
        assertEquals(
            listOf(
                PlaceChip.Amenity("wifi"),
                PlaceChip.Amenity("outdoorSeating"),
                PlaceChip.Category("vietnamese_restaurant"),
                PlaceChip.Category("restaurant"),
            ),
            fullFacts.chips,
        )
        assertEquals(2, CATEGORY_CHIPS)
    }

    @Test
    fun `13 trade-off evidence, and the reasons as web's Vì sao row`() {
        assertEquals("xa trung tâm hơn khoảng 1,5km", fullFacts.tradeOff)
        assertEquals(listOf("4.7⭐ · 888 đánh giá"), fullFacts.reasons)
    }

    @Test
    fun `phone number, Tappy rating, price range and reference price - the rows web added`() {
        assertEquals("+84 28 3821 4455", fullFacts.phone)
        assertEquals(LiveTappyRating(4.5, 12), fullFacts.tappyRating)
        assertEquals("100-200 N ₫", fullFacts.priceRangeText)
        assertEquals("~60k/tô", fullFacts.priceSignal)
        // Absent on the wire → absent on the card.
        val bare = placeCardFacts(PlaceCardView(name = "X", rank = 0), 0, true)
        assertNull(bare.phone); assertNull(bare.tappyRating); assertNull(bare.priceRangeText); assertNull(bare.priceSignal)
        assertTrue(bare.reasons.isEmpty())
    }

    @Test
    fun `14 map leads, 15 order platforms follow, 16-18 review website call are secondary`() {
        val g = fullFacts.actions
        assertEquals("maps", g.maps?.kind)
        assertEquals(listOf("ShopeeFood", "GrabFood"), g.orders.map { it.platform })
        assertEquals(listOf("review", "website", "call"), g.others.map { it.kind })
        assertEquals("tel:+842838214455", g.others.last().url)
    }

    @Test
    fun `labels are web's - the platform comes from the host when the action did not say`() {
        val g = fullFacts.actions
        assertEquals(R.string.place_action_maps to null, actionLabelSpec(g.maps!!))
        assertEquals(R.string.place_action_search_on to "ShopeeFood", actionLabelSpec(g.orders[0]))
        assertEquals(R.string.place_action_search_on to "GrabFood", actionLabelSpec(g.orders[1]))
        // "Tìm review trên YouTube": a review SEARCH, platform read off youtube.com.
        assertEquals(R.string.place_action_review_search_on to "YouTube", actionLabelSpec(g.others[0]))
        assertEquals(R.string.place_action_website to null, actionLabelSpec(g.others[1]))
        assertEquals(R.string.place_action_call to null, actionLabelSpec(g.others[2]))
    }

    @Test
    fun `an attributed review says review, a search says search, no platform says so generically`() {
        assertEquals(
            R.string.place_action_review_on to "TikTok",
            actionLabelSpec(action("review", "https://www.tiktok.com/@x/video/1", attributed = true)),
        )
        assertEquals(
            R.string.place_action_review_search_on to "Google",
            actionLabelSpec(action("review", "https://www.google.com/search?q=x+review", urlKind = "search", attributed = false)),
        )
        assertEquals(R.string.place_action_review_search_generic to null, actionLabelSpec(action("review", "not a url")))
        assertEquals(R.string.place_action_review to null, actionLabelSpec(action("review", "not a url", attributed = true)))
        // An unbranded host still names itself, like web.
        assertEquals("Foody", platformOf(action("review", "https://www.foody.vn/x")))
        assertNull(platformOf(action("call", "tel:123")))
    }

    @Test
    fun `search labels for rooms and tickets, plain verbs for direct destinations, unknown kind reads as website`() {
        assertEquals(
            R.string.place_action_booking_search_on to "Booking.com",
            actionLabelSpec(action("booking", "https://www.booking.com/searchresults.html?ss=x", urlKind = "search")),
        )
        assertEquals(R.string.place_action_booking to null, actionLabelSpec(action("booking", "https://www.booking.com/hotel/vn/x.html")))
        assertEquals(R.string.place_action_ticket_search_on to "Ticketbox", actionLabelSpec(action("ticket", "https://ticketbox.vn/search?q=x", urlKind = "search")))
        assertEquals(R.string.place_action_order to null, actionLabelSpec(action("order", "https://shopeefood.vn/ho-chi-minh/goc-hue")))
        assertEquals(R.string.place_action_purchase to null, actionLabelSpec(action("purchase", "https://tiki.vn/p/1")))
        assertEquals(R.string.place_action_website to null, actionLabelSpec(action("hologram", "https://h.vn")))
        // A search with no platform at all is a plain search.
        assertEquals(R.string.place_action_search_generic to null, actionLabelSpec(action("order", "nope", urlKind = "search")))
    }

    @Test
    fun `a row without the optional fields renders none of them - no zeros, no placeholders`() {
        val bare = LivePlace(id = "place:osm:1", name = "Bún bò Xuà", rank = 3, actions = listOf(liveAction("maps", "https://maps.google.com/?q=1")))
        val f = placeCardFacts(bare.toCardView(), position = 3, ranked = true)
        assertEquals("Bún bò Xuà", f.name)
        assertEquals(4, f.rankLabel)
        assertNull(f.image); assertNull(f.rating); assertNull(f.ratingCount); assertNull(f.stars)
        assertNull(f.address); assertNull(f.openingHours); assertNull(f.openNow)
        assertNull(f.priceBand); assertNull(f.distanceKm); assertNull(f.tradeOff)
        assertNull(f.phone); assertNull(f.tappyRating); assertNull(f.priceRangeText)
        assertTrue(f.chips.isEmpty()); assertTrue(f.reasons.isEmpty())
        assertEquals("maps", f.actions.maps?.kind)
        assertTrue(f.actions.orders.isEmpty()); assertTrue(f.actions.others.isEmpty())
    }

    @Test
    fun `a hotel class shows only without a guest rating, and a count never shows without a rating`() {
        val stay = PlaceCardView(name = "Hotel", rank = 0, stars = 4, ratingCount = 10)
        val f = placeCardFacts(stay, 0, true)
        assertEquals(4, f.stars)
        assertNull(f.rating)
        assertNull("a count without a rating is a number about nothing", f.ratingCount)
        val rated = placeCardFacts(stay.copy(rating = 4.2), 0, true)
        assertNull(rated.stars)
        assertEquals(10, rated.ratingCount)
    }

    @Test
    fun `a blank URL is not a button, and the durable projection feeds the same card`() {
        val g = groupActions(listOf(action("website", ""), action("maps", "https://m"), action("call", "tel:1")))
        assertEquals("maps", g.maps?.kind)
        assertEquals(listOf("call"), g.others.map { it.kind })

        val durable = PersistedPlace(
            id = "place:osm:1", name = "Bún Bò 5T", address = "70 Nguyễn Trường Tộ", rating = 4.5, ratingCount = 120,
            openingHours = "Mo-Su 06:00-21:00", openNow = false, phone = "+84 28 3822 1234", priceLevel = 1, distanceKm = 0.8, rank = 0,
            actions = listOf(PersistedPlaceAction(kind = "review", urlKind = "direct", url = "https://www.tiktok.com/@a/video/2", labelKey = "v3.action.review", attributed = true)),
        )
        val f = placeCardFacts(durable.toCardView()!!, 0, true)
        assertEquals(4.5, f.rating!!, 0.0); assertEquals(120, f.ratingCount)
        assertEquals("+84 28 3822 1234", f.phone)
        assertEquals("70 Nguyễn Trường Tộ", f.address); assertEquals(false, f.openNow); assertEquals("₫", f.priceBand)
        assertEquals(R.string.place_action_review_on to "TikTok", actionLabelSpec(f.actions.others.single()))
        assertNull("no name persisted (Google terms) → no card", PersistedPlace(id = "x", rank = 1).toCardView())
    }

    // ── Filters: web `buildFilters` ─────────────────────────────────────────

    @Test
    fun `All is always first and a chip appears only when it splits the rows`() {
        val items = listOf(
            card("A", 0, rating = 4.8, openNow = true, flags = listOf("wifi")),
            card("B", 1, rating = 4.2, openNow = false, flags = listOf("wifi")),
            card("C", 2, rating = 4.6, openNow = true),
        )
        val ids = placeFilters(items).map { it.id }
        assertEquals(PlaceFilterId.All, ids.first())
        assertTrue(PlaceFilterId.Open in ids)
        assertTrue(PlaceFilterId.Rated in ids)
        assertTrue(PlaceFilterId.Wifi in ids)
        assertFalse(PlaceFilterId.Vegetarian in ids)
        assertFalse(PlaceFilterId.Outdoor in ids)
        // Every row passes → no chip; 4.5 is the rated line, exactly as web.
        assertEquals(listOf(PlaceFilterId.All), placeFilters(listOf(card("A", 0, openNow = true), card("B", 1, openNow = true))).map { it.id })
        val rated = placeFilters(listOf(card("A", 0, rating = 4.5), card("B", 1, rating = 4.49))).first { it.id == PlaceFilterId.Rated }
        assertTrue(rated.matches(card("A", 0, rating = 4.5)))
        assertFalse(rated.matches(card("B", 1, rating = 4.49)))
    }

    // ── CAROUSEL 19-28 ──────────────────────────────────────────────────────

    private val six = (0 until 6).map { card("P$it", it, openNow = it % 2 == 0, rating = 4.0 + it * 0.2) }
    private val all = placeFilters(six).first { it.id == PlaceFilterId.All }
    private val open = placeFilters(six).first { it.id == PlaceFilterId.Open }

    @Test
    fun `19-22 six merchants page through the first three in server order, the count chip says six`() {
        val pages = carouselPlaces(six, all)
        assertEquals(3, PLACES_VISIBLE)
        assertEquals(listOf("P0", "P1", "P2"), pages.map { it.name })
        assertEquals(listOf(1, 2, 3), pages.map { placeCardFacts(it, six.indexOf(it), true).rankLabel })
        assertSame("the objects are the server's, untouched", six[2], pages[2])
        // The other three are reachable through the chips and the map footer — web's rule.
        assertTrue(showsFilterRow(six, placeFilters(six)))
    }

    @Test
    fun `27 a chip narrows the pages without reordering, and 26 the rank badge keeps the server position`() {
        val pages = carouselPlaces(six, open)
        assertEquals(listOf("P0", "P2", "P4"), pages.map { it.name })
        // #1, #3, #5 — not #1, #2, #3: hiding a merchant does not promote the next one.
        assertEquals(listOf(1, 3, 5), pages.map { placeCardFacts(it, six.indexOf(it), true).rankLabel })
        // Never sorted by rating: P5 has the best rating and is NOT promoted into the three pages
        // under All — server order, first three, exactly web's `slice(0, VISIBLE)`.
        assertEquals(listOf("P0", "P1", "P2"), carouselPlaces(six, all).map { it.name })
    }

    @Test
    fun `the chip row shows when rows overflow the three cards or when a chip can change the result`() {
        val one = listOf(card("A", 0))
        assertFalse(showsFilterRow(one, placeFilters(one)))
        val two = listOf(card("A", 0), card("B", 1))
        assertFalse("two rows fit, nothing to filter", showsFilterRow(two, placeFilters(two)))
        val four = (0 until 4).map { card("P$it", it) }
        assertTrue("four rows overflow: the count is the honest answer", showsFilterRow(four, placeFilters(four)))
        val split = listOf(card("A", 0, openNow = true), card("B", 1, openNow = false))
        assertTrue(showsFilterRow(split, placeFilters(split)))
    }

    @Test
    fun `23 25 28 the section is a horizontal pager with dots and the map CTA below it - not a vertical stack`() {
        val src = File(findSrc("app/src/main/java/com/tappyai/app/chat/PlaceCard.kt")).readText().replace(Regex("(?m)^\\s*//.*$"), "")
        assertTrue("Compose's pager, one merchant per viewport", src.contains("HorizontalPager("))
        assertTrue("stable identity per merchant", src.contains("key = { page -> pages[page]"))
        assertTrue("the next card peeks in", src.contains("contentPadding = PaddingValues(end = if (pages.size > 1) PAGE_PEEK else 0.dp)"))
        assertTrue("position dots", src.contains("PagerDots(count = pages.size, current = pagerState.currentPage)"))
        assertTrue("a chip restarts at the first admitted merchant", src.contains("LaunchedEffect(active.id) { if (pagerState.currentPage != 0) pagerState.scrollToPage(0) }"))
        assertFalse("no vertical stack of cards", src.contains(".forEach { place ->"))
        assertTrue("web's visible-3 cap", src.contains("items.filter(filter.matches).take(PLACES_VISIBLE)"))
        val pager = src.indexOf("HorizontalPager(")
        val footer = src.indexOf("ExploreMapFooter(onClick")
        assertTrue("the map CTA is composed after the pager", pager in 1 until footer)
        // The card draws from the facts and only from the facts (plus the CCP handoff callbacks,
        // which carry no place data — they are where a commerce tap is REPORTED to).
        assertTrue(src.contains("private fun PlaceCard(facts: PlaceCardFacts, commerce: CommerceActionCallbacks = CommerceActionCallbacks())"))
        assertFalse("the card has no access to fields the facts do not expose", src.contains("private fun PlaceCard(place: PlaceCardView"))
        assertTrue("rank is the SERVER position", src.contains("position = places.indexOf(place)"))
        assertTrue("the section is the only place renderer", src.contains("fun PlaceDecisionSection("))
        // Web prints the rating with String(): "5" for a 5-star spa, never Kotlin's "5.0"
        // (five-domain E2E 2026-09-12, Hyan Spa read "5.0" on the phone and "5" on web).
        assertTrue("rating printed like web String()", src.contains("text = numberText(rating),"))
        assertFalse(src.contains("text = rating.toString(),"))
        assertEquals("5", numberText(5.0)); assertEquals("4.9", numberText(4.9))
    }

    // ── CTA de-duplication (web `ChatInterface.tsx`) ────────────────────────

    @Test
    fun `a model CTA that points at a page a card already offers is dropped at render`() {
        val places = listOf(
            card("A", 0, actions = listOf(action("maps", "https://maps.google.com/?q=A"), action("website", "https://a.vn/menu"))),
        )
        val buttons = listOf(
            CtaButton(label = "Xem bản đồ", type = "maps", url = "https://maps.google.com/?q=A&hl=vi"),
            CtaButton(label = "Website", type = "website", url = "https://a.vn/menu"),
            CtaButton(label = "Gọi", type = "call", url = "tel:123"),
            CtaButton(label = "Tất cả", type = "maps", url = "https://www.google.com/maps/search/?api=1&query=bun+bo"),
        )
        val kept = ctaButtonsOutsideCards(buttons, places, "https://www.google.com/maps/search/?api=1&query=x")
        assertEquals(listOf("Gọi"), kept.map { it.label })
        val loose = listOf(CtaButton(label = "Đặt", type = "booking", url = "https://b"))
        assertSame(loose, ctaButtonsOutsideCards(loose, emptyList(), null))
        assertEquals("https://x.vn/a/b", urlKey("https://x.vn/a/b?c=1&d=2"))
    }

    // ── PRECEDENCE 29-32: wiring in the screen and the wire ─────────────────

    @Test
    fun `29 shopping hides places, 31 live renders, 32 durable is the fallback, and ranked plus the map url reach the section`() {
        val screen = File(findSrc("app/src/main/java/com/tappyai/app/chat/ChatScreen.kt")).readText().replace(Regex("(?m)^\\s*//.*$"), "")
        assertTrue("places yield to a shopping decision, like web", screen.contains("if (message.shopping == null)"))
        assertTrue("live first, durable as the fallback", screen.contains("?: placesOutsideItinerary(message.plan, message.places)"))
        assertTrue("the server's ranked flag reaches the section", screen.contains("ranked = message.livePlaces?.ranked != false"))
        assertTrue("the server's map url reaches the section", screen.contains("mapsSearchUrl = placesMapsUrl"))
        assertTrue("CTA buttons are de-duplicated against the cards", screen.contains("ctaButtonsOutsideCards(message.ctaButtons, placeCards, placesMapsUrl)"))
        assertFalse("no second place renderer", screen.contains("PlaceRecommendationRail"))
        assertFalse("no old places schema on the screen", screen.contains("PlaceCards("))
        assertNotNull(screen)
    }

    @Test
    fun `30 the inline gallery is not stripped on the client - the surface header is what removes it`() {
        val parser = File(findSrc("app/src/main/java/com/tappyai/app/chat/ChatResponse.kt")).readText()
        assertTrue("places keep their gallery segments in the parser", parser.contains("PLACES ARE DELIBERATELY NOT GATED HERE"))
        assertTrue(parser.contains("val presented = if (shoppingCardWillRender) stripInjectedEnrichment(text) else text"))
        val repo = File(findSrc("app/src/main/java/com/tappyai/app/chat/data/RealChatRepository.kt")).readText()
        assertTrue("Android declares itself a decision-card surface", repo.contains("internal const val SURFACE_ANDROID = \"android\""))
        assertTrue(repo.contains(".header(SURFACE_HEADER, SURFACE_ANDROID)"))
    }

    private fun findSrc(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.path
            dir = dir.parentFile
        }
        error("$rel not found")
    }
}
