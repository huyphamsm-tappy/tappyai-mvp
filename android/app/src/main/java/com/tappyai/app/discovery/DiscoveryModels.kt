package com.tappyai.app.discovery

import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Attractions
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.Hotel
import androidx.compose.material.icons.filled.LocalCafe
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Luggage
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/**
 * A leaf Discovery capability (MFS 3.x). [id] is the **stable backend identifier** — a future
 * API returns results keyed by this `categoryId`, so the UI never needs renaming when data is
 * connected. [titleRes]/[icon] are presentation only.
 */
enum class DiscoveryCategory(
    val id: String,
    @StringRes val titleRes: Int,
    val icon: ImageVector,
) {
    RESTAURANT("restaurant", R.string.discovery_category_restaurant, Icons.Filled.Restaurant),
    CAFE("cafe", R.string.discovery_category_cafe, Icons.Filled.LocalCafe),
    HOTEL("hotel", R.string.discovery_category_hotel, Icons.Filled.Hotel),
    ATTRACTION("attraction", R.string.discovery_category_attraction, Icons.Filled.Attractions),
    TRAVEL("travel", R.string.discovery_category_travel, Icons.Filled.Flight),
    SHOPPING("shopping", R.string.discovery_category_shopping, Icons.Filled.ShoppingBag),
    DEALS("deals", R.string.discovery_category_deals, Icons.Filled.LocalOffer),
    WEATHER("weather", R.string.discovery_category_weather, Icons.Filled.WbSunny),
    FINANCE("finance", R.string.discovery_category_finance, Icons.Filled.Payments),
}

@Composable
fun DiscoveryCategory.title(): String = stringResource(titleRes)

/**
 * A top-level Discovery domain shown as one tile on the hub, grouping related [categories] by
 * TappyAI product domain. Grouping keeps the hub compact and lets more sub-categories be added
 * under a domain later without a hub redesign. [id] is stable for navigation/back-end use.
 */
enum class DiscoveryGroup(
    val id: String,
    @StringRes val titleRes: Int,
    val icon: ImageVector,
    val categories: List<DiscoveryCategory>,
) {
    FOOD_CAFES(
        "food_cafes", R.string.discovery_group_food_cafes, Icons.Filled.Restaurant,
        listOf(DiscoveryCategory.RESTAURANT, DiscoveryCategory.CAFE),
    ),
    HOTELS_TRAVEL(
        "hotels_travel", R.string.discovery_group_hotels_travel, Icons.Filled.Luggage,
        listOf(DiscoveryCategory.HOTEL, DiscoveryCategory.ATTRACTION, DiscoveryCategory.TRAVEL),
    ),
    SHOPPING_DEALS(
        "shopping_deals", R.string.discovery_group_shopping_deals, Icons.Filled.ShoppingBag,
        listOf(DiscoveryCategory.SHOPPING, DiscoveryCategory.DEALS),
    ),
    WEATHER(
        "weather", R.string.discovery_group_weather, Icons.Filled.WbSunny,
        listOf(DiscoveryCategory.WEATHER),
    ),
    FINANCE(
        "finance", R.string.discovery_group_finance, Icons.Filled.Payments,
        listOf(DiscoveryCategory.FINANCE),
    );

    companion object {
        fun fromId(id: String): DiscoveryGroup = entries.first { it.id == id }
    }
}

@Composable
fun DiscoveryGroup.title(): String = stringResource(titleRes)
