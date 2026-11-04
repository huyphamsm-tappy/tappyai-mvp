package com.tappyai.app.chat

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.chat.data.DocMediaItem
import com.tappyai.app.chat.data.ResearchChart
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import java.text.NumberFormat
import java.util.Locale

// A4/A5 (02/11): the pieces the article layout places under a section (ArticleLayout.kt) and the turn's status line.

/** A section's picture (web ArticleAnswer: full width under its heading, rounded). A picture that fails to load takes no room. */
@Composable
internal fun ArticlePicture(item: DocMediaItem) {
    TappyImage(
        url = item.src,
        contentDescription = item.title,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = TappySpacing.sm)
            .heightIn(max = 220.dp)
            .clip(TappyShapes.card),
        onError = {},
    )
}

/**
 * A report section's chart, drawn from the figures the server checked (web reportChart.ts draws an SVG; here the same bars / line on a
 * Canvas): the title, the unit, one bar or point per label with its value. Each figure's source number is in the report's sources list.
 */
@Composable
internal fun ResearchChartView(chart: ResearchChart) {
    val primary = MaterialTheme.colorScheme.primary
    val grid = MaterialTheme.colorScheme.outlineVariant
    val values = chart.points.map { it.value }
    val max = (values.maxOrNull() ?: 0.0).coerceAtLeast(0.0)
    val min = (values.minOrNull() ?: 0.0).coerceAtMost(0.0)
    val span = (max - min).takeIf { it > 0 } ?: 1.0
    val fmt = NumberFormat.getNumberInstance(Locale.getDefault()).apply { maximumFractionDigits = 2 }
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = TappySpacing.sm), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = chart.title + if (chart.unit.isNotBlank()) " (${chart.unit})" else "",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
        )
        Canvas(modifier = Modifier.fillMaxWidth().height(140.dp)) {
            val n = chart.points.size
            val slot = size.width / n
            val y = { v: Double -> (size.height * (1 - (v - min) / span)).toFloat() }
            drawLine(grid, Offset(0f, y(0.0)), Offset(size.width, y(0.0)), strokeWidth = 1.dp.toPx())
            if (chart.kind == "line") {
                val path = Path()
                chart.points.forEachIndexed { i, p ->
                    val x = slot * i + slot / 2
                    if (i == 0) path.moveTo(x, y(p.value)) else path.lineTo(x, y(p.value))
                    drawCircle(primary, radius = 3.dp.toPx(), center = Offset(x, y(p.value)))
                }
                drawPath(path, primary, style = Stroke(width = 2.dp.toPx()))
            } else {
                val w = slot * 0.6f
                chart.points.forEachIndexed { i, p ->
                    val top = minOf(y(p.value), y(0.0))
                    val h = kotlin.math.abs(y(p.value) - y(0.0)).coerceAtLeast(1f)
                    drawRect(primary, topLeft = Offset(slot * i + (slot - w) / 2, top), size = Size(w, h))
                }
            }
        }
        Row(modifier = Modifier.fillMaxWidth()) {
            chart.points.forEach { p ->
                Column(modifier = Modifier.weight(1f)) {
                    Text(fmt.format(p.value), fontSize = 10.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(), maxLines = 1)
                    Text(
                        p.label, fontSize = 10.sp, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}

/** The server's word that the answer is incomplete or was interrupted (web: a line under the message, never part of the answer). */
@Composable
internal fun TurnStatusLine(status: String) {
    val text = when (status) {
        "incomplete" -> stringResource(R.string.chat_turn_incomplete)
        "interrupted" -> stringResource(R.string.chat_turn_interrupted)
        else -> return
    }
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = TappySpacing.sm),
    )
}
