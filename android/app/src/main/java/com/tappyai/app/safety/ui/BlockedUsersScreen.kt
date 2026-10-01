package com.tappyai.app.safety.ui

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.statusBarsPadding
import com.tappyai.app.home.HomeV3
import com.tappyai.app.home.V3HomeTheme
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.safety.SafetyViewModel
import kotlinx.coroutines.launch

/**
 * Settings → Tài khoản đã chặn: who the person blocked, with "Bỏ chặn". Reached only from a row
 * that Settings draws when the server supports blocking, so it never lists a feature that is not there.
 */
@Composable
fun BlockedUsersScreen(
    onBack: () -> Unit,
    viewModel: SafetyViewModel = hiltViewModel(),
) {
    val blocked by viewModel.blockedIds.collectAsState()
    val names by viewModel.names.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(blocked) { viewModel.loadNames(blocked) }

    BlockedUsersContent(
        blocked = blocked.toList(),
        names = names,
        onBack = onBack,
        onUnblock = { id ->
            scope.launch {
                val ok = viewModel.unblock(id)
                Toast.makeText(
                    context,
                    context.getString(if (ok) R.string.safety_unblock_done else R.string.safety_unblock_failed),
                    Toast.LENGTH_SHORT,
                ).show()
            }
        },
    )
}

/** The list itself, with no ViewModel: what [BlockedUsersScreen] draws, and what the UAT preview draws from fixtures. */
@Composable
fun BlockedUsersContent(
    blocked: List<String>,
    names: Map<String, String>,
    onBack: () -> Unit,
    onUnblock: (String) -> Unit,
) {
    V3HomeTheme {
    Surface(color = HomeV3.Background, contentColor = HomeV3.OnSurface, modifier = Modifier.fillMaxSize().statusBarsPadding()) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp)) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) }
            Text(stringResource(R.string.safety_blocked_title), style = MaterialTheme.typography.titleLarge)
        }
        if (blocked.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.TopCenter) {
                Text(stringResource(R.string.safety_blocked_empty), style = MaterialTheme.typography.bodyLarge)
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items(blocked, key = { it }) { id ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    ) {
                        Text(
                            text = names[id] ?: stringResource(R.string.safety_user_default),
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(onClick = { onUnblock(id) }) { Text(stringResource(R.string.safety_blocked_unblock)) }
                    }
                }
            }
        }
    }
    }
    }
}
