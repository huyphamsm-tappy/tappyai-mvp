package com.tappyai.app.scamshield

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * B09 — Scam Shield on Android must fail closed and must not carry its own scoring.
 *
 * These are behaviour tests over the domain layer plus source-contract tests over the screen. The
 * source checks exist because the properties they protect are structural: "no local scoring" and
 * "an unrecognised level is never green" cannot be observed by calling a function, only by looking
 * at what the code is allowed to contain. Robolectric is not available in this module, so a
 * Compose render test is not an option — the source contract is the strongest check available, and
 * it is a real one: each assertion below fails if the corresponding line is edited away.
 */
class ScamShieldFailClosedTest {

    private val packageDir = File("src/main/java/com/tappyai/app/scamshield")
    private fun source(name: String) = File(packageDir, name).readText()

    // ---------------------------------------------------------------- level parsing

    @Test
    fun `known levels parse from the wire`() {
        assertEquals(RiskLevel.SAFE, RiskLevel.fromWire("SAFE"))
        assertEquals(RiskLevel.CRITICAL, RiskLevel.fromWire("CRITICAL"))
        assertEquals(RiskLevel.INCONCLUSIVE, RiskLevel.fromWire("INCONCLUSIVE"))
    }

    @Test
    fun `lowercase levels still parse`() {
        assertEquals(RiskLevel.HIGH, RiskLevel.fromWire("high"))
    }

    /**
     * 🚨 The point of the whole enum. A level this build has never heard of — because the backend
     * added one after the app shipped — must not become SAFE.
     */
    @Test
    fun `an unrecognised level is UNKNOWN, never SAFE`() {
        assertEquals(RiskLevel.UNKNOWN, RiskLevel.fromWire("MODERATELY_SPICY"))
        assertNotEquals(RiskLevel.SAFE, RiskLevel.fromWire("MODERATELY_SPICY"))
    }

    @Test
    fun `a missing level is UNKNOWN, never SAFE`() {
        assertEquals(RiskLevel.UNKNOWN, RiskLevel.fromWire(null))
        assertEquals(RiskLevel.UNKNOWN, RiskLevel.fromWire(""))
    }

    @Test
    fun `the wire never resolves directly to UNKNOWN by name`() {
        // Guards the `it != UNKNOWN` filter: without it, a backend sending the literal "UNKNOWN"
        // would round-trip, which is harmless — but so would any future rename collision.
        assertEquals(RiskLevel.UNKNOWN, RiskLevel.fromWire("UNKNOWN"))
    }

    // ---------------------------------------------------------------- severity parsing

    @Test
    fun `unrecognised evidence severity degrades to UNKNOWN`() {
        assertEquals(SignalSeverity.UNKNOWN, SignalSeverity.fromWire("catastrophic"))
        assertEquals(SignalSeverity.CRITICAL, SignalSeverity.fromWire("critical"))
    }

    // ---------------------------------------------------------------- fail-closed presentation

    @Test
    fun `every unresolved level is drawn in the neutral slate colour, not green`() {
        // 2026-09-17: the tones are the V3 palette's (`LEVEL_TONE` on the web). The neutral one is
        // the surface-variant foreground; green is `V3Tone.Emerald`, SAFE's tone alone.
        val screen = source("ScamShieldResult.kt")
        val green = "V3Tone.Emerald"
        val slate = "HomeV3.OnSurfaceVariant"

        val inconclusive = screen.lineSequence().first { it.contains("RiskLevel.INCONCLUSIVE") && it.contains("->") }
        val unknown = screen.lineSequence().first { it.contains("RiskLevel.UNKNOWN") && it.contains("->") }

        assertTrue("INCONCLUSIVE must use the neutral slate colour", inconclusive.contains(slate))
        assertTrue("UNKNOWN must use the neutral slate colour", unknown.contains(slate))
        assertTrue("INCONCLUSIVE must not be green", !inconclusive.contains(green))
        assertTrue("UNKNOWN must not be green", !unknown.contains(green))
        assertTrue("INCONCLUSIVE must not use the reassuring shield glyph", !inconclusive.contains("GppGood"))
        assertTrue("UNKNOWN must not use the reassuring shield glyph", !unknown.contains("GppGood"))
    }

    @Test
    fun `the appearance map covers every level with no else branch`() {
        // An `else ->` would let a newly added level fall through to whatever the author picked
        // last, instead of failing the build until it has been given a deliberate appearance.
        val screen = source("ScamShieldResult.kt")
        val block = screen.substringAfter("internal fun toneFor").substringBefore("\n}")
        RiskLevel.entries.forEach { level ->
            assertTrue("toneFor must handle ${level.name}", block.contains("RiskLevel.${level.name}"))
        }
        assertTrue("toneFor must not have an else branch", !block.contains("else ->"))
    }

