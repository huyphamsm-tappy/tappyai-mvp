package com.tappyai.core.designsystem.theme

import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/** Radius scale from docs/UI_GUIDELINES.md §7. */
object TappyShapes {
    val chip = RoundedCornerShape(8.dp)
    val input = RoundedCornerShape(12.dp)
    val card = RoundedCornerShape(16.dp)
    val sheet = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
    val large = RoundedCornerShape(24.dp)
    val pill = CircleShape
}

val TappyMaterialShapes = Shapes(
    extraSmall = TappyShapes.chip,
    small = TappyShapes.input,
    medium = TappyShapes.card,
    large = TappyShapes.large,
    extraLarge = TappyShapes.sheet,
)
