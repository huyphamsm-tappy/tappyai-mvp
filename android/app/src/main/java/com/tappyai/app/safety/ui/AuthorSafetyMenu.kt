package com.tappyai.app.safety.ui

import android.widget.Toast
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tappyai.app.R
import com.tappyai.app.safety.ReportTarget
import com.tappyai.app.safety.SafetyViewModel
import kotlinx.coroutines.launch

/**
 * The "…" on ANOTHER person's profile: "Báo cáo người dùng" and "Chặn người dùng" / "Bỏ chặn".
 * Both are Phase 8 routes, so each item appears only while the server says it has the feature
 * (`/api/config` → `p8`); with neither flag on, this draws nothing at all.
 */
@Composable
fun AuthorSafetyMenu(
    userId: String,
    userName: String?,
    modifier: Modifier = Modifier,
    viewModel: SafetyViewModel = hiltViewModel(),
) {
    val flags by viewModel.flags.collectAsStateWithLifecycle()
    val blocked by viewModel.blockedIds.collectAsStateWithLifecycle()
    if (!flags.reports && !flags.userBlocks) return

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(false) }
    var reporting by remember { mutableStateOf(false) }
    var confirmBlock by remember { mutableStateOf(false) }
    val isBlocked = userId in blocked

    if (reporting) {
        ReportDialog(
            title = stringResource(R.string.safety_report_user_title),
            onSubmit = { reason -> viewModel.report(ReportTarget.User, userId, reason) },
            onFiled = {},
            onDismiss = { reporting = false },
        )
    }
    if (confirmBlock) {
        BlockConfirmDialog(
            name = userName,
            onConfirm = {
                confirmBlock = false
                scope.launch {
                    val ok = viewModel.block(userId)
                    Toast.makeText(context, context.getString(if (ok) R.string.safety_block_done else R.string.safety_block_failed), Toast.LENGTH_SHORT).show()
                }
            },
            onDismiss = { confirmBlock = false },
        )
    }

    Box(modifier = modifier.fillMaxWidth().padding(end = 8.dp), contentAlignment = Alignment.CenterEnd) {
        IconButton(onClick = { open = true }) {
            Icon(Icons.Filled.MoreVert, contentDescription = stringResource(R.string.safety_profile_more))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            if (flags.reports) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.safety_report_user_title)) },
                    leadingIcon = { Icon(Icons.Filled.Flag, contentDescription = null) },
                    onClick = { open = false; reporting = true },
                )
            }
            if (flags.userBlocks) {
                DropdownMenuItem(
                    text = { Text(stringResource(if (isBlocked) R.string.safety_blocked_unblock else R.string.safety_block_action)) },
                    leadingIcon = { Icon(Icons.Filled.Block, contentDescription = null) },
                    onClick = {
                        open = false
                        if (isBlocked) {
                            scope.launch {
                                val ok = viewModel.unblock(userId)
                                Toast.makeText(context, context.getString(if (ok) R.string.safety_unblock_done else R.string.safety_unblock_failed), Toast.LENGTH_SHORT).show()
                            }
                        } else {
                            confirmBlock = true
                        }
                    },
                )
            }
        }
    }
}
