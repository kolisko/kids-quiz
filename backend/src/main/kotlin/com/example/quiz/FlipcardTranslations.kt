package com.example.quiz

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.net.URI
import java.net.http.HttpTimeoutException
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

private val translationJson = Json {
    encodeDefaults = false
    ignoreUnknownKeys = true
}

private const val defaultOpenAiTranslationModel = "gpt-4.1-mini"
private const val maxTranslationAttempts = 3
private const val maxConceptsPerTranslationRequest = 32
private const val translationRequestTimeoutSeconds = 120L

class FlipcardTranslationException(message: String) : RuntimeException(message)

@Serializable
private data class TranslationItem(
    val conceptKey: String,
    val displayWord: String,
)

@Serializable
private data class TranslationBatch(
    val translations: List<TranslationItem>,
)

object FlipcardTranslationService {
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(20))
        .build()
    private val backfillReadyCounts = ConcurrentHashMap<LearningLanguage, Int>()

    fun status(language: LearningLanguage): FlipcardTranslationBackfillStatusResponse {
        if (language == LearningLanguage.en) {
            val progress = Database.useConnection { it.readFlipcardTranslationBackfillProgress(language) }
            return FlipcardTranslationBackfillStatusResponse(
                language = language,
                status = SpellingAudioStatus.ready,
                readyCount = progress.totalCount,
                totalCount = progress.totalCount,
                updatedAt = progress.updatedAt,
            )
        }
        val storedProgress = Database.useConnection { it.readFlipcardTranslationBackfillProgress(language) }
        val job = ArtifactGenerationQueue.snapshot(jobKey(language))
        val readyCount = if (job?.status == ArtifactJobStatus.queued || job?.status == ArtifactJobStatus.generating) {
            maxOf(storedProgress.readyCount, backfillReadyCounts[language] ?: 0).coerceAtMost(storedProgress.totalCount)
        } else {
            storedProgress.readyCount
        }
        return FlipcardTranslationBackfillStatusResponse(
            language = language,
            status = when {
                storedProgress.readyCount >= storedProgress.totalCount && storedProgress.totalCount > 0 -> SpellingAudioStatus.ready
                job != null -> job.status.toSpellingAudioStatus()
                else -> SpellingAudioStatus.missing
            },
            readyCount = readyCount,
            totalCount = storedProgress.totalCount,
            error = job?.error,
            updatedAt = storedProgress.updatedAt,
        )
    }

    fun enqueueBackfill(language: LearningLanguage): FlipcardTranslationBackfillStatusResponse {
        if (language == LearningLanguage.en) return status(language)
        val current = status(language)
        if (current.status == SpellingAudioStatus.ready) return current
        ArtifactGenerationQueue.enqueueTranslation(jobKey(language), language)
        return status(language)
    }

    fun enqueueBackfillIfConfigured(language: LearningLanguage) {
        if (language == LearningLanguage.en) return
        if (System.getenv("OPENAI_API_KEY").isNullOrBlank()) return
        val current = status(language)
        if (current.status == SpellingAudioStatus.ready || current.status == SpellingAudioStatus.queued || current.status == SpellingAudioStatus.generating) {
            return
        }
        ArtifactGenerationQueue.enqueueTranslation(jobKey(language), language)
    }

    fun runQueuedBackfill(language: LearningLanguage) {
        if (language == LearningLanguage.en) return
        backfill(language)
    }

    fun autoBackfillEnabled(): Boolean {
        val value = System.getenv("FLIPCARD_TRANSLATION_AUTO_BACKFILL")?.trim()?.lowercase()
        return value == null || value !in setOf("0", "false", "no", "off")
    }

    private fun backfill(language: LearningLanguage) {
        val concepts = Database.useConnection { it.readFlipcardConceptsForTranslation() }
        if (concepts.isEmpty()) return
        backfillReadyCounts[language] = 0
        try {
            val byConceptKey = translateAll(language, concepts)
            val generated = concepts.map { concept ->
                val displayWord = byConceptKey[concept.conceptKey]?.displayWord?.trim()
                if (displayWord.isNullOrBlank()) {
                    throw FlipcardTranslationException("translation_missing:${concept.conceptKey}")
                }
                GeneratedFlipcardTranslation(conceptId = concept.conceptId, displayWord = displayWord)
            }
            Database.useConnection { it.replaceGeneratedFlipcardTranslations(language, generated) }
        } finally {
            backfillReadyCounts.remove(language)
        }
    }

    private fun translateAll(
        language: LearningLanguage,
        concepts: List<FlipcardConceptTranslationSource>,
    ): Map<String, TranslationItem> {
        val translations = linkedMapOf<String, TranslationItem>()
        translateRobust(language, concepts, translations)
        val missing = concepts.firstOrNull { translations[it.conceptKey]?.displayWord.isNullOrBlank() }
        if (missing != null) {
            throw FlipcardTranslationException("translation_missing:${missing.conceptKey}")
        }
        return translations
    }

    private fun translateRobust(
        language: LearningLanguage,
        concepts: List<FlipcardConceptTranslationSource>,
        translations: MutableMap<String, TranslationItem>,
    ) {
        val pending = concepts.filterNot { translations[it.conceptKey]?.displayWord?.isNotBlank() == true }
        if (pending.isEmpty()) return
        if (pending.size > maxConceptsPerTranslationRequest) {
            translateSplit(language, pending, translations)
            return
        }

        var lastError: Throwable? = null
        repeat(maxTranslationAttempts) {
            try {
                val translated = acceptedTranslations(pending, translate(language, pending))
                translated.forEach { (conceptKey, item) ->
                    translations.putIfAbsent(conceptKey, item)
                }
                backfillReadyCounts[language] = translations.size
                val missing = pending.filter { translations[it.conceptKey]?.displayWord.isNullOrBlank() }
                if (missing.isEmpty()) return
                if (missing.size < pending.size) {
                    translateRobust(language, missing, translations)
                    return
                }
                lastError = FlipcardTranslationException("translation_missing:${missing.first().conceptKey}")
                if (pending.size > 1) {
                    translateSplit(language, pending, translations)
                    return
                }
            } catch (error: Throwable) {
                if (!isRecoverableTranslationFailure(error)) throw error
                lastError = error
                if (pending.size > 1) {
                    translateSplit(language, pending, translations)
                    return
                }
            }
        }

        val concept = pending.first()
        throw FlipcardTranslationException(
            "translation_failed_for:${concept.conceptKey}:${lastError?.message ?: "unknown"}",
        )
    }

    private fun translateSplit(
        language: LearningLanguage,
        concepts: List<FlipcardConceptTranslationSource>,
        translations: MutableMap<String, TranslationItem>,
    ) {
        if (concepts.size == 1) {
            translateRobust(language, concepts, translations)
            return
        }
        val midpoint = concepts.size / 2
        val left = concepts.subList(0, midpoint)
        val right = concepts.subList(midpoint, concepts.size)
        translateRobust(language, left, translations)
        translateRobust(language, right, translations)
    }

    private fun acceptedTranslations(
        concepts: List<FlipcardConceptTranslationSource>,
        translations: List<TranslationItem>,
    ): Map<String, TranslationItem> {
        val requestedKeys = concepts.mapTo(mutableSetOf()) { it.conceptKey }
        val accepted = linkedMapOf<String, TranslationItem>()
        translations.forEach { translation ->
            val conceptKey = translation.conceptKey.trim()
            val displayWord = translation.displayWord.trim()
            if (conceptKey in requestedKeys && displayWord.isNotBlank() && conceptKey !in accepted) {
                accepted[conceptKey] = TranslationItem(conceptKey = conceptKey, displayWord = displayWord)
            }
        }
        return accepted
    }

    private fun translate(
        language: LearningLanguage,
        concepts: List<FlipcardConceptTranslationSource>,
    ): List<TranslationItem> {
        val apiKey = System.getenv("OPENAI_API_KEY")?.takeIf { it.isNotBlank() }
            ?: throw FlipcardTranslationException("translation_not_configured")
        val body = translationJson.encodeToString(responsesRequest(language, concepts))
        val request = HttpRequest.newBuilder(URI.create("https://api.openai.com/v1/responses"))
            .timeout(Duration.ofSeconds(translationRequestTimeoutSeconds))
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build()
        val response = try {
            httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        } catch (error: HttpTimeoutException) {
            throw FlipcardTranslationException("translation_timeout")
        }
        if (response.statusCode() !in 200..299) {
            throw FlipcardTranslationException("translation_failed:${response.statusCode()}:${response.body().take(500)}")
        }
        val text = extractOutputText(translationJson.parseToJsonElement(response.body()))
            ?: throw FlipcardTranslationException("translation_failed:missing_output_text")
        return translationJson.decodeFromString<TranslationBatch>(text).translations
    }

    private fun responsesRequest(
        language: LearningLanguage,
        concepts: List<FlipcardConceptTranslationSource>,
    ): JsonObject {
        return buildJsonObject {
            put("model", translationModel())
            put("input", "${systemPrompt(language)}\n\n${userPrompt(concepts)}")
            put(
                "text",
                buildJsonObject {
                    put(
                        "format",
                        buildJsonObject {
                            put("type", "json_schema")
                            put("name", "flipcard_translations")
                            put("strict", true)
                            put("schema", translationSchema())
                        },
                    )
                },
            )
        }
    }

    private fun systemPrompt(language: LearningLanguage): String {
        return when (language) {
            LearningLanguage.de ->
                "Translate children's flashcard English words to German. Return displayWord only. For German nouns include the correct article der, die, or das as a prefix, for example der Apfel. Do not include explanations."
            LearningLanguage.es ->
                "Translate children's flashcard English words to Spanish. Return displayWord only. Do not include articles unless the natural vocabulary item requires one. Do not include explanations."
            LearningLanguage.en -> "Return the original English words."
        }
    }

    private fun userPrompt(concepts: List<FlipcardConceptTranslationSource>): String {
        return concepts.joinToString(
            prefix = "Translate every line below. Return one translation object for every line, exactly ${concepts.size} objects total. Preserve every conceptKey exactly. Do not omit, merge, rename, or add concept keys.\n",
            separator = "\n",
        ) { "${it.conceptKey}: ${it.englishWord}" }
    }

    private fun translationSchema(): JsonObject {
        return buildJsonObject {
            put("type", "object")
            put("additionalProperties", false)
            put(
                "required",
                buildJsonArray {
                    add(JsonPrimitive("translations"))
                },
            )
            put(
                "properties",
                buildJsonObject {
                    put(
                        "translations",
                        buildJsonObject {
                            put("type", "array")
                            put(
                                "items",
                                buildJsonObject {
                                    put("type", "object")
                                    put("additionalProperties", false)
                                    put(
                                        "required",
                                        buildJsonArray {
                                            add(JsonPrimitive("conceptKey"))
                                            add(JsonPrimitive("displayWord"))
                                        },
                                    )
                                    put(
                                        "properties",
                                        buildJsonObject {
                                            put("conceptKey", buildJsonObject { put("type", "string") })
                                            put("displayWord", buildJsonObject { put("type", "string") })
                                        },
                                    )
                                },
                            )
                        },
                    )
                },
            )
        }
    }

    private fun extractOutputText(element: JsonElement): String? {
        if (element is JsonObject) {
            element["output_text"]?.jsonPrimitive?.contentOrNull?.let { return it }
            val type = element["type"]?.jsonPrimitive?.contentOrNull
            if (type == "output_text") {
                element["text"]?.jsonPrimitive?.contentOrNull?.let { return it }
            }
            element.values.forEach { child ->
                extractOutputText(child)?.let { return it }
            }
        }
        if (element is JsonArray) {
            element.forEach { child ->
                extractOutputText(child)?.let { return it }
            }
        }
        return null
    }

    private fun translationModel(): String = System.getenv("OPENAI_TRANSLATION_MODEL")?.takeIf { it.isNotBlank() }
        ?: defaultOpenAiTranslationModel

    private fun jobKey(language: LearningLanguage): String = "flipcard_translation:${language.name}"

    private fun isRecoverableTranslationFailure(error: Throwable): Boolean {
        val message = error.message ?: return true
        return when {
            message == "translation_not_configured" -> false
            message.startsWith("translation_failed:400:") -> false
            message.startsWith("translation_failed:401:") -> false
            message.startsWith("translation_failed:403:") -> false
            else -> true
        }
    }

    private fun ArtifactJobStatus.toSpellingAudioStatus(): SpellingAudioStatus {
        return when (this) {
            ArtifactJobStatus.queued -> SpellingAudioStatus.queued
            ArtifactJobStatus.generating -> SpellingAudioStatus.generating
            ArtifactJobStatus.ready -> SpellingAudioStatus.ready
            ArtifactJobStatus.error -> SpellingAudioStatus.error
        }
    }
}
