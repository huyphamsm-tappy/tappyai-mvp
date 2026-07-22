package com.tappyai.app.groupdining.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Retrofit contract for Group Dining. Built from the shared [retrofit2.Retrofit] (core:network) so
 * the [com.tappyai.core.network.AuthInterceptor] attaches `Authorization: Bearer …` for own-host
 * calls. Create/join/suggest require it (401/403 otherwise); the GET is public on the backend
 * (anyone with the link can view a group) but the interceptor harmlessly attaches the token anyway.
 */
interface GroupApi {

    @POST("api/group")
    suspend fun createGroup(@Body body: CreateGroupRequestDto): CreateGroupResponseDto

    @GET("api/group")
    suspend fun getGroup(@Query("id") id: String): GroupDto

    @POST("api/group/{id}/join")
    suspend fun joinGroup(
        @Path("id") id: String,
        @Body body: JoinGroupRequestDto,
    ): JoinGroupResponseDto

    @POST("api/group/{id}/suggest")
    suspend fun suggest(@Path("id") id: String): SuggestResponseDto
}
