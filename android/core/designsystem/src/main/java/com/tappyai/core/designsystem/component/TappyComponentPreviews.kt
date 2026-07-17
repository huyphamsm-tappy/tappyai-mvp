package com.tappyai.core.designsystem.component

import android.content.res.Configuration
import androidx.compose.ui.tooling.preview.Preview

/**
 * Standard preview coverage for every reusable component in this library (per the component
 * preview standard): Light, Dark, Large Font (200% system scale), and Tablet width (900dp).
 * A Compose "multipreview annotation" — apply this single annotation to a component's private
 * preview composable instead of hand-writing 4 separate `@Preview`s per file.
 */
@Preview(name = "Light", showBackground = true)
@Preview(name = "Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(name = "Large Font", showBackground = true, fontScale = 2f)
@Preview(name = "Tablet", showBackground = true, widthDp = 900, heightDp = 500)
annotation class TappyComponentPreviews
