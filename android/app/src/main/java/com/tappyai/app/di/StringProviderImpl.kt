package com.tappyai.app.di

import android.content.Context
import com.tappyai.core.common.StringProvider
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Default [StringProvider] over `Context.getString`. Bound here (not in `core:common`, which is a
 * pure Kotlin/JVM module with no Android framework dependency) and visible to every module on
 * `:app`'s classpath — including `features:auth`, which can't see `:app` directly but is still
 * covered once the whole app assembles, the same way `core:network`'s qualifiers are supplied by
 * `:app`'s [AppModule] despite `core:network` never depending on `:app`.
 *
 * `@ApplicationContext` (not an Activity context) — this is a `@Singleton`, so it must never hold
 * anything Activity-scoped. `Context.getString` already resolves against the locale
 * [com.tappyai.app.language.LanguageManager] sets via `AppCompatDelegate.setApplicationLocales`,
 * since that API patches the app's `Configuration` directly — no locale needs to be threaded
 * through here.
 */
class StringProviderImpl @Inject constructor(
    @ApplicationContext private val context: Context,
) : StringProvider {
    override fun get(resId: Int): String = context.getString(resId)
    override fun get(resId: Int, vararg args: Any): String = context.getString(resId, *args)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class StringProviderModule {
    @Binds
    @Singleton
    abstract fun bindStringProvider(impl: StringProviderImpl): StringProvider
}
