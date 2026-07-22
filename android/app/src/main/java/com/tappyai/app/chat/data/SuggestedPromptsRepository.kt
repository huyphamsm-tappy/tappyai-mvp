package com.tappyai.app.chat.data

import com.tappyai.core.network.NetworkResult

interface SuggestedPromptsRepository {
    /** Dynamic starter prompts for the general-category chat welcome (GET /api/suggested-prompts).
     *  [english] selects textEn over the Vietnamese text. Returns the display strings with blanks
     *  filtered out; a failure surfaces as a typed error so the caller keeps the static fallback. */
    suspend fun getPrompts(english: Boolean): NetworkResult<List<String>>
}
