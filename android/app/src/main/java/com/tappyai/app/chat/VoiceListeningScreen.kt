package com.tappyai.app.chat

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlin.math.abs
import kotlin.math.sin

/**
 * The full-screen voice-listening state (V3 master mockup `05_50_23 PM`).
 *
 * Shown INSTEAD of the composer while the mic owns the turn, and only ever while
 * [ChatViewModel.isListening] is true — the screen never claims to be listening when the recognizer
 * is not. Everything it drives already existed: `startVoiceInput`/`stopVoiceInput`, the partial
 * transcript flowing into `input`, and `onSend`. No second voice pipeline, no recorder, no new
 * navigation graph — it is a state of Chat, drawn over Chat.
 *
 * The palette is the mockup's own deep-navy listening environment rather than the app surface
 * colour: this is a single deliberately dark moment (like a camera viewfinder), and the mockup shows
 * it dark in a design that otherwise follows the system theme. It reads the same in both themes and
 * changes no global theme state.
 */
private val Ink = Color(0xFF060B18)
private val InkDeep = Color(0xFF03060F)
private val Violet = Color(0xFF6366F1)
private val VioletBright = Color(0xFF8B7CFF)
private val Sky = Color(0xFF3B82F6)
private val OnInk = Color(0xFFF8FAFC)
private val OnInkMuted = Color(0xFF94A3B8)
private val Hairline = Color(0x1FFFFFFF)

@Composable
fun VoiceListeningScreen(
    transcript: String,
    voiceLevel: Float,
    onCancel: () -> Unit,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // One transition for the whole screen: the rings, the glow and the waveform all read from it,
    // so the scene breathes together and costs a single animation clock rather than four.
    val pulse = rememberInfiniteTransition(label = "listening")
    val phase by pulse.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(2600, easing = LinearEasing), RepeatMode.Restart),
        label = "phase",
    )
    // The mic's real loudness, smoothed so the waveform swells rather than flickers frame to frame.
    val level by animateFloatAsState(targetValue = voiceLevel, animationSpec = tween(120), label = "level")

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Ink, InkDeep)))
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = TappySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(TappySpacing.md))

        // ── Mascot inside the listening environment ──────────────────────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1.08f)
                .heightIn(max = 296.dp),
            contentAlignment = Alignment.Center,
        ) {
            ListeningRings(phase = phase, level = level, modifier = Modifier.fillMaxSize())
            Image(
                painter = painterResource(R.drawable.tappy_wave),
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(0.70f),
            )
            // The status pill the mockup floats at the top-right of the mascot field. It restates
            // the listening state next to the thing that is listening, and it is the second
            // non-colour cue for it — the stop square being the first.
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0x332A2F8F))
                    .border(1.dp, VioletBright.copy(alpha = 0.45f), RoundedCornerShape(999.dp))
                    .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm)
                    .clearAndSetSemantics { },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MiniWave(modifier = Modifier.size(width = 17.dp, height = 15.dp))
                Spacer(Modifier.width(TappySpacing.sm))
                Text(
                    text = stringResource(R.string.voice_listening_pill),
                    fontSize = 13.sp,
                    color = OnInk,
                    fontWeight = FontWeight.Medium,
                )
            }
        }

        // ── "Tôi đang lắng nghe..." ──────────────────────────────────────────
        val lead = stringResource(R.string.voice_listening_title_lead)
        val accent = stringResource(R.string.voice_listening_title_accent)
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(color = OnInk)) { append(lead) }
                append(" ")
                withStyle(SpanStyle(color = VioletBright)) { append(accent) }
            },
            fontSize = 27.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                // One label for the whole sentence: the two spans are a colour treatment, not two
                // separate things to read out.
                .clearAndSetSemantics { contentDescription = lead + " " + accent },
        )
        Spacer(Modifier.height(TappySpacing.md))
        Text(
            text = stringResource(R.string.voice_listening_subtitle),
            fontSize = 14.5.sp,
            color = OnInkMuted,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().widthIn(max = 330.dp),
        )

        Spacer(Modifier.height(TappySpacing.lg))

        // ── The control: rings + live waveform + stop ────────────────────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1.9f)
                .heightIn(max = 196.dp),
            contentAlignment = Alignment.Center,
        ) {
            Waveform(phase = phase, level = level, modifier = Modifier.fillMaxSize())
            ListeningRings(phase = phase, level = level, modifier = Modifier.fillMaxSize(0.78f))
            Box(
                modifier = Modifier
                    .size(104.dp)
                    .clip(CircleShape)
                    .background(Brush.radialGradient(listOf(Violet, Color(0xFF2A2F8F))))
                    .border(2.dp, VioletBright.copy(alpha = 0.9f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                // A square, not a microphone: the mic invites you to start, and this turn has
                // already started. Shape carries the state, so it does not rest on colour alone.
                Box(
                    modifier = Modifier
                        .size(30.dp)
                        .clip(RoundedCornerShape(7.dp))
                        .background(OnInk),
                )
            }
        }

        Spacer(Modifier.height(TappySpacing.lg))

        // ── Hủy / Gửi ────────────────────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            VoiceAction(
                label = stringResource(R.string.voice_listening_cancel),
                onClick = onCancel,
                modifier = Modifier.weight(1f),
                primary = false,
            ) {
                Icon(Icons.Filled.Close, contentDescription = null, tint = OnInk, modifier = Modifier.size(20.dp))
            }
            VoiceAction(
                label = stringResource(R.string.voice_listening_send),
                onClick = onSend,
                modifier = Modifier.weight(1f),
                primary = true,
            ) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
            }
        }

        Spacer(Modifier.height(TappySpacing.lg))

        // ── "Thử nói:" hint ──────────────────────────────────────────────────
        // A worked example of what to say, not data: it is the same sentence every time, which is
        // exactly what the mockup specifies. Nothing here is presented as a live suggestion.
        val hintLabel = stringResource(R.string.voice_listening_hint_label)
        val hintExample = stringResource(R.string.voice_listening_hint_example)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .border(1.dp, Hairline, RoundedCornerShape(18.dp))
                .background(Color(0x14FFFFFF))
                .padding(TappySpacing.lg)
                .semantics { contentDescription = hintLabel + " " + hintExample },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MiniWave(modifier = Modifier.size(width = 34.dp, height = 30.dp))
            Column(modifier = Modifier.weight(1f).padding(horizontal = TappySpacing.md)) {
                Text(text = hintLabel, fontSize = 13.sp, color = OnInkMuted)
                Spacer(Modifier.height(3.dp))
                Text(text = hintExample, fontSize = 14.5.sp, color = OnInk, lineHeight = 21.sp)
            }
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = OnInkMuted,
                modifier = Modifier.size(22.dp),
            )
        }

        // The live transcript, so the screen shows what it actually heard rather than only claiming
        // to listen. Absent until the recognizer returns something.
        if (transcript.isNotBlank()) {
            Spacer(Modifier.height(TappySpacing.lg))
            Text(
                text = transcript,
                fontSize = 15.sp,
                color = OnInk,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Spacer(Modifier.height(TappySpacing.xxxl))
    }
}

