package com.tappyai.app.fortune

import kotlinx.serialization.Serializable

sealed interface FortuneRoute {
    @Serializable
    data object Hub : FortuneRoute

    @Serializable
    data object Tarot : FortuneRoute

    @Serializable
    data object TuVi : FortuneRoute

    @Serializable
    data object Zodiac : FortuneRoute
}
