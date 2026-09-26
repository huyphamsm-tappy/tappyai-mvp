package com.tappyai.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonSize
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappySpacing
import java.time.LocalDate

/**
 * The guest's 18+ self-declaration step, rendered UNDER the server's refusal bubble when
 * `/api/chat` answers `403 age_declaration_required` (owner decision D1 revised, 2026-09-17).
 *
 * Two ways to answer, both the web's (`/age-check` for a guest): a birth YEAR, or the one-tap
 * "Tôi đủ 18 tuổi". The value is stored on this device ([com.tappyai.app.chat.data.GuestAgeStore])
 * and sent as `x-tappy-age-declared`; the server evaluates it. Nothing is verified here — it is
 * a self-declaration — and an under-18 year is accepted too, so the refusal sticks.
 */
@Composable
internal fun GuestAgeDeclaration(
    onDeclare: (birthYear: Int?, adult: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    var year by rememberSaveable { mutableStateOf("") }
    val parsed = year.trim().takeIf { it.length == 4 }?.toIntOrNull()
    val thisYear = LocalDate.now().year
    val yearOk = parsed != null && parsed in 1900..thisYear
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = TappySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.chat_age_declaration_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TappyTextField(
                value = year,
                onValueChange = { year = it.filter(Char::isDigit).take(4) },
                placeholder = stringResource(R.string.chat_age_declaration_year_placeholder),
                keyboardType = KeyboardType.Number,
                modifier = Modifier.width(120.dp),
            )
            TappyButton(
                text = stringResource(R.string.chat_age_declaration_confirm_year),
                onClick = { if (yearOk) onDeclare(parsed, false) },
                enabled = yearOk,
                size = TappyButtonSize.Small,
            )
        }
        TappyButton(
            text = stringResource(R.string.chat_age_declaration_adult),
            onClick = { onDeclare(null, true) },
            variant = TappyButtonVariant.Ghost,
            size = TappyButtonSize.Small,
        )
    }
}