/** Concentric rings that widen with the voice — the mockup's radar-like listening environment. */
@Composable
private fun ListeningRings(phase: Float, level: Float, modifier: Modifier = Modifier) {
    androidx.compose.foundation.Canvas(modifier = modifier) {
        val c = Offset(size.width / 2f, size.height / 2f)
        val base = minOf(size.width, size.height) / 2f
        for (i in 0 until RING_COUNT) {
            // Each ring is offset along the same phase, so they expand in sequence.
            val t = ((phase + i / RING_COUNT.toFloat()) % 1f)
            val radius = base * (0.40f + t * (0.56f + 0.10f * level))
            val alpha = (1f - t) * (0.30f + 0.28f * level)
            drawCircle(
                color = if (i % 2 == 0) Violet else Sky,
                radius = radius,
                center = c,
                alpha = alpha.coerceIn(0f, 1f),
                style = Stroke(width = 1.6f),
            )
        }
    }
}

/** The horizontal waveform flanking the control, driven by real microphone loudness. */
@Composable
private fun Waveform(phase: Float, level: Float, modifier: Modifier = Modifier) {
    androidx.compose.foundation.Canvas(modifier = modifier) {
        val mid = size.height / 2f
        val gapHalf = size.width * 0.17f
        val barW = 3.2f
        val step = size.width / (BAR_COUNT * 2f)
        for (i in 0 until BAR_COUNT) {
            // A travelling wave, scaled by loudness — silence collapses it to a quiet line rather
            // than animating a voice that is not there.
            val wave = abs(sin((i * 0.55f) + phase * 6.283f))
            val h = size.height * (0.06f + 0.40f * wave * (0.25f + 0.75f * level))
            val dx = gapHalf + i * step * 0.9f
            for (sign in intArrayOf(-1, 1)) {
                val x = size.width / 2f + sign * dx
                if (x < 0f || x > size.width) continue
                drawLine(
                    color = if (i % 3 == 0) VioletBright else Violet,
                    start = Offset(x, mid - h / 2f),
                    end = Offset(x, mid + h / 2f),
                    strokeWidth = barW,
                    alpha = (0.85f - i / (BAR_COUNT * 1.6f)).coerceIn(0.12f, 0.9f),
                )
            }
        }
    }
}

/** The small static voice glyph inside the hint card. */
@Composable
private fun MiniWave(modifier: Modifier = Modifier) {
    androidx.compose.foundation.Canvas(modifier = modifier) {
        val bars = floatArrayOf(0.35f, 0.7f, 1f, 0.55f, 0.8f, 0.3f)
        val step = size.width / bars.size
        bars.forEachIndexed { i, f ->
            val h = size.height * f
            val x = step * i + step / 2f
            drawLine(
                color = VioletBright,
                start = Offset(x, size.height / 2f - h / 2f),
                end = Offset(x, size.height / 2f + h / 2f),
                strokeWidth = 3.4f,
            )
        }
    }
}

@Composable
private fun VoiceAction(
    label: String,
    onClick: () -> Unit,
    primary: Boolean,
    modifier: Modifier = Modifier,
    icon: @Composable () -> Unit,
) {
    Row(
        modifier = modifier
            .heightIn(min = 56.dp)
            .clip(RoundedCornerShape(28.dp))
            .then(
                if (primary) Modifier.background(Brush.horizontalGradient(listOf(Violet, VioletBright)))
                else Modifier.background(Color(0x14FFFFFF)).border(1.dp, Hairline, RoundedCornerShape(28.dp)),
            )
            .clickable(onClick = onClick)
            .semantics { contentDescription = label }
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        icon()
        Spacer(Modifier.width(TappySpacing.sm))
        Text(
            text = label,
            color = if (primary) Color.White else OnInk,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private const val RING_COUNT = 5
private const val BAR_COUNT = 14
