package com.tappyai.app.chat.data

import com.tappyai.core.common.StringProvider
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * The guest 18+ gate on Android (owner decision D1 revised, 2026-09-17) — the three contracts the
 * server relies on: the refusal codes are TYPED (so the chat renders a step, not an error line),
 * the device verdict mirrors the server's `evaluateGuestAge`, and the declaration travels as the
 * `x-tappy-age-declared` header exactly as stored.
 */
class GuestAgeGateTest {

    private val strings = object : StringProvider {
        override fun get(resId: Int): String = "s$resId"
        override fun get(resId: Int, vararg args: Any): String = "s$resId:" + args.joinToString(",")
    }

    @Test
    fun `403 age_declaration_required is the declaration step, with the server's sentence`() {
        val e = chatErrorFor(403, ChatErrorDto(error = "age_declaration_required", message = "Vui lòng xác nhận bạn đủ 18 tuổi để dùng thử Tappy."), strings)
        assertTrue(e is ChatException.AgeDeclarationRequired)
        assertEquals("Vui lòng xác nhận bạn đủ 18 tuổi để dùng thử Tappy.", e.message)
    }

    @Test
    fun `403 age_ineligible and age_verification_required are the gate, carrying their code`() {
        val a = chatErrorFor(403, ChatErrorDto(error = "age_ineligible", message = "Tappy dành cho người từ 18 tuổi."), strings)
        val b = chatErrorFor(403, ChatErrorDto(error = "age_verification_required", message = "Hãy xác nhận ngày sinh."), strings)
        assertTrue(a is ChatException.AgeGate && (a as ChatException.AgeGate).code == "age_ineligible")
        assertTrue(b is ChatException.AgeGate && (b as ChatException.AgeGate).code == "age_verification_required")
    }

    @Test
    fun `any other 403 stays a plain server error`() {
        val e = chatErrorFor(403, ChatErrorDto(error = "forbidden", message = null), strings)
        assertTrue(e is ChatException.ServerError)
    }

    @Test
    fun `the device verdict mirrors the server - 18plus, a bare year, a full date, garbage`() {
        val today = LocalDate.of(2026, 9, 18)
        assertEquals(GuestAgeStore.Status.Eligible, GuestAgeStore.statusOf("18plus", today))
        assertEquals(GuestAgeStore.Status.Eligible, GuestAgeStore.statusOf("2008", today))     // 2026-2008 = 18
        assertEquals(GuestAgeStore.Status.Ineligible, GuestAgeStore.statusOf("2009", today))   // 17
        assertEquals(GuestAgeStore.Status.Eligible, GuestAgeStore.statusOf("1990-01-01", today))
        assertEquals(GuestAgeStore.Status.Ineligible, GuestAgeStore.statusOf("2015-06-01", today))
        assertEquals(GuestAgeStore.Status.Ineligible, GuestAgeStore.statusOf("2008-09-19", today)) // 18 tomorrow
        assertEquals(GuestAgeStore.Status.Eligible, GuestAgeStore.statusOf("2008-09-18", today))   // 18 today
        assertEquals(GuestAgeStore.Status.Unknown, GuestAgeStore.statusOf(null, today))
        assertEquals(GuestAgeStore.Status.Unknown, GuestAgeStore.statusOf("", today))
        assertEquals(GuestAgeStore.Status.Unknown, GuestAgeStore.statusOf("yes", today))
        assertEquals(GuestAgeStore.Status.Unknown, GuestAgeStore.statusOf("1850", today))       // > 120
    }

    @Test
    fun `the birth-year picker stores a bounded year, never a promotion to 18plus`() {
        val today = LocalDate.of(2026, 9, 18)
        assertEquals("1990", GuestAgeStore.valueForBirthYear(1990, today))
        assertEquals("2010", GuestAgeStore.valueForBirthYear(2010, today)) // stored even though under 18 — the refusal must stick
        assertNull(GuestAgeStore.valueForBirthYear(1899, today))
        assertNull(GuestAgeStore.valueForBirthYear(2027, today))
    }

    @Test
    fun `a guest's declaration rides as x-tappy-age-declared verbatim - none means no header`() {
        val body = """{"messages":[]}""".toRequestBody("application/json".toMediaType())
        val declared = chatRequest("http://10.0.2.2:3200/", body, ageDeclared = "1990")
        assertEquals("1990", declared.header(GuestAgeStore.HEADER))
        assertEquals("android", declared.header(SURFACE_HEADER))
        val none = chatRequest("http://10.0.2.2:3200/", body, ageDeclared = null)
        assertNull(none.header(GuestAgeStore.HEADER))
        val blank = chatRequest("http://10.0.2.2:3200/", body, ageDeclared = " ")
        assertNull(blank.header(GuestAgeStore.HEADER))
    }

    @Test
    fun `the request body carries userLocation only when a position exists`() {
        val json = kotlinx.serialization.json.Json { encodeDefaults = false; explicitNulls = false }
        val without = json.encodeToString(ChatRequest.serializer(), ChatRequest(emptyList()))
        assertEquals("""{"messages":[]}""", without)
        val with = json.encodeToString(ChatRequest.serializer(), ChatRequest(emptyList(), userLocation = UserLocationDto(10.7769, 106.7009)))
        assertEquals("""{"messages":[],"userLocation":{"lat":10.7769,"lng":106.7009}}""", with)
    }
}
