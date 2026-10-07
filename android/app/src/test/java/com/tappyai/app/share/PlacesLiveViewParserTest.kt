package com.tappyai.app.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The `8:` annotation is the ONLY structured recommendation the native stream carries — prose
 * (`0:`) has no phone, no hours, no Maps link. This parser is what makes an Android share as
 * complete as a web share. The fixture is a real `/api/chat` frame, captured unmodified.
 */
class PlacesLiveViewParserTest {

    private val line = File("src/test/resources/share/places_annotation_line.txt").readText().trim()

    @Test
    fun `parses the real annotation frame into places with every whitelisted fact`() {
        val view = PlacesLiveViewParser.fromStreamLine(line)
        assertNotNull(view)
        assertEquals("food", view!!.domain)
        assertEquals(8, view.items.size)
        val first = view.items.first()
        assertTrue(first.name.isNotBlank())
        assertNotNull(first.address)
        assertNotNull(first.rating)
        assertNotNull(first.ratingCount)
        assertNotNull(first.openingHours)
        assertNotNull(first.phone)
        assertTrue(first.actions.any { it.kind == "maps" && it.urlKind == "direct" && it.url.startsWith("https://") })
        assertTrue(first.image!!.startsWith("https://"))
    }

    @Test
    fun `text frames, other annotations and garbage are null and never throw`() {
        assertNull(PlacesLiveViewParser.fromStreamLine("0:\"xin chào\""))
        assertNull(PlacesLiveViewParser.fromStreamLine("8:[{\"kind\":\"tappy.other\",\"items\":[{\"name\":\"x\"}]}]"))
        assertNull(PlacesLiveViewParser.fromStreamLine("8:[{\"kind\":\"tappy.places.v1\",\"items\":[]}]"))
        assertNull(PlacesLiveViewParser.fromStreamLine("8:{not json"))
        assertNull(PlacesLiveViewParser.fromStreamLine("a:{\"toolCallId\":\"1\"}"))
        assertNull(PlacesLiveViewParser.fromStreamLine(""))
    }

    @Test
    fun `an item without a name is dropped, the rest survive`() {
        val v = PlacesLiveViewParser.fromStreamLine(
            "8:[{\"kind\":\"tappy.places.v1\",\"domain\":\"food\",\"items\":[{\"name\":\"  \"},{\"name\":\"Quán A\",\"rating\":4.5}]}]"
        )
        assertEquals(listOf("Quán A"), v!!.items.map { it.name })
        assertEquals(4.5, v.items[0].rating!!, 0.0)
    }

    /** The data model has no slot for sender position or internal ranking; parsing cannot smuggle them in. */
    @Test
    fun `model carries no distanceKm, rank, id or verdict`() {
        val fields = LivePlace::class.java.declaredFields.map { it.name }.toSet()
        for (forbidden in listOf("distanceKm", "rank", "shortlistPosition", "id", "matchVerdict", "priceSignal", "provenance")) {
            assertTrue("LivePlace must not carry $forbidden", forbidden !in fields)
        }
    }
}
