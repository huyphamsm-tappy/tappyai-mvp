package com.tappyai.app.age

import com.tappyai.app.chat.ChatErrorAction
import com.tappyai.core.network.GuestAgeInterceptor
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Parity 2026-09-28 (L4 / f): the 18+ gate is the D:/redesign "Xác nhận bạn đủ 18 tuổi" screen —
 * the web's /age-check: Ngày / Tháng / Năm, "Tiếp tục", "Ngày sinh của bạn được giữ riêng tư", the
 * three trust promises. Android used an inline "Năm sinh" + "Tôi đủ 18 tuổi" row under the chat
 * bubble, only for guests; a signed-in account without a date of birth got a dead error, and
 * "Gợi ý cho bạn" showed "Không tải được" instead of asking.
 */
class AgeGateParityTest {

    @Test
    fun `the date is validated and padded exactly like AgeCheckView`() {
        assertEquals("1994-06-05", ageCheckIso("5", "6", "1994"))
        assertEquals("1994-12-31", ageCheckIso("31", "12", "1994"))
        assertNull("year must be 4 digits", ageCheckIso("5", "6", "94"))
        assertNull("not a calendar date", ageCheckIso("31", "2", "1994"))
        assertNull(ageCheckIso("", "6", "1994"))
    }

    @Test
    fun `a signed-in account without a date of birth is sent to the same screen`() {
        assertTrue(ChatErrorAction.entries.map { it.name }.containsAll(listOf("DeclareAge", "VerifyAge")))
        val vm = File("src/main/java/com/tappyai/app/chat/ChatViewModel.kt").readText()
        assertTrue(vm.contains("""is ChatException.AgeGate -> if (e.code == "age_verification_required") ChatErrorAction.VerifyAge else null"""))
    }

    @Test
    fun `recommendations ask for 18+ on a 403 instead of failing`() {
        val vm = File("src/main/java/com/tappyai/app/recommendations/RecommendationsViewModel.kt").readText()
        assertTrue(vm.contains("code == 403 && !ageAnswered -> RecommendationsAgeState.Required"))
    }

    @Test
    fun `the copy is the web's`() {
        val vi = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""").findAll(File("src/main/res/values-vi/strings_age.xml").readText())
            .associate { it.groupValues[1] to it.groupValues[2] }
        assertEquals("Xác nhận bạn", vi["age_ask_title_lead"])
        assertEquals("đủ 18 tuổi", vi["age_ask_title_accent"])
        assertEquals("Ngày", vi["age_field_day"]); assertEquals("Tháng", vi["age_field_month"]); assertEquals("Năm", vi["age_field_year"])
        assertEquals("Tiếp tục", vi["age_submit"])
        assertEquals("Ngày sinh của bạn được giữ riêng tư", vi["age_privacy_title"])
        assertEquals("Ngày sinh không hợp lệ. Vui lòng kiểm tra lại.", vi["age_error_invalid"])
    }

    private class Capture : Interceptor {
        var request: Request? = null
        override fun intercept(chain: Interceptor.Chain): Response {
            request = chain.request()
            return Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body("{}".toResponseBody("application/json".toMediaType())).build()
        }
    }

    private fun send(url: String, declared: String?): Request {
        val capture = Capture()
        OkHttpClient.Builder().addInterceptor(GuestAgeInterceptor({ declared }, "https://uat.tappyai.test/")).addInterceptor(capture).build()
            .newCall(Request.Builder().url(url).build()).execute().close()
        return capture.request!!
    }

    @Test
    fun `a guest's declaration travels with every API request, like the web cookie`() {
        assertEquals("1994-06-05", send("https://uat.tappyai.test/api/recommendations", "1994-06-05").header("x-tappy-age-declared"))
        assertNull("nothing declared, nothing sent", send("https://uat.tappyai.test/api/recommendations", null).header("x-tappy-age-declared"))
        assertNull("never to another host", send("https://example.org/x", "1994-06-05").header("x-tappy-age-declared"))
    }
}
