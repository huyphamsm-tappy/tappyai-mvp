package com.tappyai.app.scamshield

import com.tappyai.app.scamshield.data.KnowledgeBundle
import com.tappyai.app.scamshield.data.MessageAnalysisResponseDto
import com.tappyai.app.scamshield.data.ScamCheckResponseDto
import com.tappyai.app.scamshield.data.isOfficialSourceUrl
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Cảnh báo lừa đảo on Android — the CURRENT web `/scam-shield` (`design/v3-phase4` @ f6712b8:
 * `ScamShieldView.tsx`, `ScamShieldResult.tsx`, `ScamMessageResult.tsx`,
 * `ScamKnowledgeSection.tsx`, `lib/scam-shield/knowledge` (the dataset module), `lib/scam-shield/history.ts`),
 * 2026-09-17, plus the Home section and its position. Source pins of the product contract; the
 * engine is the server's and untouched.
 */
class ScamShieldV3Test {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun raw(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n")
    private fun src(rel: String): String = raw(rel)
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")

    private val screen get() = src("app/src/main/java/com/tappyai/app/scamshield/ScamShieldScreen.kt")
    private val result get() = src("app/src/main/java/com/tappyai/app/scamshield/ScamShieldResult.kt")
    private val knowledgeUi get() = src("app/src/main/java/com/tappyai/app/scamshield/ScamKnowledgeSection.kt")
    private val vm get() = src("app/src/main/java/com/tappyai/app/scamshield/ScamShieldViewModel.kt")
    private val home get() = src("app/src/main/java/com/tappyai/app/home/HomeScreen.kt")
    private val json = Json { ignoreUnknownKeys = true }

    // ── 1. The page: the web's sections, in the web's order ──

    @Test
    fun `the page is the current web composition - header, hero with feature tiles, three-tab tool, verdict, official knowledge, recent checks`() {
        val s = screen
        val header = s.indexOf("V3PageHeader(title = stringResource(R.string.scam_shield_v3_name)")
        val historyLink = s.indexOf("R.string.scam_v3_historyLink")
        val hero = s.indexOf("ToolHero(")
        val tool = s.indexOf("ToolPanel {")
        val tabs = s.indexOf("R.string.scam_v3_tabUrl")
        val verdict = s.indexOf("?.let { VerdictCard(it.result) }")
        val message = s.indexOf("?.let { MessageResultCard(it.result) }")
        val knowledge = s.indexOf("ScamKnowledgeSection(viewModel = viewModel)")
        val history = s.indexOf("HistoryPanel(")
        assertTrue("header → history link → hero → tool → tabs → verdicts → knowledge → history",
            header in 1 until historyLink && historyLink < hero && hero < tool && tool < tabs && tabs < verdict && verdict < message && message < knowledge && knowledge < history)
        assertTrue("the hero is the web's: Navy, eyebrow/title1/title2/body, the shield pose, the four feature tiles",
            s.contains("hue = ToolHue.Navy") && s.contains("R.string.scam_v3_heroEyebrow") && s.contains("R.string.scam_v3_heroTitle1") && s.contains("R.string.scam_v3_heroTitle2") && s.contains("R.string.scam_v3_heroBody") && s.contains("R.drawable.tappy_recommendation") && s.contains("footer = { FeatureTiles() }"))
        listOf("scam_v3_featDetect", "scam_v3_featFast", "scam_v3_featHttps", "scam_v3_featBrand").forEach { assertTrue(it, s.contains("R.string.$it,")) }
        assertTrue("the history link scrolls to the panel", s.contains("scroll.animateScrollTo(historyY)") && s.contains("historyY = it.positionInParent().y.toInt()"))
        assertFalse("no emoji stand-in, no leftover canonical identity panel", s.contains("\"🛡") || s.contains("R.string.scam_shield_v3_check_title"))
    }

    @Test
    fun `the tool has exactly the web's three tabs - URL, QR, message - as wrapping chips, each with its own form`() {
        val s = screen
        assertTrue(vm.contains("enum class ScamShieldTab { Url, Qr, Message }"))
        val url = s.indexOf("TabChip(stringResource(R.string.scam_v3_tabUrl), Icons.Filled.Link, viewModel.tab == ScamShieldTab.Url)")
        val qr = s.indexOf("TabChip(stringResource(R.string.scam_shield_v3_qr_upload), Icons.Filled.QrCode, viewModel.tab == ScamShieldTab.Qr)")
        val msg = s.indexOf("TabChip(stringResource(R.string.scam_v3_tabMessage), Icons.Outlined.Sms, viewModel.tab == ScamShieldTab.Message)")
        assertTrue("URL, QR, Message in that order", url in 1 until qr && qr < msg)
        assertEquals("exactly three tab chips", 3, Regex("""TabChip\(stringResource\(R\.string\.\w+\), Icons\.\w+\.\w+, viewModel\.tab == ScamShieldTab\.""").findAll(s).count())
        assertTrue("tabs wrap, never scroll", s.substringAfter("ToolPanel {").substringBefore("when (viewModel.tab)").contains("FlowRow("))
        assertTrue("the URL form", s.contains("ScamShieldTab.Url ->") && s.contains("R.string.scam_shield_v3_url_placeholder") && s.contains("KeyboardType.Uri") && s.contains("onClick = viewModel::check"))
        assertTrue("the QR drop zone", s.contains("ScamShieldTab.Qr -> DropZone(") && s.contains("ActivityResultContracts.PickVisualMedia()"))
        val form = s.substringAfter("ScamShieldTab.Message ->").substringBefore("(viewModel.state as? ScamShieldUiState.Failed)")
        assertTrue("the message form: title, subtitle, 5-row text, link, screenshot, quota hint, CTA",
            form.contains("R.string.scam_v3_msg_title") && form.contains("R.string.scam_v3_msg_subtitle") && form.contains("minLines = 5") && form.contains("R.string.scam_v3_msg_urlPlaceholder") &&
                form.contains("R.string.scam_v3_msg_upload") && form.contains("R.string.scam_v3_msg_removeScreenshot") && form.contains("R.string.scam_v3_msg_quotaHint, ScamShieldViewModel.ANON_LIFETIME_LIMIT.toString(), ScamShieldViewModel.FREE_DAILY_LIMIT.toString()") &&
                form.contains("R.string.scam_v3_msg_analyzing else R.string.scam_v3_msg_cta") && form.contains("enabled = viewModel.canAnalyze && !checking") && form.contains("onClick = viewModel::analyzeMessage"))
        assertTrue("switching tabs clears the verdict, as the web's switchTab does", vm.contains("fun selectTab(next: ScamShieldTab)") && vm.substringAfter("fun selectTab").substringBefore("}").contains("state = ScamShieldUiState.Idle"))
        assertTrue("the web's bounds: 4000 chars, 5 MB, JPEG/PNG/WebP", vm.contains("const val MESSAGE_MAX_CHARS = 4_000") && vm.contains("const val SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024") && vm.contains("listOf(\"image/jpeg\", \"image/png\", \"image/webp\")"))
        assertTrue("at least one of text / link / screenshot", vm.contains("message.isNotBlank() || messageUrl.isNotBlank() || screenshot != null"))
        assertTrue("the rose error box, inside the tool panel", result.contains("V3Tone.Rose.copy(alpha = 0.10f)") && result.contains(".border(1.dp, V3Tone.Rose, shape)"))
    }

    @Test
    fun `the verdict cards are tinted by the level - six hues, HIGH's own pair, INCONCLUSIVE neutral - and the message card reads verdict, why, wants, do not, do now, links`() {
        val s = result
        assertTrue(s.contains(".background(tone.soft).border(1.dp, tone.border, V3PanelShape)"))
        assertTrue(s.contains("RiskLevel.SAFE -> LevelTone(V3Tone.Emerald") && s.contains("RiskLevel.LOW -> LevelTone(HomeV3.Purple") && s.contains("RiskLevel.MEDIUM -> LevelTone(V3Tone.Amber"))
        assertTrue("HIGH is the feature-scoped --ss-high pair", s.contains("Color(0xFFB4400C)") && s.contains("Color(0xFFFB923C)") && s.contains("if (dark) SsHighDark else SsHighLight"))
        assertTrue(s.contains("RiskLevel.CRITICAL -> LevelTone(V3Tone.Rose"))
        assertTrue("INCONCLUSIVE and UNKNOWN are neutral slate, never green", s.contains("RiskLevel.INCONCLUSIVE, RiskLevel.UNKNOWN -> LevelTone(HomeV3.OnSurfaceVariant, HomeV3.SurfaceVariant, HomeV3.Outline, Icons.Filled.GppMaybe"))
        assertTrue(s.contains("R.string.scam_shield_v3_score") && s.contains("confidence >= 80 ->") && s.contains("confidence >= 50 ->"))
        assertTrue("URL card: official, actions, evidence", s.contains("OfficialSection(") && s.contains("ActionsSection(") && s.contains("EvidenceSection("))
        assertTrue("the web's action glyph map", listOf("\"stop\" ->", "\"link\" ->", "\"phone\" ->", "\"flag\" ->", "\"warning\" ->", "\"search\" ->", "\"check\" ->").all { s.contains(it) })

        val card = s.substringAfter("internal fun MessageResultCard")
        val order = listOf("result.reasoningSummary", "R.string.scam_v3_msg_goal)", "R.string.scam_v3_msg_why", "R.string.scam_v3_msg_wants", "R.string.scam_v3_msg_doNot", "R.string.scam_v3_msg_doNow", "R.string.scam_v3_msg_links", "R.string.scam_v3_msg_extracted", "AnalysisNote(result)")
            .map { it to card.indexOf(it) }
        order.forEach { (k, at) -> assertTrue("$k on the message card", at >= 0) }
        assertEquals("the web's order", order.map { it.first }, order.sortedBy { it.second }.map { it.first })
        assertTrue("signal dots: low accent, medium amber, high rose", s.contains("\"high\" -> V3Tone.Rose") && s.contains("\"medium\" -> V3Tone.Amber") && s.contains("else -> HomeV3.Purple"))
        assertTrue("stop = Ban in rose, go = check in emerald", s.contains("if (stop) Icons.Filled.Block else Icons.Filled.CheckCircle") && s.contains("if (stop) V3Tone.Rose else V3Tone.Emerald"))
        assertTrue("an unchecked link says so", s.contains("R.string.scam_v3_msg_linkUnchecked") && s.contains("if (c.checked && c.level != null) c.level else RiskLevel.INCONCLUSIVE"))
        assertTrue("the analysis note names how the verdict was reached and the GLOBAL counter", listOf("\"used\" ->", "\"not_needed\" ->", "\"quota_exhausted\" ->", "\"unavailable\" ->", "R.string.scam_v3_msg_aiPro", "R.string.scam_v3_msg_aiLeft", "R.string.scam_v3_msg_aiToday", "R.string.scam_v3_msg_aiQuotaGuest").all { s.contains(it) })
        assertTrue("every SCAM_TYPES and ATTACK_GOALS key has a label", listOf("bank_phishing", "otp_phishing", "job_scam", "charity_scam").all { s.contains("\"$it\" -> R.string.scam_v3_msg_type_$it") } && listOf("account_takeover", "payment_fraud", "impersonation", "other").all { s.contains("\"$it\" -> R.string.scam_v3_msg_goal_$it") })
    }

    // ── 2. Official knowledge: Bộ Công an, attributed, never TappyAI's own authority ──

    @Test
    fun `the knowledge section is the web's - header with source line, all plus five official groups, count, six-card preview, see more`() {
        val k = knowledgeUi
        assertTrue("header: book tile, uppercase title, subtitle, official · source: organization", k.contains("R.string.scam_v3_kb_title).uppercase()") && k.contains("R.string.scam_v3_kb_subtitle") && k.contains("stringResource(R.string.scam_v3_kb_official) + \" · \" + stringResource(R.string.scam_v3_kb_source) + \": \" + organization"))
        assertTrue("all + the categories as filter chips", k.contains("TabChip(stringResource(R.string.scam_v3_kb_all), null, viewModel.knowledgeCategory == null)") && k.contains("viewModel.knowledgeCategories.forEach { id ->"))
        assertTrue(k.contains("R.string.scam_v3_kb_count, scenarios.size.toString()"))
        assertTrue(k.contains("scenarios.take(ScamShieldViewModel.KNOWLEDGE_PREVIEW)") && vm.contains("const val KNOWLEDGE_PREVIEW = 6"))
        assertTrue(k.contains("R.string.scam_v3_kb_showLess else R.string.scam_v3_kb_showMore"))
        listOf("impersonation", "ai_deepfake", "investment_jobs", "online_trading", "data_theft").forEach { assertTrue("$it icon, tone, label", k.contains("\"$it\" -> Icons.") && k.contains("\"$it\" -> CategoryTone(") && k.contains("\"$it\" -> R.string.scam_v3_kb_cat_$it")) }
        assertTrue("a card shows the official title and summary", k.contains("text = s.official.title") && k.contains("text = s.official.summary"))
        assertTrue("the section is static: no request, no model, no quota", !k.contains("repository") && !k.contains("api.") && !k.contains("quota"))
    }

    @Test
    fun `an open card separates the official text from TappyAI's guidance - official block with source, dates, number and link, guidance block labelled as TappyAI's, prevention verbatim`() {
        val k = knowledgeUi
        val detail = k.substringAfter("private fun ScenarioDetail").substringBefore("internal fun ScamKnowledgeSection")
        val official = detail.indexOf("R.string.scam_v3_kb_official)")
        val guidance = detail.indexOf("R.string.scam_v3_kb_guidance)")
        val prevention = detail.indexOf("R.string.scam_v3_kb_prevention)")
        val note = detail.indexOf("R.string.scam_v3_kb_contentLanguage")
        assertTrue("official → guidance → prevention → language note", official in 1 until guidance && guidance < prevention && prevention < note)
        val officialBlock = detail.substring(official, guidance)
        assertTrue("the official block is the source's text, attributed", officialBlock.contains("scenario.official.summary") && officialBlock.contains("scenario.source.organization") && officialBlock.contains("R.string.scam_v3_kb_published") && officialBlock.contains("R.string.scam_v3_kb_verifiedAt") && officialBlock.contains("R.string.scam_v3_kb_officialNumber, scenario.officialNumber.toString()") && officialBlock.contains("R.string.scam_v3_kb_openSource) + \": \" + scenario.source.title"))
        assertTrue("the group line: officialNumber. label: description", officialBlock.contains("\"\${group.officialNumber}. \${group.label}:\""))
        assertTrue("only an https official host is opened", officialBlock.contains("isOfficialSourceUrl(scenario.source.url)") && officialBlock.contains("clickable(enabled = openable"))
        val guidanceBlock = detail.substring(guidance, prevention)
        assertTrue("the guidance block says it is TappyAI's, not a quotation", guidanceBlock.contains("R.string.scam_v3_kb_guidanceNote"))
        assertTrue(listOf("scam_v3_kb_signs", "scam_v3_kb_requests", "scam_v3_kb_goal", "scam_v3_kb_doNot", "scam_v3_kb_doNow").all { guidanceBlock.contains("R.string.$it") })
        assertTrue(guidanceBlock.contains("scenario.guidance.warningSigns") && guidanceBlock.contains("scenario.guidance.commonRequests") && guidanceBlock.contains("scenario.guidance.whatNotToDo") && guidanceBlock.contains("scenario.guidance.whatToDo"))
        val preventionBlock = detail.substring(prevention, note)
        assertTrue(preventionBlock.contains("dataset.official.preventionMeasures") && preventionBlock.contains("R.string.scam_v3_kb_report) + \": \" + dataset.official.reportAdvice"))
        val vi = raw("app/src/main/res/values-vi/strings_scam_v3.xml")
        assertTrue("the attribution words are the web's", vi.contains("<string name=\"scam_v3_kb_official\">Thông tin từ nguồn chính thức</string>") && vi.contains("<string name=\"scam_v3_kb_source\">Nguồn</string>") && vi.contains("<string name=\"scam_v3_kb_guidance\">Hướng dẫn của TappyAI</string>"))
    }

    @Test
    fun `the bundled dataset is the web's Bộ Công an 2026 dataset - 25 verified scenarios in 5 official groups, every source an official https host, provenance recorded`() {
        val text = raw("app/src/main/assets/scam_knowledge/bocongan2026.json")
        val bundle = json.decodeFromString<KnowledgeBundle>(text)
        assertEquals("design/v3-phase4", bundle.provenance.branch)
        assertEquals("f6712b858f02f975f37f3898003612359fd7aa39", bundle.provenance.commit)
        assertEquals("src/lib/scam-shield/knowledge/bocongan2026.ts", bundle.provenance.module)
        assertEquals(listOf("impersonation", "ai_deepfake", "investment_jobs", "online_trading", "data_theft"), bundle.categories)
        val d = bundle.dataset
        assertEquals("Bộ Công an", d.source.organization)
        assertTrue(d.source.url.startsWith("https://bocongan.gov.vn/") && isOfficialSourceUrl(d.source.url))
        assertEquals(5, d.groups.size)
        assertEquals((1..5).toList(), d.groups.map { it.officialNumber })
        assertEquals(bundle.categories, d.groups.map { it.category })
        assertEquals(25, d.scenarios.size)
        assertEquals((1..25).toList(), d.scenarios.map { it.officialNumber }.sorted())
        assertEquals(25, d.scenarios.map { it.id }.toSet().size)
        d.scenarios.forEach { s ->
            assertTrue("${s.id} verified", s.verified)
            assertEquals("${s.id} language", "vi", s.language)
            assertTrue("${s.id} category", s.category in bundle.categories)
            assertTrue("${s.id} official text", s.official.title.isNotBlank() && s.official.summary.isNotBlank())
            assertTrue("${s.id} guidance", s.guidance.warningSigns.isNotEmpty() && s.guidance.commonRequests.isNotEmpty() && s.guidance.whatToDo.isNotEmpty() && s.guidance.whatNotToDo.isNotEmpty())
            assertTrue("${s.id} attributed to the source", s.source.organization == "Bộ Công an" && isOfficialSourceUrl(s.source.url) && s.source.verifiedAt.isNotBlank())
            assertTrue("${s.id} goal has a label", Regex("\"${s.attackerGoal}\" -> R\\.string\\.scam_v3_msg_goal_${s.attackerGoal}").containsMatchIn(result))
        }
        assertTrue(d.official.preventionMeasures.isNotEmpty() && d.official.reportAdvice.isNotBlank() && d.official.hotline == "113")
        assertFalse(isOfficialSourceUrl("http://bocongan.gov.vn/x"))
        assertFalse(isOfficialSourceUrl("https://bocongan.gov.vn.evil.com/x"))
    }

    // ── 3. Recent checks: the web's device-local history ──

    @Test
    fun `recent checks are written only from a URL or QR verdict - never a message verdict - a row re-runs the check, five then see all, clearable, on this device`() {
        val s = screen
        assertTrue(s.contains("R.string.scam_shield_v3_history_title") && s.contains("R.string.scam_shield_v3_history_empty") && s.contains("R.string.scam_shield_v3_history_local") && s.contains("R.string.scam_shield_v3_history_clear"))
        assertTrue(s.contains("entries.size > ScamShieldViewModel.HISTORY_PREVIEW") && s.contains("entries.take(ScamShieldViewModel.HISTORY_PREVIEW)"))
        assertTrue("a row re-runs the check", s.contains("onRecheck(entry)"))
        assertEquals("exactly the URL and QR verdicts record", 2, Regex("""recent = history\.record\(o\.result\)""").findAll(vm).count())
        // Since 8a5354c the branch also fires the GA4 scam_check event before returning the card; the property is
        // unchanged: the verdict becomes MessageResult and never a history row.
        assertTrue("a message verdict is its own card, never a row", vm.contains("is MessageAnalysisOutcome.Verdict -> { trackScamCheck(\"message\", o.result.level); ScamShieldUiState.MessageResult(o.result) }"))
        assertFalse("nothing records a failure into the history", vm.contains("Failed -> {\n                    recent"))
        val store = src("app/src/main/java/com/tappyai/app/scamshield/data/ScamCheckHistoryStore.kt")
        assertTrue(store.contains("const val LIMIT = 15") && store.contains("read().filter { it.url != entry.url }"))
        assertTrue("an unknown level never lands in history", store.contains("result.level == RiskLevel.UNKNOWN) return read()"))
        assertEquals("vietcombank.com.vn", displayHost("https://vietcombank.com.vn/login?x=1"))
        assertEquals("not a url", displayHost("not a url"))
    }

    // ── 4. The engine stays on the server ──

    @Test
    fun `the engine stays on the server and the fail-closed rules hold - three routes, one attempt wrapper`() {
        assertTrue(vm.contains("repository.check(target, preferVietnameseLabels = vietnamese())"))
        assertTrue(vm.contains("repository.checkQrImage(bytes, mime, preferVietnameseLabels = vietnamese())"))
        assertTrue(vm.contains("repository.analyzeMessage(message.trim(), messageUrl.trim(), shot?.bytes, shot?.mimeType, preferVietnameseLabels = vietnamese())"))
        assertTrue("only a Verdict reaches Result", vm.contains("is ScamCheckOutcome.Verdict -> {") && vm.contains("is ScamCheckOutcome.Failed -> ScamShieldUiState.Failed(o.failure)") && vm.contains("is MessageAnalysisOutcome.Failed -> ScamShieldUiState.Failed(o.failure)"))
        assertTrue("an older check is replaced, never raced", vm.contains("inFlight?.cancel()"))
        val api = src("app/src/main/java/com/tappyai/app/scamshield/data/ScamShieldApi.kt")
        assertTrue(api.contains("@POST(\"api/scam-shield/check\")") && api.contains("@POST(\"api/scam-shield/qr\")") && api.contains("@POST(\"api/scam-shield/analyze\")"))
        val repo = src("app/src/main/java/com/tappyai/app/scamshield/data/RealScamShieldRepository.kt")
        assertTrue(repo.contains("MultipartBody.Part.createFormData(\"image\", \"qr\""))
        assertTrue("the screenshot travels as the web's data URL", repo.contains("\"data:\${mimeType ?: \"image/jpeg\"};base64,\" + Base64.encodeToString(it, Base64.NO_WRAP)"))
        assertTrue("the server's localized refusal is preferred over the local fallback", result.contains("failure.serverMessage ?: stringResource(localFallbackFor(failure.code, forMessage))"))
        assertTrue("an unmapped message failure reads as 'could not analyze', never as a sentence about a link", result.contains("else -> if (forMessage) R.string.scam_v3_msg_errFailed else R.string.scam_shield_error_generic") && screen.contains("forMessage = viewModel.tab == ScamShieldTab.Message"))
        assertTrue(listOf("\"qr_decode_failed\" ->", "\"qr_no_url\" ->", "\"invalid_image\" -> R.string.scam_v3_msg_errImage", "\"analyze_failed\", \"account_required\", \"account_error\" -> R.string.scam_v3_msg_errFailed").all { result.contains(it) })
    }

    @Test
    fun `the action icon key decodes from the wire and an absent one is a generic alert`() {
        val dto = json.decodeFromString<ScamCheckResponseDto>(
            """{"url":"https://x.vn","risk":{"score":72,"confidence":85,"level":"HIGH"},"evidence":{"items":[{"source":"Google Safe Browsing","severity":"critical","summary":"Flagged","detail":""}]},"actions":[{"priority":"primary","icon":"stop","label_vi":"Dừng lại","label_en":"Stop"},{"priority":"secondary","label_vi":"Kiểm tra","label_en":"Check"}],"cached":false}""",
        )
        assertEquals("stop", dto.actions[0].icon)
        assertEquals("", dto.actions[1].icon)
        assertEquals(RiskLevel.HIGH, RiskLevel.fromWire(dto.risk.level))
        assertEquals(RiskLevel.UNKNOWN, RiskLevel.fromWire("SUPER_SAFE"))
    }

    @Test
    fun `the message verdict decodes the web's response shape - risk, type, goal, signals, advice in both languages, url checks, analysis, quota`() {
        val dto = json.decodeFromString<MessageAnalysisResponseDto>(
            """{"inputType":"message","risk":{"score":88,"confidence":80,"level":"CRITICAL"},"scamType":"bank_phishing","attackGoal":"otp_interception",
               "signals":[{"type":"otp_request","severity":"high","explanation":"Yêu cầu mã OTP","source":"rules"}],
               "requestedActions":["Gửi mã OTP"],"urlChecks":[{"url":"https://vcb-secure.xyz/login","status":"checked","level":"HIGH","score":70,"confidence":75},{"url":"https://x.vn","status":"failed"}],
               "advice":{"doNot":[{"code":"no_otp","label_vi":"Không gửi OTP","label_en":"Do not share the OTP"}],"doNow":[{"code":"call_bank","label_vi":"Gọi ngân hàng","label_en":"Call your bank"}]},
               "reasoningSummary":"Tin nhắn yêu cầu mã OTP.","analysis":{"tier":2,"aiStatus":"used","provider":"x","modelRole":"y"},"extractedText":null,"analyzedAt":1,
               "quota":{"kind":"anon","limit":5,"period":"lifetime","used":null,"remaining":3,"exhausted":false,"pro":false}}""",
        )
        assertEquals(RiskLevel.CRITICAL, RiskLevel.fromWire(dto.risk.level))
        assertEquals("bank_phishing", dto.scamType)
        assertEquals("otp_interception", dto.attackGoal)
        assertEquals("high", dto.signals.single().severity)
        assertEquals("checked", dto.urlChecks[0].status)
        assertEquals("failed", dto.urlChecks[1].status)
        assertNull(dto.urlChecks[1].level)
        assertEquals("Không gửi OTP", dto.advice!!.doNot.single().labelVi)
        assertEquals("Call your bank", dto.advice!!.doNow.single().labelEn)
        assertEquals("used", dto.analysis!!.aiStatus)
        assertEquals(3, dto.quota!!.remaining)
        assertEquals("lifetime", dto.quota!!.period)
        // A 200 without a verdict decodes to nulls the repository refuses (`throw SerializationException("no verdict")`).
        val empty = json.decodeFromString<MessageAnalysisResponseDto>("""{"ok":true}""")
        assertTrue(empty.risk.level.isBlank() && empty.analysis == null && empty.advice == null)
    }

    // ── 5. Strings: vi/en parity, every referenced key exists ──

    @Test
    fun `the user-facing name is Cảnh báo lừa đảo, the phase4 strings exist in both languages, and every referenced key exists`() {
        val vi = raw("app/src/main/res/values-vi/strings_scam_shield.xml") + raw("app/src/main/res/values-vi/strings_scam_v3.xml")
        val en = raw("app/src/main/res/values/strings_scam_shield.xml") + raw("app/src/main/res/values/strings_scam_v3.xml")
        assertTrue(vi.contains("<string name=\"scam_shield_v3_name\">Cảnh báo lừa đảo</string>") && vi.contains("<string name=\"home_scam_shield_title\">Cảnh báo lừa đảo</string>"))
        assertTrue(raw("app/src/main/res/values-vi/strings_home.xml").contains("<string name=\"smart_tool_safety\">Cảnh báo lừa đảo</string>"))
        assertTrue(en.contains("<string name=\"scam_shield_v3_name\">Scam Shield</string>") && raw("app/src/main/res/values/strings_home.xml").contains("<string name=\"smart_tool_safety\">Scam Shield</string>"))
        val names = { xml: String -> Regex("""<string name="(\w+)">""").findAll(xml).map { it.groupValues[1] }.toSet() }
        assertEquals("vi and en carry the same keys", names(vi), names(en))
        assertTrue("the web's tab words", vi.contains("<string name=\"scam_v3_tabUrl\">Kiểm tra URL</string>") && vi.contains("<string name=\"scam_shield_v3_qr_upload\">Quét mã QR</string>") && vi.contains("<string name=\"scam_v3_tabMessage\">Phân tích tin nhắn</string>"))
        assertTrue("the web's level words", vi.contains(">An toàn<") && vi.contains(">Nguy cơ thấp<") && vi.contains(">Cần cẩn thận<") && vi.contains(">Nguy cơ cao<") && vi.contains(">Rất nguy hiểm<") && vi.contains(">Chưa kết luận được<"))
        val referenced = listOf(screen, result, knowledgeUi, home)
            .flatMap { Regex("""R\.string\.(scam_shield_\w+|scam_v3_\w+|home_scam_shield_\w+)""").findAll(it).map { m -> m.groupValues[1] }.toList() }.toSet()
        assertTrue("every referenced string exists: ${referenced - names(vi)}", (referenced - names(vi)).isEmpty())
    }

    // ── 6. Home: the section, immediately above Ưu đãi hôm nay, opening the same route ──

    @Test
    fun `Home renders Cảnh báo lừa đảo as its own section IMMEDIATELY ABOVE Ưu đãi hôm nay, once, without moving anything else`() {
        val h = home
        val column = h.substring(h.indexOf("V3RecommendationsSection("), h.indexOf("SmartToolsSection(\n"))
        val order = listOf("V3RecommendationsSection(", "V3DiscoverBanner(", "V3ScamShieldSection(", "V3DealsSection(", "CommunityVideosSection(", "CategoryChipsSection(", "SuggestionsSection(", "RecentActivitySection(")
            .map { it to column.indexOf(it) }
        order.forEach { (name, at) -> assertTrue("$name is on the Home column", at >= 0) }
        assertEquals("the column order", order.map { it.first }, order.sortedBy { it.second }.map { it.first })
        assertEquals("the scam section is rendered exactly once", 1, Regex("""V3ScamShieldSection\(onOpenScamShield""").findAll(column).count())
        assertEquals("the deals section is rendered exactly once", 1, Regex("""V3DealsSection\(state = deals""").findAll(column).count())
        assertTrue("the section's title is the canonical name", h.contains("private fun V3ScamShieldSection(") && h.contains("stringResource(R.string.home_scam_shield_title)"))
        assertTrue("the same header rhythm as Ưu đãi hôm nay: 52dp tile, 21sp title, see-all", h.substring(h.indexOf("private fun V3ScamShieldSection(")).let { it.contains(".size(52.dp)") && it.contains("fontSize = 21.sp") && it.contains("V3SeeAll(") })
        assertTrue("the drawer still lists every tool (DD-002)", h.contains("SmartToolId.Safety -> onOpenScamShield()"))
    }

    @Test
    fun `tapping the section opens the existing Scam Shield route, and Back pops it`() {
        val host = src("app/src/main/java/com/tappyai/app/home/HomeTabHost.kt")
        assertTrue(host.contains("onOpenScamShield = { navController.navigate(ScamShieldRoute.Main) }"))
        assertTrue(host.contains("composable<ScamShieldRoute.Main>"))
        assertTrue(home.contains(".clickable(onClickLabel = label, onClick = onOpenScamShield)"))
        assertTrue(src("app/src/main/java/com/tappyai/app/scamshield/ScamShieldRoute.kt").contains("data object Main"))
    }
}
