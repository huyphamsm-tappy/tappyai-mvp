package com.tappyai.app.groupdining.data

import com.tappyai.app.groupdining.Group
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [GroupRepository]. Every call goes through core:network's [safeApiCall], which maps
 * HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working. DTO→domain mapping happens here.
 */
@Singleton
class RealGroupRepository @Inject constructor(
    private val api: GroupApi,
) : GroupRepository {

    override suspend fun createGroup(name: String): NetworkResult<String> =
        safeApiCall { api.createGroup(CreateGroupRequestDto(name = name)).id }

    override suspend fun getGroup(id: String): NetworkResult<Group> =
        safeApiCall { api.getGroup(id).toDomain() }

    override suspend fun joinGroup(
        id: String,
        name: String,
        budget: String,
        foodPreferences: String,
        dietaryRestrictions: String,
        area: String,
    ): NetworkResult<Unit> = safeApiCall {
        api.joinGroup(
            id = id,
            body = JoinGroupRequestDto(
                name = name,
                budget = budget,
                foodPreferences = foodPreferences,
                dietaryRestrictions = dietaryRestrictions,
                area = area,
            ),
        )
        Unit
    }

    override suspend fun suggest(id: String): NetworkResult<String> =
        safeApiCall { api.suggest(id).suggestion }
}
