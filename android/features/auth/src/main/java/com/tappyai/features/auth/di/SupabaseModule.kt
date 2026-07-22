package com.tappyai.features.auth.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.FlowType
import io.github.jan.supabase.createSupabaseClient
import javax.inject.Named
import javax.inject.Singleton

/**
 * Provides the shared [SupabaseClient], scoped to `features:auth` only — no other module
 * needs it yet (see the plan's M1 note on why this isn't a new core module).
 *
 * `@Named("supabaseUrl")`/`@Named("supabaseAnonKey")` are supplied by `:app`'s `AppModule`,
 * same pattern as `core:network`'s `baseUrl`/`isDebug` — real values are a placeholder until
 * you supply your actual Supabase project's URL/anon key (see `AppModule`'s own doc comment).
 *
 * **Build Verification pass (Phase 1B.1):** the `Auth` plugin's `scheme`/`host` install-block
 * shape below was confirmed against Supabase's official native-mobile-deep-linking guide
 * (fetched live during this pass) — it matches their own example
 * (`install(Auth) { host = "login-callback"; scheme = "io.supabase.user-management" }`)
 * exactly. No fix needed here.
 *
 * **Production Audit Sprint finding:** `flowType` was previously left unset, which defaults to
 * [FlowType.IMPLICIT] (confirmed via decompiling the SDK's `AuthConfigDefaults`) — the OAuth
 * deep-link callback then imports whatever `access_token`/`refresh_token` are in the
 * `tappyai://auth-callback#...` fragment with no CSRF/session-fixation protection (no `state`
 * param, and PKCE's `code_verifier`/`code_challenge` binding is dormant unless this flag is
 * PKCE). Explicitly set to close that gap: it switches the SDK to the `code` + local
 * `code_verifier` exchange, so a forged/replayed callback fails without the verifier that only
 * this app instance holds.
 */
@Module
@InstallIn(SingletonComponent::class)
object SupabaseModule {
    @Provides
    @Singleton
    fun provideSupabaseClient(
        @Named("supabaseUrl") supabaseUrl: String,
        @Named("supabaseAnonKey") supabaseAnonKey: String,
    ): SupabaseClient = createSupabaseClient(
        supabaseUrl = supabaseUrl,
        supabaseKey = supabaseAnonKey,
    ) {
        install(Auth) {
            // Must match the intent-filter registered on MainActivity (M7) and the redirect
            // URL registered in Supabase's dashboard — three places, one value, kept in sync
            // manually since there's no single source of truth to derive it from at build time.
            scheme = "tappyai"
            host = "auth-callback"
            flowType = FlowType.PKCE
        }
    }
}
