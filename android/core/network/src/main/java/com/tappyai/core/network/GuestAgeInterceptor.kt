package com.tappyai.core.network

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Named

/** The guest's stored 18+ self-declaration (`YYYY-MM-DD`, `YYYY` or `18plus`), or null. `:app` supplies it. */
fun interface GuestAgeProvider {
    fun declared(): String?
}

/**
 * Sends a guest's 18+ declaration as `x-tappy-age-declared` on every request to our own API — the
 * native twin of the web's `tappy_guest_age` cookie, which the browser attaches to EVERY request.
 * Before this only `/api/chat` carried it, so a guest who had declared still got 403 from
 * `/api/recommendations` (and every other gated route).
 *
 * The server reads the header only for anonymous sessions and ignores it for accounts. Host-scoped
 * like [AuthInterceptor]; an explicit header already on the request wins.
 */
class GuestAgeInterceptor @Inject constructor(
    private val provider: GuestAgeProvider,
    @Named("baseUrl") baseUrl: String,
) : Interceptor {

    private val apiHost = baseUrl.toHttpUrlOrNull()?.host

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        if (apiHost == null || original.url.host != apiHost || original.header(HEADER) != null) return chain.proceed(original)
        val declared = provider.declared()?.trim()?.takeIf { it.isNotEmpty() } ?: return chain.proceed(original)
        return chain.proceed(original.newBuilder().header(HEADER, declared).build())
    }

    companion object {
        const val HEADER = "x-tappy-age-declared"
    }
}
