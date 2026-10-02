package com.tappyai.app.scamshield

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.personal.V3Tone
import com.tappyai.app.scamshield.data.QrKind
import com.tappyai.app.scamshield.data.QrPayload

/**
 * A QR code that is NOT a web link — web `ScamShieldView.tsx` `data-qr-other` card, element for element and in the same order:
 * title → type → warning → "What was read" + the decoded text (cut at 500 characters) → "not checked" → "read on your device" → disclaimer.
 * Nothing was sent anywhere and nothing is opened. The web card has no share button, and neither has this one.
 */
@Composable
internal fun QrNoticeCard(payload: QrPayload.Other) {
    val kindRes = qrKindRes(payload.kind)
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
                    modifier = Modifier.padding(top = 4.dp),
                )
                Text(
                    text = stringResource(qrWarningRes(payload.kind)),
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 13.5.sp,
                    lineHeight = 19.sp,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Text(text = stringResource(R.string.scam_qr_content), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(top = 12.dp))
                val shape = RoundedCornerShape(12.dp)
                Text(
                    text = payload.preview,
                    color = HomeV3.OnSurface,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier.padding(top = 2.dp).fillMaxWidth().clip(shape).background(HomeV3.SurfaceVariant).border(1.dp, HomeV3.Outline, shape).padding(horizontal = 12.dp, vertical = 8.dp),
                )
                Text(
                    text = stringResource(R.string.scam_qr_no_verdict),
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 12.5.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier.padding(top = 12.dp),
                )
                Text(text = stringResource(R.string.scam_qr_privacy), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 12.dp))
            }
        }
        DisclaimerLine(modifier = Modifier.padding(top = 14.dp))
    }
}

/** "TappyAI không thay thế cơ quan chức năng." — printed under every result (web `VerdictDisclaimer`, `scamVerdict.disclaimer`). */
@Composable
internal fun DisclaimerLine(modifier: Modifier = Modifier) {
    Row(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(Icons.Filled.Info, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.padding(top = 2.dp).size(14.dp))
        Text(text = stringResource(R.string.scam_verdict_disclaimer), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold)
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
