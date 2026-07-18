package com.tappyai.app.chat.data

import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RealSuggestedPromptsRepository @Inject constructor(
    private val api: SuggestedPromptsApi,
) : SuggestedPromptsRepository {

    override suspend fun getPrompts(english: Boolean): NetworkResult<List<String>> = safeApiCall {
        api.getSuggestedPrompts().prompts
            .map { if (english) it.textEn.ifBlank { it.text } else it.text }
            .filter { it.isNotBlank() }
    }
}
