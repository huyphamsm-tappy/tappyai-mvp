package com.tappyai.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import com.tappyai.app.navigation.AppNavHost
import com.tappyai.app.navigation.AppNavHostViewModel
import com.tappyai.app.theme.APP_THEME_DARK_VALUE
import com.tappyai.app.theme.APP_THEME_KEY
import com.tappyai.app.theme.APP_THEME_LIGHT_VALUE
import com.tappyai.core.datastore.PreferencesDataSource
import com.tappyai.core.designsystem.theme.TappyAITheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

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

    /** Backs the dark/light toggle — see [com.tappyai.app.theme.APP_THEME_KEY]'s doc for why a
     *  field injection here (rather than a ViewModel) is what lets [SettingsScreen]'s toggle and
     *  this Activity's own theme state read/write the same persisted value without prop-drilling
     *  a callback through every intermediate nav graph. */
    @Inject
    lateinit var prefs: PreferencesDataSource

    override fun onCreate(savedInstanceState: Bundle?) {
        // Must be called before setContent — this is what actually keeps Theme.TappyAI.Splash's
        // window on screen until Compose draws its first real frame, instead of the plain white
        // windowBackground otherwise showing on its own for a beat on slower devices.
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIntent(intent)

        setContent {
            val savedTheme by prefs.getString(APP_THEME_KEY).collectAsState(initial = null)
            val isDark = when (savedTheme) {
                APP_THEME_DARK_VALUE -> true
                APP_THEME_LIGHT_VALUE -> false
                else -> isSystemInDarkTheme()
            }
            val scope = rememberCoroutineScope()

            TappyAITheme(darkTheme = isDark) {
                AppNavHost(
                    isDarkTheme = isDark,
                    onToggleDarkTheme = {
                        scope.launch {
                            prefs.setString(APP_THEME_KEY, if (isDark) APP_THEME_LIGHT_VALUE else APP_THEME_DARK_VALUE)
                        }
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
        val uri = intent?.data ?: return
        if (uri.scheme == "tappyai") {
            navHostViewModel.handleDeepLink(intent)
        }
    }
}
