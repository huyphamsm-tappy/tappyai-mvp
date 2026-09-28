package com.tappyai.core.network

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Named

/**
 * Sends `x-vercel-protection-bypass` to our own API host — the `uat` build only.
 *
 * The UAT web deployment (uat.tappyai.com) sits behind Vercel Deployment Protection, so an
 * unauthenticated request gets Vercel's login page instead of our API. The secret is read from
 * `local.properties` at build time for the `uat` build type and is the EMPTY string in every
 * other variant, so this interceptor is inert in debug, staging and release.
 *
 * Host-scoped for the same reason [AuthInterceptor] is: the OkHttp client is a process-wide
 * singleton, and the secret must never reach a third-party host that happens to share it.
 */
class DeploymentProtectionInterceptor @Inject constructor(
    @Named("vercelBypassSecret") private val secret: String,
    @Named("baseUrl") baseUrl: String,
) : Interceptor {

    private val apiHost = baseUrl.toHttpUrlOrNull()?.host

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        if (secret.isEmpty() || apiHost == null || original.url.host != apiHost) {
            return chain.proceed(original)
        }
        return chain.proceed(original.newBuilder().header(HEADER, secret).build())
    }

    companion object {
        const val HEADER = "x-vercel-protection-bypass"
    }
}
