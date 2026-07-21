package com.tappyai.app.appconnections.data

import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RealAppConnectionsRepository @Inject constructor(
    private val api: AppConnectionsApi,
) : AppConnectionsRepository {

    override suspend fun getConnectedProviders(): NetworkResult<Set<String>> = safeApiCall {
        api.getIntegrations().integrations
            .filter { it.connected }
            .map { it.provider }
            .toSet()
    }
}
