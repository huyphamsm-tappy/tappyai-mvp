package com.tappyai.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import com.tappyai.app.navigation.AppNavHost
import com.tappyai.app.navigation.AppNavHostViewModel
import com.tappyai.core.datastore.PreferencesDataSource
import com.tappyai.core.designsystem.theme.TappyAITheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The user's explicit light/dark choice. Absent until they pick a side, which is what keeps
 * "follow the system" the default. Stored through the shared [PreferencesDataSource] — whose own
 * contract names "theme choice" as an intended use — so no second storage mechanism exists.
 */
private const val PREF_DARK_THEME = "dark_theme"

/**
 * Phase 1B: hosts the real [AppNavHost] instead of directly rendering the Design System
 * Showcase (Phase 0/0.5's scaffold, now just one destination reached through it).
 * `@AndroidEntryPoint` makes `hiltViewModel()` available to Composables hosted here.
 *
 * Extends [AppCompatActivity] (not the plain `ComponentActivity` Compose apps default to)
 * specifically because [androidx.appcompat.app.AppCompatDelegate.setApplicationLocales] — the
 * per-app language switch [com.tappyai.app.language.LanguageManager] calls — is a silent no-op
 * without at least one live `AppCompatDelegate`, which only a real `AppCompatActivity` creates.
 * Confirmed live: with a plain `ComponentActivity`, selecting a language in Settings updated
 * local UI state but never changed `AppCompatDelegate.getApplicationLocales()` or survived an
 * app relaunch, while the OS's own `LocaleManager` (`cmd locale set-app-locales`) worked fine —
 * proving the string resources themselves were correct and the gap was purely this Activity's
 * missing AppCompat delegate.
 */
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    /**
     * Retrieved the same way `AppNavHost`'s internal `hiltViewModel()` call resolves it —
     * both default to the Activity's own `ViewModelStoreOwner`, so this is the same instance,
     * not a second one. Needed here specifically so [handleIntent] (an Activity lifecycle
     * callback, not a Composable) can reach it.
     */
    private val navHostViewModel: AppNavHostViewModel by viewModels()

    /** The app's existing key-value settings store; see [PREF_DARK_THEME]. */
    @Inject lateinit var languageManager: com.tappyai.app.language.LanguageManager

    @Inject
    lateinit var preferences: PreferencesDataSource

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // TappyAI is Vietnamese-first, but with no explicit choice AppCompat falls back to the
        // DEVICE locale — so an `en-US` handset got an English UI even though 1118 of 1119 strings
        // are translated. Applied from the Activity, not Application.onCreate: on API 33+ AppCompat
        // delegates to the framework LocaleManager and a call made before any Activity exists does
        // not persist (verified — `cmd locale get-app-locales` stayed empty).
        languageManager.applyDefaultIfUnset()
        enableEdgeToEdge()
        handleIntent(intent)

        setContent {
            // Same shape as before — a nullable override in front of the system setting — but the
            // override now lives in DataStore instead of `rememberSaveable`, so an explicit choice
            // survives a full app restart rather than only a process death. Null until the store
            // has been read, and null forever if the user never picks a side: both mean "follow
            // the system". This stays the ONE place the app resolves light/dark; everything below,
            // Home V3 included, reads the resolved value rather than asking the system again.
            val storedDark by preferences.getBoolean(PREF_DARK_THEME)
                .collectAsStateWithLifecycle(initialValue = null)
            val isDark = storedDark ?: isSystemInDarkTheme()

            TappyAITheme(darkTheme = isDark) {
                AppNavHost(
                    isDarkTheme = isDark,
                    onToggleDarkTheme = {
                        lifecycleScope.launch { preferences.setBoolean(PREF_DARK_THEME, !isDark) }
                    },
                    viewModel = navHostViewModel,
                )
            }
        }
    }

    /** The OAuth redirect (`tappyai://auth-callback`) arrives here when the app is already
     *  running in the background — `onCreate`'s intent covers the (less common) cold-start
     *  case, e.g. if the OS killed the app while the browser/Custom-Tab was open. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent == null) return
        // G1-F: an inbound system share (another app → Share → Tappy) has no data URI; it
        // carries its payload in extras. Handled before the deep-link path so the two never
        // compete — a share intent is never also a link intent.
        if (intent.action == Intent.ACTION_SEND) {
            navHostViewModel.handleIncomingShare(intent)
            return
        }
        val uri = intent.data ?: return
        if (uri.scheme == "tappyai") {
            navHostViewModel.handleDeepLink(intent)
        }
    }
}