    @Test
    fun `a failed check is rendered by the unresolved card, never as a verdict`() {
        val screen = source("ScamShieldScreen.kt")
        assertTrue(
            "ScamShieldUiState.Failed must route to UnresolvedCard",
            Regex("""as\? ScamShieldUiState\.Failed\)\?\.let \{ failed -> UnresolvedCard\(failed\.failure(, forMessage = [^)]*)?\) \}""").containsMatchIn(screen),
        )
        assertTrue(
            "Only a backend verdict may render VerdictCard",
            Regex("""as\? ScamShieldUiState\.Result\)\?\.let \{ VerdictCard\(it\.result\) \}""").containsMatchIn(screen),
        )
        assertTrue(
            "Only a backend message verdict may render MessageResultCard",
            Regex("""as\? ScamShieldUiState\.MessageResult\)\?\.let \{ MessageResultCard\(it\.result\) \}""").containsMatchIn(screen),
        )
    }

    // ---------------------------------------------------------------- no local scoring

    /**
     * 🚨 The backend is the only authority on risk. If a threshold, a weight or a domain list ever
     * appears in this package, the app can disagree with the web about the same URL — and B01 was
     * a CRITICAL bug in exactly that scoring, fixed once, on the server.
     */
    @Test
    fun `the package contains no local risk scoring`() {
        val banned = listOf(
            "MIN_CONFIDENCE",
            "LEVEL_THRESHOLD",
            "PROVIDER_MAX_WEIGHT",
            "calculateRisk",
            "fun score(",
        )
        packageDir.walkTopDown().filter { it.extension == "kt" }.forEach { file ->
            val text = file.readText()
            banned.forEach { needle ->
                assertTrue(
                    "${file.name} must not implement risk scoring locally (found \"$needle\")",
                    !text.contains(needle),
                )
            }
        }
    }

    @Test
    fun `the only network call is the backend check endpoint`() {
        val api = File(packageDir, "data/ScamShieldApi.kt").readText()
        assertTrue(api.contains("api/scam-shield/check"))
        // 2026-09-17: three routes, all the backend engine's (the URL, the QR image the server
        // decodes, the message the server analyzes) — still nothing that could fetch a blocklist
        // to evaluate on-device.
        assertEquals(3, Regex("""@(GET|POST|PUT|DELETE|PATCH)""").findAll(api).count())
        assertTrue(api.contains("api/scam-shield/qr"))
        assertTrue(api.contains("api/scam-shield/analyze"))
        assertEquals(3, Regex("""@POST\("api/scam-shield/""").findAll(api).count())
    }

    // ---------------------------------------------------------------- error mapping

    @Test
    fun `every documented refusal code maps to a specific message`() {
        val screen = source("ScamShieldResult.kt")
        val block = screen.substringAfter("private fun localFallbackFor")
        listOf("rate_limit", "daily_limit", "invalid_input", "private_url", "invalid_image", "analyze_failed").forEach { code ->
            assertTrue("\"$code\" must map to its own string", block.contains("\"$code\""))
        }
    }

    @Test
    fun `the repository maps every failure to Failed, never to a verdict`() {
        val repo = File(packageDir, "data/RealScamShieldRepository.kt").readText()
        val catches = Regex("""catch \(e: (\w+)\)""").findAll(repo).map { it.groupValues[1] }.toList()

        // CancellationException must rethrow so coroutine cancellation keeps working; every other
        // catch must produce a Failed outcome.
        assertTrue("CancellationException must be caught", catches.contains("CancellationException"))
        assertTrue("must rethrow cancellation", repo.contains("throw e"))

        // One `attempt` wraps all three routes: the single `Outcome.Ok` is the only way a decoded
        // body becomes a verdict, and every catch (bar cancellation) lands in `Outcome.Err`.
        val okCount = Regex("""Outcome\.Ok\(call\(\)\)""").findAll(repo).count()
        val errCount = Regex("""Outcome\.Err\(""").findAll(repo).count()
        assertEquals("exactly one path may produce a verdict", 1, okCount)
        assertTrue("every other path must fail closed", errCount >= catches.size - 1)
        assertTrue("a 200 without a verdict is not a verdict", repo.contains("throw SerializationException(\"no verdict\")"))
    }
}
