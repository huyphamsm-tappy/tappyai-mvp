package com.tappyai.app.memory.data

import com.tappyai.app.memory.Memory
import com.tappyai.core.network.NetworkResult

/**
 * Abstraction over the memory backend. The ViewModel depends on this and domain [Memory] only —
 * never on Retrofit/OkHttp or the DTOs.
 */
interface MemoryRepository {

    /** The user's remembered facts, or null when there are none (GET never 401s — null on any issue). */
    suspend fun getMemory(): NetworkResult<Memory?>

    /** Persists the corrected memory via PATCH (sent as the full state). Returns Unit on success. */
    suspend fun saveMemory(memory: Memory): NetworkResult<Unit>

    /** Clears all remembered facts via DELETE. Returns Unit on success. */
    suspend fun clearMemory(): NetworkResult<Unit>
}
