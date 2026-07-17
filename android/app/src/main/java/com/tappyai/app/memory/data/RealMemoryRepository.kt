package com.tappyai.app.memory.data

import com.tappyai.app.memory.Memory
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [MemoryRepository]. Every call goes through core:network's [safeApiCall], which
 * maps HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working. DTO→domain mapping happens here.
 */
@Singleton
class RealMemoryRepository @Inject constructor(
    private val api: MemoryApi,
) : MemoryRepository {

    override suspend fun getMemory(): NetworkResult<Memory?> =
        safeApiCall { api.getMemory().memory?.toDomain() }

    override suspend fun saveMemory(memory: Memory): NetworkResult<Unit> =
        safeApiCall {
            api.patchMemory(memory.toPatchDto())
            Unit
        }

    override suspend fun clearMemory(): NetworkResult<Unit> =
        safeApiCall {
            api.deleteMemory()
            Unit
        }
}
