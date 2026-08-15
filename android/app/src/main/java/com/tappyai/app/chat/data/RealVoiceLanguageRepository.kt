package com.tappyai.app.chat.data

import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RealVoiceLanguageRepository @Inject constructor(
    private val api: VoiceLanguageApi,
) : VoiceLanguageRepository {

    override suspend fun messageLanguage(text: String): MessageLanguage {
        val result = safeApiCall { api.detectLanguage(VoiceLanguageRequestDto(text = text)) }
        return when (result) {
            is NetworkResult.Success -> {
                val dto = result.data
                val tag = VoiceLocale.tagFor(dto.language)
                // Both fields must agree before we speak. `speakable` false, a null language, or a
                // code this build has no tag for all mean the same thing: stay quiet. Falling back
                // to Vietnamese here is exactly the bug this path replaces.
                if (dto.speakable && tag != null) {
                    MessageLanguage.Speakable(language = dto.language!!, localeTag = tag)
                } else {
                    MessageLanguage.NotSpeakable
                }
            }
            // A network error says nothing about what language the text is in, so it must not be
            // turned into a guess.
            is NetworkResult.Error -> MessageLanguage.Failed
        }
    }
}
