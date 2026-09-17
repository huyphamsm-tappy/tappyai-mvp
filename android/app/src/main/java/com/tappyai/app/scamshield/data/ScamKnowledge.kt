package com.tappyai.app.scamshield.data

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Scam Shield · official anti-fraud knowledge — the web's `lib/scam-shield/knowledge`
 * (`bocongan2026.ts`, `types.ts`, `index.ts`) on Android, 2026-09-17.
 *
 * 🚨 THE ONE RULE THIS MODULE EXISTS FOR. A record has TWO halves and they must never be confused:
 *  - `official` — text carried over from the official source as published (Bộ Công an, "Nâng cao
 *    cảnh giác trước 25 kịch bản lừa đảo trên không gian mạng năm 2026"). Never rewritten.
 *  - `guidance` — what TappyAI adds for the reader, labelled as TappyAI's, never a quotation.
 *
 * THE CONTENT SOURCE IS THE WEB'S DATASET, NOT AN ANDROID-ONLY ONE. `assets/scam_knowledge/
 * bocongan2026.json` is generated from the web module (`_provenance` names the branch, commit and
 * module); nothing here fetches, calls a model or touches a quota — the dataset is read once from
 * the bundle, filtered in memory and rendered. The same record ids (`bca-2026-NN`), the same five
 * official groups, the same 25 scenarios in official-number order.
 */
@Serializable
data class KnowledgeSource(
    val organization: String = "",
    val title: String = "",
    val url: String = "",
    val mediaUrl: String? = null,
    val publishedAt: String? = null,
    val updatedAt: String? = null,
    val verifiedAt: String = "",
)

@Serializable
data class OfficialGroup(
    val category: String = "",
    val officialNumber: Int = 0,
    val label: String = "",
    val description: String = "",
)

@Serializable
data class OfficialText(val title: String = "", val summary: String = "")

@Serializable
data class ScenarioGuidance(
    val warningSigns: List<String> = emptyList(),
    val commonRequests: List<String> = emptyList(),
    val whatToDo: List<String> = emptyList(),
    val whatNotToDo: List<String> = emptyList(),
)

@Serializable
data class ScamScenario(
    val id: String = "",
    val officialNumber: Int = 0,
    val category: String = "",
    /** TappyAI's mapping onto the message-analysis taxonomy (`AttackGoal`). */
    val attackerGoal: String = "",
    val official: OfficialText = OfficialText(),
    val guidance: ScenarioGuidance = ScenarioGuidance(),
    val source: KnowledgeSource = KnowledgeSource(),
    val verified: Boolean = false,
    val language: String = "vi",
)

@Serializable
data class OfficialAdvice(
    val attackerGoals: List<String> = emptyList(),
    val preventionMeasures: List<String> = emptyList(),
    val reportAdvice: String = "",
    val hotline: String = "",
)

@Serializable
data class KnowledgeDataset(
    val version: String = "",
    val source: KnowledgeSource = KnowledgeSource(),
    val groups: List<OfficialGroup> = emptyList(),
    val scenarios: List<ScamScenario> = emptyList(),
    val official: OfficialAdvice = OfficialAdvice(),
)

@Serializable
data class KnowledgeProvenance(val branch: String = "", val commit: String = "", val module: String = "", val generatedAt: String = "")

@Serializable
data class KnowledgeBundle(
    @kotlinx.serialization.SerialName("_provenance") val provenance: KnowledgeProvenance = KnowledgeProvenance(),
    /** The official grouping, in the web's order (`KNOWLEDGE_CATEGORIES`). */
    val categories: List<String> = emptyList(),
    val dataset: KnowledgeDataset = KnowledgeDataset(),
)

/** `OFFICIAL_SOURCE_HOSTS` — the authority's own domains; the dataset test refuses anything else. */
val OFFICIAL_SOURCE_HOSTS = listOf("bocongan.gov.vn", "mps.gov.vn", "ncsc.gov.vn", "khonggianmang.vn", "tinnhiemmang.vn", "chinhphu.vn")

fun isOfficialSourceUrl(url: String): Boolean = runCatching {
    val u = java.net.URI(url)
    u.scheme == "https" && OFFICIAL_SOURCE_HOSTS.any { h -> u.host == h || u.host.endsWith(".$h") }
}.getOrDefault(false)

/** The public surface — static and synchronous once loaded, like the web's `index.ts`. */
@Singleton
class ScamKnowledgeRepository @Inject constructor(@ApplicationContext private val context: Context, private val json: Json) {

    private val bundle: KnowledgeBundle by lazy {
        runCatching {
            context.assets.open(ASSET).bufferedReader(Charsets.UTF_8).use { json.decodeFromString<KnowledgeBundle>(it.readText()) }
        }.getOrElse { KnowledgeBundle() }
    }

    val categories: List<String> get() = bundle.categories
    val dataset: KnowledgeDataset get() = bundle.dataset
    val provenance: KnowledgeProvenance get() = bundle.provenance

    /** Every scenario, in official-number order. */
    fun allScenarios(): List<ScamScenario> = bundle.dataset.scenarios.sortedBy { it.officialNumber }

    fun scenariosIn(category: String?): List<ScamScenario> =
        if (category == null) allScenarios() else allScenarios().filter { it.category == category }

    fun groupOf(scenario: ScamScenario): OfficialGroup? = bundle.dataset.groups.firstOrNull { it.category == scenario.category }

    companion object {
        const val ASSET = "scam_knowledge/bocongan2026.json"
    }
}
