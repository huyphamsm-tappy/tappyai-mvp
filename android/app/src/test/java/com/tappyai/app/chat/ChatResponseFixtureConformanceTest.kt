package com.tappyai.app.chat

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

/**
 * P4-02 — SHARED STRUCTURED-CONTENT CONFORMANCE (Android side).
 *
 * The cases come from `shared/structured-content/marker-fixtures.json`, the SAME file Web and iOS
 * read. One file, three consumers: when the server gains a marker or changes a shape, the fixture
 * is edited once and all three suites fail until all three parsers agree.
 *
 * WHY THIS EXISTS. `ChatResponseParserMarkerLeakTest` already covers marker LEAKS exhaustively,
 * and it passes. It does not cover the shape that actually broke production on 2026-08-27: a CTA
 * block in its BARE form (no closing tag) with `[FOLLOWUPS]` trailing it. `CTA_NOTAG_RE` is
 * end-anchored (`\s*$`), so the trailing followups line prevents it from matching; the buttons are
 * silently LOST, and because Android had no unterminated-CTA pattern (only a tag strip) the raw
 * `{"buttons":…}` JSON was rendered as message body.
 *
 * Web fixed this by brace-matching the payload instead of end-anchoring it; Android and iOS kept
 * the regex Web abandoned. These fixtures are the shared definition of "fixed".
 */
class ChatResponseFixtureConformanceTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /**
     * Walks up from the module directory to the repository root to find the shared fixture file.
     *
     * Gradle runs JVM unit tests with the working directory set to the module dir (`android/app`),
     * but that is a convention rather than a guarantee, and the same file is read by two other
     * toolchains. Searching upward keeps the three consumers pointing at one physical file without
     * any of them hard-coding a relative depth.
     */
    private fun fixtureFile(): File {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "shared/structured-content/marker-fixtures.json")
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        fail("shared/structured-content/marker-fixtures.json not found above ${File(".").absolutePath}")
        error("unreachable")
    }

    private fun strings(obj: JsonObject, key: String): List<String> =
        obj[key]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList()

    @Test
    fun `every shared fixture case conforms`() {
        val root = json.parseToJsonElement(fixtureFile().readText()).jsonObject
        assertEquals("fixture schema version", 1, root["version"]!!.jsonPrimitive.content.toInt())

        val cases = root["cases"]!!.jsonArray
        assertTrue("fixture file must carry cases", cases.isNotEmpty())

        // Every failure is collected so one run reports the full conformance gap rather than
        // stopping at the first case — the point of a shared suite is to see the whole drift.
        val failures = mutableListOf<String>()

        for (element in cases) {
            val c = element.jsonObject
            val id = c["id"]!!.jsonPrimitive.content
            val description = c["description"]?.jsonPrimitive?.contentOrNull ?: ""
            val input = c["input"]!!.jsonPrimitive.content

            val parsed = ChatResponseParser.parse(input)
            // `text` is the body with image runs removed; segments carry the positional form.
            // The user-visible string for conformance purposes is the parsed text.
            val visible = parsed.text

            for (forbidden in strings(c, "expectVisibleNotContains")) {
                if (visible.contains(forbidden, ignoreCase = false)) {
                    failures += "[$id] LEAKED ${'"'}$forbidden${'"'} into visible text — $description\n" +
                        "        visible was: ${visible.take(200)}"
                }
            }

            for (required in strings(c, "expectVisibleContains")) {
                if (!visible.contains(required)) {
                    failures += "[$id] LOST prose ${'"'}$required${'"'}\n" +
                        "        visible was: ${visible.take(200)}"
                }
            }

            val expectedLabels = strings(c, "expectCtaLabels")
            val actualLabels = parsed.ctaButtons.map { it.label }
            if (actualLabels != expectedLabels) {
                failures += "[$id] CTA labels: expected $expectedLabels but was $actualLabels — $description"
            }

            val expectedFollowups = strings(c, "expectFollowups")
            if (parsed.followups != expectedFollowups) {
                failures += "[$id] followups: expected $expectedFollowups but was ${parsed.followups}"
            }

            val expectPlan = c["expectPlanPresent"]?.jsonPrimitive?.boolean ?: false
            if ((parsed.plan != null) != expectPlan) {
                failures += "[$id] plan presence: expected $expectPlan but was ${parsed.plan != null}"
            }

            // The DURABLE place block. Count first, then the names IN ORDER — rank order is part
            // of the contract, not a rendering preference, so a parser that decodes the right
            // places in the wrong order is still drift.
            val expectPlaces = c["expectPlacesCount"]?.jsonPrimitive?.content?.toInt() ?: 0
            if (parsed.places.size != expectPlaces) {
                failures += "[$id] places count: expected $expectPlaces but was ${parsed.places.size} — $description"
            }
            val expectedNames = strings(c, "expectPlaceNames")
            if (expectedNames.isNotEmpty()) {
                val actualNames = parsed.places.map { it.name ?: "" }
                if (actualNames != expectedNames) {
                    failures += "[$id] place names: expected $expectedNames but was $actualNames"
                }
            }
        }

        if (failures.isNotEmpty()) {
            fail(
                "\n${failures.size} shared-fixture conformance failure(s) on Android:\n\n" +
                    failures.joinToString("\n\n") + "\n"
            )
        }
    }
}
