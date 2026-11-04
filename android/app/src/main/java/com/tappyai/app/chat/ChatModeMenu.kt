package com.tappyai.app.chat

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R

// A2 (02/11): the composer's mode menu and the chip of the mode in use - a port of the web's "+" menu and `chat-mode-chip`
// (src/components/ChatInterface.tsx). The rules (toggle, Deep for one question) are ChatMode's; this file only draws them.

private val ChatMode.icon: String
    get() = when (this) {
        ChatMode.Chat -> "⚡"
        ChatMode.Web -> "🌐"
        ChatMode.Think -> "💡"
        ChatMode.Deep -> "🔎"
        ChatMode.Auto -> "✨"
    }

@get:StringRes
private val ChatMode.label: Int
    get() = when (this) {
        ChatMode.Chat -> R.string.chat_mode_chat
        ChatMode.Web -> R.string.chat_mode_web
        ChatMode.Think -> R.string.chat_mode_think
        ChatMode.Deep -> R.string.chat_mode_deep
        ChatMode.Auto -> R.string.chat_mode_menu
    }

@get:StringRes
private val ChatMode.hint: Int
    get() = when (this) {
        ChatMode.Chat -> R.string.chat_mode_chat_hint
        ChatMode.Web -> R.string.chat_mode_web_hint
        ChatMode.Think -> R.string.chat_mode_think_hint
        ChatMode.Deep -> R.string.chat_mode_deep_hint
        ChatMode.Auto -> R.string.chat_mode_menu
    }

/** The "+" button left of the input (web: `w-11 h-11 rounded-2xl`); its menu lists [ChatMode.menu], the one in use ticked. */
@Composable
internal fun ChatModeMenuButton(mode: ChatMode, modes: List<ChatMode>, enabled: Boolean, container: Color, onPick: (ChatMode) -> Unit, onAttach: (() -> Unit)? = null) {
    var open by remember { mutableStateOf(false) }
    val menuLabel = stringResource(R.string.chat_mode_menu)
    Box {
        Box(
            modifier = Modifier
                .size(44.dp)
                .alpha(if (enabled) 1f else 0.4f)
                .clip(RoundedCornerShape(16.dp))
                .background(if (open) MaterialTheme.colorScheme.primary.copy(alpha = 0.15f) else container)
                .clickable(enabled = enabled) { open = !open }
                .semantics {
                    contentDescription = menuLabel
                    role = Role.Button
                },
            contentAlignment = Alignment.Center,
        ) {
            Text("+", fontSize = 22.sp, color = if (open) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.width(288.dp)) {
            // 02/11: attaching first, as in the web's menu (📎 «Thêm ảnh & tệp PDF»)
            if (onAttach != null) DropdownMenuItem(
                leadingIcon = { Text("📎", fontSize = 18.sp) },
                text = {
                    Column(modifier = Modifier.padding(vertical = 4.dp)) {
                        Text(stringResource(R.string.chat_attach), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                        Text(stringResource(R.string.chat_attach_hint), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                onClick = { open = false; onAttach() },
            )
            modes.forEach { item ->
                val on = item == mode
                DropdownMenuItem(
                    modifier = if (on) Modifier.background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)) else Modifier,
                    leadingIcon = { Text(item.icon, fontSize = 18.sp) },
                    text = {
                        Column(modifier = Modifier.padding(vertical = 4.dp)) {
                            Text(
                                text = stringResource(item.label) + if (on) " ✓" else "",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                            )
                            Text(
                                text = stringResource(item.hint),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    },
                    onClick = { open = false; onPick(item) },
                )
            }
        }
    }
}

/** The mode in use above the input, removable (web: Auto is the default and shows nothing). */
@Composable
internal fun ChatModeChip(mode: ChatMode, onClear: () -> Unit, modifier: Modifier = Modifier) {
    if (mode == ChatMode.Auto) return
    val primary = MaterialTheme.colorScheme.primary
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(primary.copy(alpha = 0.10f))
            .border(1.dp, primary.copy(alpha = 0.40f), CircleShape)
            .padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(mode.icon, fontSize = 12.sp)
        Text(stringResource(mode.label), fontSize = 12.sp, fontWeight = FontWeight.Medium, color = primary)
        val off = stringResource(R.string.chat_mode_off)
        Box(
            modifier = Modifier
                .size(22.dp)
                .clip(CircleShape)
                .clickable(onClick = onClear)
                .semantics { contentDescription = off },
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Close, contentDescription = null, tint = primary, modifier = Modifier.size(12.dp))
        }
    }
}
