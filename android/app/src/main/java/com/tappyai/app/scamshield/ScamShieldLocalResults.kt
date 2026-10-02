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
import com.tappyai.app.scamshield.data.ScenarioMatch
import com.tappyai.app.share.TappyShare

/**
 * Scam Shield results that are produced ON THE DEVICE — nothing was sent to a server to make them. The wording is the web's
 * (`scamVerdict.ts` / `scamQr.ts`, origin/rc/web-uat), word for word:
 *  - [KnownScenarioCard]: a pasted message that matches one of the 25 official scenarios — "familiar" (strong) or "suspicious" (weak),
 *    with the matching scenario, its official source and the 113 line;
 *  - [NoMatchCard]: nothing matched — "no familiar signs recognised", which is explicitly NOT "safe";
 *  - [QrNoticeCard]: a QR code that is not a web link (named and warned about, never acted on).
 * Every card ends with "TappyAI does not replace the authorities" and can be shared as plain text that never holds the message or the code.
 */
@Composable
internal fun KnownScenarioCard(scenario: ScamScenario, match: ScenarioMatch, viewModel: ScamShieldViewModel) {
    val context = LocalContext.current
    val kind = VerdictKind.fromScenario(match.confidence)
    val tone = toneFor(kind)
    val shareText = stringResource(R.string.scam_known_share, scenario.official.title, TappyShare.CANONICAL_ORIGIN + "/scam-shield")
    ToolPanel {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Icons.Filled.WarningAmber, contentDescription = null, tint = tone.fg, modifier = Modifier.padding(top = 2.dp).size(22.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(if (kind == VerdictKind.Familiar) R.string.scam_verdict_familiar else R.string.scam_verdict_suspicious),
                    color = tone.fg,
                    fontSize = 17.sp,
                    lineHeight = 21.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Text(
                    text = stringResource(if (kind == VerdictKind.Familiar) R.string.scam_verdict_familiar_body else R.string.scam_verdict_suspicious_body),
                    color = HomeV3.OnSurface,
                    fontSize = 13.5.sp,
                    lineHeight = 19.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
        Column(modifier = Modifier.padding(top = 14.dp)) {
            Text(text = stringResource(R.string.scam_verdict_scenario_heading), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Text(text = scenario.official.title, color = HomeV3.OnSurface, fontSize = 15.sp, lineHeight = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 2.dp))
            Text(
                text = stringResource(R.string.scam_verdict_scenario_number, scenario.officialNumber),
                color = HomeV3.OnSurfaceVariant,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        ScenarioDetail(scenario = scenario, viewModel = viewModel)
        ReportLine(modifier = Modifier.padding(top = 14.dp))
        DisclaimerLine(modifier = Modifier.padding(top = 12.dp))
        ShareResultButton(text = shareText, context = context, modifier = Modifier.padding(top = 10.dp))
    }
}

/** A message that matched no known scenario: the third state — never "safe", always the reminder to verify. */
@Composable
internal fun NoMatchCard() {
    val context = LocalContext.current
    val shareText = stringResource(R.string.scam_verdict_share_unrecognized, TappyShare.CANONICAL_ORIGIN + "/scam-shield")
    ToolPanel {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Icons.Filled.Info, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.padding(top = 2.dp).size(22.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.scam_verdict_unrecognized),
                    color = HomeV3.OnSurface,
                    fontSize = 17.sp,
                    lineHeight = 21.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Text(
                    text = stringResource(R.string.scam_verdict_unrecognized_body),
                    color = HomeV3.OnSurface,
                    fontSize = 13.5.sp,
                    lineHeight = 19.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
        DisclaimerLine(modifier = Modifier.padding(top = 14.dp))
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
                    text = stringResource(R.string.scam_qr_title),
                    color = HomeV3.OnSurface,
                    fontSize = 16.sp,
                    lineHeight = 21.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(kindRes),
                    color = HomeV3.OnSurface,
                    fontSize = 14.sp,
                    lineHeight = 19.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 6.dp),
                )
                Text(
                    text = stringResource(qrWarningRes(payload.kind)),
                    color = HomeV3.OnSurface,
                    fontSize = 13.5.sp,
                    lineHeight = 19.sp,
                    modifier = Modifier.padding(top = 6.dp),
                )
                Text(
                    text = stringResource(R.string.scam_qr_no_verdict),
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
                Text(text = stringResource(if (payload.kind == QrKind.Wifi) R.string.scam_qr_content_wifi else R.string.scam_qr_content), color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                Text(text = payload.preview, color = HomeV3.OnSurface, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 4.dp))
            }
        }
        Text(text = stringResource(R.string.scam_qr_privacy), color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 10.dp))
        DisclaimerLine(modifier = Modifier.padding(top = 12.dp))
        ShareResultButton(text = shareText, context = context, modifier = Modifier.padding(top = 10.dp))
    }
}

/** "Báo ngay cho Công an nơi gần nhất hoặc gọi 113 nếu nghi ngờ bị lừa." — shown with a matching scenario (web `scamVerdict.scenario.report`). */
@Composable
private fun ReportLine(modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier = modifier.fillMaxWidth().clip(shape).background(V3Tone.Rose.copy(alpha = 0.10f)).border(1.dp, V3Tone.Rose.copy(alpha = 0.34f), shape).padding(12.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Filled.Phone, contentDescription = null, tint = V3Tone.Rose, modifier = Modifier.padding(top = 2.dp).size(15.dp))
        Text(text = stringResource(R.string.scam_verdict_scenario_report), color = HomeV3.OnSurface, fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** "TappyAI không thay thế cơ quan chức năng." — printed under every result (web `scamVerdict.disclaimer`). */
@Composable
internal fun DisclaimerLine(modifier: Modifier = Modifier) {
    Row(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(Icons.Filled.Info, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.padding(top = 2.dp).size(14.dp))
        Text(text = stringResource(R.string.scam_verdict_disclaimer), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp)
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
    QrKind.Location -> R.string.scam_qr_kind_geo
    QrKind.UnsafeLink -> R.string.scam_qr_kind_app_link
}

internal fun qrWarningRes(kind: QrKind): Int = when (kind) {
    QrKind.Payment -> R.string.scam_qr_warn_payment
    QrKind.Wifi -> R.string.scam_qr_warn_wifi
    QrKind.Contact -> R.string.scam_qr_warn_contact
    QrKind.Phone -> R.string.scam_qr_warn_phone
    QrKind.Sms -> R.string.scam_qr_warn_sms
    QrKind.Email -> R.string.scam_qr_warn_email
    QrKind.Location -> R.string.scam_qr_warn_geo
    QrKind.UnsafeLink -> R.string.scam_qr_warn_app_link
    QrKind.Text -> R.string.scam_qr_warn_text
}
