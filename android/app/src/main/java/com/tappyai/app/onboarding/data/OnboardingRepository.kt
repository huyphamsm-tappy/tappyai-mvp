package com.tappyai.app.onboarding.data

import com.tappyai.app.onboarding.OnboardingCatalog
import com.tappyai.app.onboarding.OnboardingInterest
import com.tappyai.app.onboarding.interestLabelResFor
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import kotlinx.coroutines.CancellationException
import javax.inject.Inject
import javax.inject.Singleton

/** Abstraction over the onboarding backend. ViewModel depends on this and domain types only. */
interface OnboardingRepository {

    /** The interests + cities catalog for the wizard. */
    suspend fun getCatalog(): NetworkResult<OnboardingCatalog>

    /**
     * Whether this user still needs onboarding, for the post-login gate. Returns `false` on any
     * failure — matching the web, which never blocks the user behind the wizard when the check
     * can't complete (it proceeds straight to the app). Fail-open by design.
     */
    suspend fun needsOnboarding(): Boolean

    /** Records the picked interests + city (`POST api/onboarding`); best-effort, like the web,
     *  which swallows the error and proceeds regardless. */
    suspend fun submit(interests: List<String>, city: String)
}

@Singleton
class RealOnboardingRepository @Inject constructor(
    private val api: OnboardingApi,
    private val logger: LoggerProvider,
) : OnboardingRepository {

    override suspend fun getCatalog(): NetworkResult<OnboardingCatalog> = safeApiCall {
        val config = api.getConfig().onboarding
        OnboardingCatalog(
            interests = config.interests.mapNotNull { dto ->
                interestLabelResFor(dto.id)?.let { labelRes ->
                    OnboardingInterest(id = dto.id, emoji = dto.emoji, labelRes = labelRes)
                }
            },
            cities = config.cities,
        )
    }

    override suspend fun needsOnboarding(): Boolean = try {
        !api.getOnboardedStatus().onboarded
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        logger.w(TAG, "Onboarded-status check failed, skipping onboarding: ${e.message}")
        false
    }

    override suspend fun submit(interests: List<String>, city: String) {
        try {
            api.submitOnboarding(OnboardingRequestDto(interests = interests, city = city))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            logger.w(TAG, "Onboarding submit failed (proceeding anyway): ${e.message}")
        }
    }

    private companion object {
        const val TAG = "OnboardingRepository"
    }
}
