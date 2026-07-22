package com.tappyai.features.auth.di

import com.tappyai.core.common.UuidProvider
import com.tappyai.core.deeplink.DeepLinkParser
import com.tappyai.core.network.SessionRefresher
import com.tappyai.features.auth.data.AuthRepository
import com.tappyai.features.auth.data.RandomUuidProvider
import com.tappyai.features.auth.deeplink.AuthDeepLinkParser
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class AuthModule {
    @Binds
    @Singleton
    abstract fun bindUuidProvider(impl: RandomUuidProvider): UuidProvider

    /**
     * Single binding for now — `core:deeplink`'s `DeepLinkParser` has exactly one real
     * implementation today. When Phase 2+ adds a second deep-link category (notifications,
     * affiliate links), this single `@Binds` won't scale (Hilt allows only one binding per
     * type) — generalize into a composite parser that tries each registered parser in turn
     * at that point, not before; no second consumer exists yet to design against.
     */
    @Binds
    @Singleton
    abstract fun bindDeepLinkParser(impl: AuthDeepLinkParser): DeepLinkParser

    /** Lets `core:network`'s [com.tappyai.core.network.TokenAuthenticator] trigger a refresh
     *  without `core:network` depending on `features:auth` — see [SessionRefresher]'s doc. */
    @Binds
    @Singleton
    abstract fun bindSessionRefresher(impl: AuthRepository): SessionRefresher
}
