package com.tappyai.app.di

import android.content.Context
import android.content.res.Configuration
import android.os.LocaleList
import androidx.appcompat.app.AppCompatDelegate
import com.tappyai.core.common.StringProvider
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Default [StringProvider], resolving against the language the APP is set to.
 *
 * ============================================================================
 * WHY THIS IS NOT JUST `context.getString` — B13
 * ============================================================================
 * 🚨 THE KDOC HERE USED TO CLAIM THE OPPOSITE, AND THAT CLAIM WAS THE BUG. It said
 * `Context.getString` "already resolves against the locale LanguageManager sets via
 * `AppCompatDelegate.setApplicationLocales`, since that API patches the app's `Configuration`
 * directly — no locale needs to be threaded through here."
 *
 * That is true on API 33+, where AppCompat delegates to the platform `LocaleManager` and the
 * system really does re-configure the application context. **It is false below API 33**, which is
 * six of the levels this app ships to (`minSdk` 26). There, AppCompat implements the override by
 * patching ACTIVITY configurations as they are created; the application context keeps the SYSTEM
 * locale for the life of the process. `StringProviderImpl` is a `@Singleton` holding exactly that
 * application context, so every string it returned came back in the phone's language rather than
 * the app's.
 *
 * Measured on a Galaxy A12 (API 31), app set to English, phone set to Vietnamese — one error card
 * rendered its title and its button in English (Compose `stringResource`, an Activity context)
 * and its body in Vietnamese (this class):
 *
 *     Couldn't load deals                            ← Compose
 *     Không thể tải ưu đãi. Vui lòng thử lại sau.    ← here
 *     Try again                                      ← Compose
 *
 * Reproduced identically on Deals, Explore, Chat history and Chat. ~150 call sites across 27
 * files route through here, nearly all of them `*ErrorMessages.kt`, so every user-facing error in
 * the app was affected.
 *
 * 🔑 It was invisible whenever the phone's language matched the app's — which is every test on a
 * device configured to match, and is why it survived this long.
 *
 * ============================================================================
 * THE FIX, AND WHY IT IS ONE FIX
 * ============================================================================
 * Resolve strings through a Context configured with the ACTIVE APP LOCALE instead of threading a
 * locale parameter through 150 call sites. Every existing caller is unchanged and correct the
 * moment this class is.
 *
 * [AppCompatDelegate.getApplicationLocales] is the same authority
 * [com.tappyai.app.language.AppLanguageResolver] reads, so there is no second source of truth and
 * nothing new to keep in sync. An EMPTY list means the user has never chosen a language, and
 * AppCompat then genuinely renders in the system locale — so the plain application context is
 * already correct and is returned untouched. That is not a fallback; it is the right answer.
 */
class StringProviderImpl @Inject constructor(
    @ApplicationContext private val context: Context,
) : StringProvider {

    /**
     * Cached per language-tag set, because `createConfigurationContext` allocates a Context and
     * these are called once per error string. Keying the cache on the tags is what makes it
     * self-invalidating: switching language produces different tags, so the next call rebuilds.
     * `@Volatile` because a `@Singleton` is reachable from any thread.
     */
    @Volatile private var cachedTags: String? = null
    @Volatile private var cachedContext: Context? = null

    private fun localized(): Context {
        val locales = AppCompatDelegate.getApplicationLocales()
        if (locales.isEmpty) return context

        val tags = locales.toLanguageTags()
        cachedContext?.let { if (cachedTags == tags) return it }

        val configuration = Configuration(context.resources.configuration).apply {
            setLocales(LocaleList.forLanguageTags(tags))
        }
        val localizedContext = context.createConfigurationContext(configuration)
        cachedTags = tags
        cachedContext = localizedContext
        return localizedContext
    }

    override fun get(resId: Int): String = localized().getString(resId)
    override fun get(resId: Int, vararg args: Any): String = localized().getString(resId, *args)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class StringProviderModule {
    @Binds
    @Singleton
    abstract fun bindStringProvider(impl: StringProviderImpl): StringProvider
}
