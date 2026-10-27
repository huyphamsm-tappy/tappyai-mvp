package com.tappyai.app.tools

import com.tappyai.app.translate.data.RealTranslateRepository
import com.tappyai.app.translate.data.TranslateApi
import com.tappyai.app.translate.data.TranslateRequestDto
import com.tappyai.app.translate.data.TranslateResponseDto
import com.tappyai.app.vietwriter.data.RealVietWriterRepository
import com.tappyai.app.vietwriter.data.VietWriterApi
import com.tappyai.app.vietwriter.data.VietWriterRequestDto
import com.tappyai.app.vietwriter.data.VietWriterResponseDto
import com.tappyai.core.network.NetworkError
import com.tappyai.core.network.NetworkResult
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Dịch and Viết nội dung are hidden (`ProductFlags.SHOW_TRANSLATE` / `SHOW_VIET_CONTENT` = false, owner
 * decision 2026-10-25). While hidden no request may leave the phone — the same guarantee iOS gives in
 * `UtilityToolsService` and the web gives in the two routes — and un-hiding must bring the call back.
 */
class HiddenToolRepositoriesTest {

    private class CountingTranslateApi : TranslateApi {
        var calls = 0
        override suspend fun translate(body: TranslateRequestDto): TranslateResponseDto {
            calls++
            return TranslateResponseDto(translation = "hello")
        }
    }

    private class CountingVietApi : VietWriterApi {
        var calls = 0
        override suspend fun generate(body: VietWriterRequestDto): VietWriterResponseDto {
            calls++
            return VietWriterResponseDto(caption = "cap", hashtags = "#a")
        }
    }

    @Test
    fun `translate sends nothing and answers 404 not_available while hidden`() = runBlocking {
        val api = CountingTranslateApi()
        val result = RealTranslateRepository(api, enabled = false).translate("xin chào", "en")
        assertEquals(0, api.calls)
        val error = (result as NetworkResult.Error).error as NetworkError.Http
        assertEquals(404, error.code)
        assertEquals("not_available", error.message)
    }

    @Test
    fun `translate calls the backend again once it is un-hidden`() = runBlocking {
        val api = CountingTranslateApi()
        val result = RealTranslateRepository(api, enabled = true).translate("xin chào", "en")
        assertEquals(1, api.calls)
        assertEquals("hello", (result as NetworkResult.Success).data)
    }

    @Test
    fun `viet content sends nothing and answers 404 not_available while hidden`() = runBlocking {
        val api = CountingVietApi()
        val result = RealVietWriterRepository(api, enabled = false).generate("cà phê", "tiktok", "funny", "short")
        assertEquals(0, api.calls)
        val error = (result as NetworkResult.Error).error as NetworkError.Http
        assertEquals(404, error.code)
        assertEquals("not_available", error.message)
    }

    @Test
    fun `viet content calls the backend again once it is un-hidden`() = runBlocking {
        val api = CountingVietApi()
        val result = RealVietWriterRepository(api, enabled = true).generate("cà phê", "tiktok", "funny", "short")
        assertEquals(1, api.calls)
        assertTrue(result is NetworkResult.Success)
    }
}
