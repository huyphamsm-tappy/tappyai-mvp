package com.tappyai.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R

private val AskBlue = Color(0xFF2563EB)

/**
 * The consult ASK turn — port of web `src/components/chat/AskCard.tsx` (server 70667d3): 2-3
 * questions, each with its own chips. One tap per question selects (tap again to clear); "Gửi"
 * sends what was chosen, joined " · " ([AskBlock.composeAnswer]) — a partial answer is fine. A
 * free-text box covers anything the chips do not.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AskCard(questions: List<AskQuestion>, onSend: (String) -> Unit, modifier: Modifier = Modifier) {
    val chosen = remember(questions) { mutableStateMapOf<String, String>() }
    var free by remember(questions) { mutableStateOf("") }
    val answer = AskBlock.composeAnswer(questions, chosen, free)
    val line = MaterialTheme.colorScheme.outlineVariant
    val onSurface = MaterialTheme.colorScheme.onSurface
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 12.dp)
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, line, RoundedCornerShape(16.dp))
            .padding(12.dp)
            .testTag("ask-card"),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        questions.forEach { q ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(q.q, color = onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    q.options.forEach { o ->
                        val on = chosen[q.id] == o
                        Text(
                            text = o,
                            color = if (on) Color.White else onSurface,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(if (on) AskBlue else MaterialTheme.colorScheme.surfaceVariant)
                                .border(1.dp, if (on) AskBlue else line, RoundedCornerShape(50))
                                .semantics { selected = on }
                                .clickable(role = Role.Checkbox) { if (on) chosen.remove(q.id) else chosen[q.id] = o }
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                        )
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            BasicTextField(
                value = free,
                onValueChange = { free = it },
                singleLine = true,
                textStyle = TextStyle(color = onSurface, fontSize = 14.sp),
                cursorBrush = SolidColor(AskBlue),
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(12.dp))
                    .border(1.dp, line, RoundedCornerShape(12.dp))
                    .padding(horizontal = 12.dp, vertical = 8.dp)
                    .testTag("ask-free-text"),
                decorationBox = { inner ->
                    if (free.isEmpty()) Text(stringResource(R.string.chat_ask_free_hint), color = onSurface.copy(alpha = 0.5f), fontSize = 14.sp)
                    inner()
                },
            )
            val enabled = answer.isNotEmpty()
            Text(
                text = stringResource(R.string.chat_ask_send),
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(AskBlue)
                    .alpha(if (enabled) 1f else 0.4f)
                    .clickable(enabled = enabled, role = Role.Button) { onSend(answer) }
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .testTag("ask-send"),
            )
        }
    }
}
