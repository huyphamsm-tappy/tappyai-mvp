package com.tappyai.app.profile

import android.content.Context
import android.content.res.Configuration
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.language.AppLanguage
import com.tappyai.app.language.LanguageManager
import com.tappyai.app.profile.data.SettingsErrorMessages
import com.tappyai.app.theme.APP_THEME_DARK_VALUE
import com.tappyai.app.theme.APP_THEME_KEY
import com.tappyai.app.theme.APP_THEME_LIGHT_VALUE
import com.tappyai.core.datastore.PreferencesDataSource
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the Settings screen's Sign Out row — the one previously-missing piece of the web's
 * `SignOutButton` (`supabase.auth.signOut()` → navigate to `/login`). [AuthRepository.signOut]
 * already exists (Phase 1B) and already tears down the Supabase session + clears
 * [com.tappyai.core.security.TokenProvider]; once it completes, [AuthSessionState] flips to
 * `Unauthenticated` and `AppNavHost`'s own reactive `LaunchedEffect` (already built, unrelated to
 * this screen) navigates to Login with the whole back stack cleared — so this ViewModel needs no
 * navigation callback of its own, exactly mirroring how the web's redirect is a side effect of the
 * auth state change, not something `SignOutButton` drives directly.
 */
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val languageManager: LanguageManager,
    private val prefs: PreferencesDataSource,
    private val logger: LoggerProvider,
    private val settingsErrorMessages: SettingsErrorMessages,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    var isSigningOut by mutableStateOf(false)
        private set

    var errorMessage by mutableStateOf<String?>(null)
        private set

    /** [LanguageManager.resolved] — the user's explicit pick, or whichever locale is actually
     *  resolved and rendering on screen when they haven't picked one yet. */
    var language by mutableStateOf(languageManager.resolved)
        private set

    /** Mirrors [com.tappyai.app.MainActivity]'s own resolution: an explicit `"dark"`/`"light"`
     *  choice from [com.tappyai.app.theme.APP_THEME_KEY], else the system dark-mode setting —
     *  never a hardcoded default. Both read/write the same DataStore-backed value, so toggling
     *  here is reflected in the running Activity's theme without any navigation callback. */
    var isDarkTheme by mutableStateOf(systemInDarkTheme())
        private set

    init {
        viewModelScope.launch {
            prefs.getString(APP_THEME_KEY).collect { saved ->
                isDarkTheme = when (saved) {
                    APP_THEME_DARK_VALUE -> true
                    APP_THEME_LIGHT_VALUE -> false
                    else -> systemInDarkTheme()
                }
            }
        }
    }

    fun toggleDarkTheme() {
        val next = if (isDarkTheme) APP_THEME_LIGHT_VALUE else APP_THEME_DARK_VALUE
        viewModelScope.launch { prefs.setString(APP_THEME_KEY, next) }
    }

    private fun systemInDarkTheme(): Boolean =
        (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    fun selectLanguage(next: AppLanguage) {
        if (language == next) return
        language = next
        viewModelScope.launch { languageManager.setLanguage(next) }
    }

    fun signOut() {
        if (isSigningOut) return
        isSigningOut = true
        errorMessage = null
        viewModelScope.launch {
            when (val result = authRepository.signOut()) {
                // AppNavHost reacts to the session change and tears this screen down — reset the
                // flag anyway rather than relying on that timing, so the row never reads "Signing
                // out..." indefinitely if the screen happens to still be composed for a moment.
                is NetworkResult.Success -> isSigningOut = false
                is NetworkResult.Error -> {
                    logger.e(TAG, "signOut failed: ${result.error}")
                    errorMessage = settingsErrorMessages.toSignOutMessage(result.error)
                    isSigningOut = false
                }
            }
        }
    }

    private companion object {
        const val TAG = "SettingsViewModel"
    }
}
