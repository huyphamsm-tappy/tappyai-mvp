package com.tappyai.core.network

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Named

/**
 * Sends `Accept-Language: <app language>` on every request to our own API.
 *
 * ============================================================================
 * WHY THIS IS AN INTERCEPTOR AND NOT A PARAMETER
 * ============================================================================
 * The backend localizes several responses from the request language, resolving `?lang=` first and
 * `Accept-Language` second (`/api/deals`, `/api/reviews/feed`, `POST /api/reviews`). OkHttp sends
 * no `Accept-Language` of its own, so Android sent none, so every one of those endpoints fell
 * through to its `'vi'` default — including the author-facing safety notice on `POST /api/reviews`,
 * which meant an English user who had a post held was told so in Vietnamese.
 *
 * Deals was fixed by threading a `?lang=` parameter through its Api interface. That works, and it
 * is right for Deals — an explicit parameter documents the endpoint's contract. But doing it once
 * per endpoint means every future endpoint starts out wrong and stays wrong until someone notices,
 * which is exactly how this one arrived. One interceptor makes the default correct instead, and an
 * explicit `?lang=` still wins because the backend checks the query parameter first.
 *
 * ============================================================================
 * SCOPING
 * ============================================================================
 * Host-scoped, for the same reason [AuthInterceptor] is: the OkHttp client is a process-wide
 * singleton, and a future third-party call through it should not be told anything about this user.
 * A language preference is a weaker signal than a bearer token, but the rule is cheap to keep and
 * expensive to remember to add back.
 *
 * An existing `Accept-Language` on the request is left alone — a caller that set one deliberately
 * knows something this interceptor does not.
 */
class AppLanguageInterceptor @Inject constructor(
    private val languageProvider: AppLanguageProvider,
    @Named("baseUrl") baseUrl: String,
) : Interceptor {

    private val apiHost = baseUrl.toHttpUrlOrNull()?.host

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val isOwnApiHost = apiHost != null && original.url.host == apiHost
        if (!isOwnApiHost || original.header(HEADER) != null) return chain.proceed(original)

        return chain.proceed(
            original.newBuilder().header(HEADER, languageProvider.languageTag()).build(),
        )
    }

    private companion object {
        const val HEADER = "Accept-Language"
    }
}
