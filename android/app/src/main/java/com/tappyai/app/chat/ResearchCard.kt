package com.tappyai.app.chat

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.chat.data.ResearchChart
import com.tappyai.app.chat.data.ResearchStatus
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.URI
import java.util.Locale

// A5 (02/11): the Deep Research card - the plan, each step's progress, the cited sources and (once done) the report as a file. A port of the
// web's ResearchCard.tsx: drawn from the server's tappy.research.v1 frame (re-checked in OneBrainFrames); the report is the reply under it.

private fun mark(status: String) = when (status) { "pending" -> "○"; "running" -> "◌"; "done" -> "✓"; else -> "–" }

/**
 * Writes a report to the place the person chose, off the main thread, and says how it went (review 02/11: every failure was swallowed and
 * success said nothing). The system's save dialog has already created the file, so a failed write removes the empty file it left.
 */
private fun saveReport(context: android.content.Context, scope: kotlinx.coroutines.CoroutineScope, target: android.net.Uri, write: (java.io.OutputStream) -> Unit) {
    scope.launch {
        val ok = withContext(Dispatchers.IO) {
            val written = runCatching { (context.contentResolver.openOutputStream(target) ?: error("no output stream")).use(write) }.isSuccess
            if (!written) runCatching { android.provider.DocumentsContract.deleteDocument(context.contentResolver, target) }
            written
        }
        android.widget.Toast.makeText(context, if (ok) R.string.chat_research_saved else R.string.chat_research_save_failed, android.widget.Toast.LENGTH_SHORT).show()
    }
}

@Composable
internal fun ResearchCard(status: ResearchStatus, report: String?, charts: List<ResearchChart>, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val uri = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    val lang = if (Locale.getDefault().language == "vi") "vi" else "en"
    val title = status.title.ifBlank { "report" }
    // the file goes where the person chooses (the system's save dialog); nothing is uploaded
    val saveMd = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/markdown")) { target ->
        if (target != null && report != null) saveReport(context, scope, target) { it.write(reportMarkdown(withChartTables(report, charts, lang), status.links).toByteArray()) }
    }
    val savePdf = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")) { target ->
        if (target != null && report != null) saveReport(context, scope, target) { writeReportPdf(title, reportForPdf(withChartTables(report, charts, lang), status.links), it) }
    }
    // 01/11 (web reportDocx.ts): the report as a Word file
    val saveDocx = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/vnd.openxmlformats-officedocument.wordprocessingml.document")) { target ->
        if (target != null && report != null) saveReport(context, scope, target) { writeReportDocx(title, reportMarkdown(withChartTables(report, charts, lang), status.links), it) }
    }
    val phaseText = when (status.phase) {
        "planning" -> stringResource(R.string.chat_research_planning)
        "researching" -> stringResource(R.string.chat_research_researching, status.sources)
        "writing" -> stringResource(R.string.chat_research_writing, status.sources)
        "done" -> stringResource(R.string.chat_research_done, status.sources)
        else -> stringResource(R.string.chat_research_failed)
    }
    val line = MaterialTheme.colorScheme.outlineVariant
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = TappySpacing.md)
            .border(1.dp, line, RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("🔎  $phaseText", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        if (status.title.isNotBlank()) Text(status.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        status.steps.forEach { s ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(mark(s.status), color = if (s.status == "done") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(16.dp))
                Text(
                    s.title, style = MaterialTheme.typography.bodySmall,
                    color = if (s.status == "done") MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (status.links.isNotEmpty()) {
            HorizontalDivider(color = line, modifier = Modifier.padding(vertical = 4.dp))
            Text(stringResource(R.string.chat_research_sources), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            status.links.forEach { l ->
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${l.id}.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        l.title.ifBlank { runCatching { URI(l.url).host }.getOrNull() ?: l.url },
                        fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.clickable { runCatching { uri.openUri(l.url) } },
                    )
                }
            }
        }
        if (status.phase == "done" && !report.isNullOrBlank()) {
            HorizontalDivider(color = line, modifier = Modifier.padding(vertical = 4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.chat_research_download), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                ExportButton("Markdown") { saveMd.launch(reportFileName(title, "md")) }
                ExportButton("PDF") { savePdf.launch(reportFileName(title, "pdf")) }
                ExportButton("Word") { saveDocx.launch(reportFileName(title, "docx")) }
            }
        }
    }
}

@Composable
private fun ExportButton(label: String, onClick: () -> Unit) {
    Text(
        label,
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 4.dp),
    )
}
