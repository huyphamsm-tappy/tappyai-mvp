package com.tappyai.app.scamshield

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.personal.V3Tone
import com.tappyai.app.scamshield.data.QrKind
import com.tappyai.app.scamshield.data.QrPayload
import com.tappyai.app.scamshield.data.ScamScenario
import com.tappyai.app.share.TappyShare

/**
 * Scam Shield results that are produced ON THE DEVICE — nothing was sent to a server to make them:
 *  - [KnownScenarioCard]: a pasted message that matches one of the 25 official scenarios with high confidence;
 *  - [QrNoticeCard]: a QR code that is not a web link (named and warned about, never acted on).
 * Both carry the fixed emergency line (113) and the "TappyAI is not a state agency" disclaimer, and can be shared as plain text
 * that never contains the message or the code.
 */
@Composable
internal fun KnownScenarioCard(scenario: ScamScenario, viewModel: ScamShieldViewModel) {
    val context = LocalContext.current
    val shape = RoundedCornerShape(16.dp)
    val shareText = stringResource(R.string.scam_known_share, scenario.official.title, TappyShare.CANONICAL_ORIGIN + "/scam-shield")
    ToolPanel {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Icons.Filled.WarningAmber, contentDescription = null, tint = V3Tone.Rose, modifier = Modifier.padding(top = 2.dp).size(22.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.scam_known_title, scenario.official.title),
                    color = HomeV3.OnSurface,
                    fontSize = 16.sp,
                    lineHeight = 21.sp,
                    fontWeight = FontWeight.Bold,
                )
                Row(modifier = Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Filled.Verified, contentDescription = null, tint = V3Tone.Emerald, modifier = Modifier.size(14.dp))
                    Text(text = stringResource(R.string.scam_known_badge), color = V3Tone.Emerald, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        ScenarioDetail(scenario = scenario, viewModel = viewModel)
        EmergencyAndDisclaimer(modifier = Modifier.padding(top = 14.dp))
        ShareResultButton(text = shareText, context = context, modifier = Modifier.padding(top = 10.dp))
    }
}

@Composable
internal fun QrNoticeCard(payload: QrPayload.Other) {
    val context = LocalContext.current
    val kindRes = qrKindRes(payload.kind)
    val shareText = stringResource(R.string.scam_qr_share, stringResource(kindRes), TappyShare.CANONICAL_ORIGIN + "/scam-shield")
    ToolPanel {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Icons.Filled.WarningAmber, contentDescription = null, tint = V3Tone.Amber, modifier = Modifier.padding(top = 2.dp).size(22.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.scam_qr_notice_title, stringResource(kindRes)),
                    color = HomeV3.OnSurface,
                    fontSize = 16.sp,
                    lineHeight = 21.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(qrWarningRes(payload.kind)),
                    color = HomeV3.OnSurface,
                    fontSize = 13.5.sp,
                    lineHeight = 19.sp,
                    modifier = Modifier.padding(top = 6.dp),
                )
                Text(
                    text = stringResource(R.string.scam_qr_never_act),
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 12.5.sp,
                    lineHeight = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
        if (payload.preview.isNotBlank()) {
            val shape = RoundedCornerShape(12.dp)
            Column(modifier = Modifier.padding(top = 12.dp).fillMaxWidth().clip(shape).background(HomeV3.SurfaceVariant).border(1.dp, HomeV3.Outline, shape).padding(12.dp)) {
                Text(text = stringResource(if (payload.kind == QrKind.Wifi) R.string.scam_qr_preview_wifi else R.string.scam_qr_preview), color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                Text(text = payload.preview, color = HomeV3.OnSurface, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 4.dp))
            }
        }
        Text(text = stringResource(R.string.scam_qr_privacy), color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 10.dp))
        EmergencyAndDisclaimer(modifier = Modifier.padding(top = 12.dp))
        ShareResultButton(text = shareText, context = context, modifier = Modifier.padding(top = 10.dp))
    }
}

/** The fixed emergency line and the "TappyAI is not a state agency" note. Text is fixed; nothing about the input is in it. */
@Composable
private fun EmergencyAndDisclaimer(modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(12.dp)
    Column(modifier = modifier.fillMaxWidth().clip(shape).background(V3Tone.Rose.copy(alpha = 0.10f)).border(1.dp, V3Tone.Rose.copy(alpha = 0.34f), shape).padding(12.dp)) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Filled.Phone, contentDescription = null, tint = V3Tone.Rose, modifier = Modifier.padding(top = 2.dp).size(15.dp))
            Text(text = stringResource(R.string.scam_emergency_113), color = HomeV3.OnSurface, fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold)
        }
        Row(modifier = Modifier.padding(top = 8.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Filled.Info, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.padding(top = 2.dp).size(14.dp))
            Text(text = stringResource(R.string.scam_not_state_agency), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp)
        }
    }
}

/** "Chia sẻ kết quả" — plain text through the system share sheet. The text is built by the caller and never holds the message or the code. */
@Composable
internal fun ShareResultButton(text: String, context: Context, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(10.dp))
            .clickable(role = Role.Button) {
                runCatching {
                    val send = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text) }
                    context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            }
            .padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Filled.Share, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(16.dp))
        Text(text = stringResource(R.string.scam_share_result), color = HomeV3.Purple, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

internal fun qrKindRes(kind: QrKind): Int = when (kind) {
    QrKind.Text -> R.string.scam_qr_kind_text
    QrKind.Wifi -> R.string.scam_qr_kind_wifi
    QrKind.Payment -> R.string.scam_qr_kind_payment
    QrKind.Contact -> R.string.scam_qr_kind_contact
    QrKind.Phone -> R.string.scam_qr_kind_phone
    QrKind.Sms -> R.string.scam_qr_kind_sms
    QrKind.Email -> R.string.scam_qr_kind_email
    QrKind.Location -> R.string.scam_qr_kind_location
    QrKind.Calendar -> R.string.scam_qr_kind_calendar
    QrKind.UnsafeLink -> R.string.scam_qr_kind_unsafe
}

internal fun qrWarningRes(kind: QrKind): Int = when (kind) {
    QrKind.Payment -> R.string.scam_qr_warn_payment
    QrKind.Wifi -> R.string.scam_qr_warn_wifi
    QrKind.UnsafeLink -> R.string.scam_qr_warn_unsafe
    QrKind.Phone, QrKind.Sms, QrKind.Email, QrKind.Contact -> R.string.scam_qr_warn_contact
    QrKind.Text, QrKind.Location, QrKind.Calendar -> R.string.scam_qr_warn_text
}
