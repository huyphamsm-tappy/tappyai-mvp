package com.tappyai.app.scamshield

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3

/**
 * The ONE source of the Scam Shield emergency scam-reporting hotline and its official source — a port of Web final's
 * `src/lib/scam-shield/hotline.ts` (`a43948d`). National scam-REPORTING line only: per-brand hotlines are another thing.
 * [SOURCE_URL] is the canonical page, no tracking parameters, and is never drawn as visible text (only the agency name is the link).
 */
internal object ScamReportHotline {
    const val DISPLAY = "0692.345.860"
    /** One tap opens the dialer; no spaces, no dots. */
    const val TEL = "tel:0692345860"
    const val SOURCE_URL = "https://bocongan.gov.vn/hoi-dap/chi-tiet-cau-hoi/ab7d473e-21c9-4950-8ae2-947c1c7605af?page=/"
}

/**
 * The emergency card "Nghi bị lừa?" (Web final `ScamHelpCard.tsx`): title, body, a one-tap call to the canonical hotline, the hotline's context
 * and "Nguồn: Bộ Công an". It sits after the hero and before the tools, so a person who already lost money or shared an OTP finds the way to the
 * police first. The call opens the DIALER (`ACTION_DIAL`): nothing is dialled without the person's tap, and no CALL_PHONE permission is needed.
 */
@Composable
internal fun ScamHelpCard() {
    val context = LocalContext.current
    ToolPanel {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
            Box(
                modifier = Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(HomeV3.SurfaceVariant),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Shield, contentDescription = null, tint = HomeV3.OnSurface, modifier = Modifier.size(22.dp)) }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(text = stringResource(R.string.scam_v3_help_title), color = HomeV3.OnSurface, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
                Text(text = stringResource(R.string.scam_v3_help_body), color = HomeV3.OnSurface, fontSize = 14.sp, lineHeight = 19.sp)
            }
        }
        Column(modifier = Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            BrandCta(
                text = stringResource(R.string.scam_v3_help_call, ScamReportHotline.DISPLAY),
                icon = Icons.Filled.Phone,
                busy = false,
                enabled = true,
                onClick = { openIntent(context, Intent(Intent.ACTION_DIAL, Uri.parse(ScamReportHotline.TEL))) },
            )
            Text(
                text = buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(stringResource(R.string.scam_v3_help_hotlineTitle)) }
                    append(" — ${stringResource(R.string.scam_v3_help_agency)}. ${stringResource(R.string.scam_v3_help_hotlineDesc)}")
                },
                color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp, lineHeight = 16.sp,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(text = stringResource(R.string.scam_v3_help_sourceLabel), color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp)
                Text(
                    text = stringResource(R.string.scam_v3_help_sourceName),
                    color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp, textDecoration = TextDecoration.Underline,
                    modifier = Modifier.clickable(role = Role.Button) { openIntent(context, Intent(Intent.ACTION_VIEW, Uri.parse(ScamReportHotline.SOURCE_URL))) },
                )
            }
        }
    }
}

private fun openIntent(context: Context, intent: Intent) {
    runCatching { context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}
