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
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

private val translationJson = Json {
    encodeDefaults = false
    ignoreUnknownKeys = true
}

private const val defaultOpenAiTranslationModel = "gpt-4.1-mini"

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

    fun status(language: LearningLanguage): FlipcardTranslationBackfillStatusResponse {
        if (language == LearningLanguage.en) {
            val (_, total) = Database.useConnection { it.readFlipcardTranslationBackfillProgress(language) }
            return FlipcardTranslationBackfillStatusResponse(
                language = language,
                status = SpellingAudioStatus.ready,
                readyCount = total,
                totalCount = total,
            )
        }
        val (readyCount, totalCount) = Database.useConnection { it.readFlipcardTranslationBackfillProgress(language) }
        val job = ArtifactGenerationQueue.snapshot(jobKey(language))
        return FlipcardTranslationBackfillStatusResponse(
            language = language,
            status = when {
                readyCount >= totalCount && totalCount > 0 -> SpellingAudioStatus.ready
                job != null -> job.status.toSpellingAudioStatus()
                else -> SpellingAudioStatus.missing
            },
            readyCount = readyCount,
            totalCount = totalCount,
            error = job?.error,
        )
    }

    fun enqueueBackfill(language: LearningLanguage): FlipcardTranslationBackfillStatusResponse {
        if (language == LearningLanguage.en) return status(language)
        val current = status(language)
        if (current.status == SpellingAudioStatus.ready) return current
        ArtifactGenerationQueue.enqueue(jobKey(language), ArtifactJobPool.translation) {
            backfill(language)
        }
        return status(language)
    }

    fun enqueueBackfillIfConfigured(language: LearningLanguage) {
        if (language == LearningLanguage.en) return
        if (System.getenv("OPENAI_API_KEY").isNullOrBlank()) return
        val current = status(language)
        if (current.status == SpellingAudioStatus.ready || current.status == SpellingAudioStatus.queued || current.status == SpellingAudioStatus.generating) {
            return
        }
        ArtifactGenerationQueue.enqueue(jobKey(language), ArtifactJobPool.translation) {
            backfill(language)
        }
    }

    private fun backfill(language: LearningLanguage) {
        val concepts = Database.useConnection { it.readFlipcardConceptsForTranslation() }
        if (concepts.isEmpty()) return
        val translations = translate(language, concepts)
        val byConceptKey = translations.associateBy { it.conceptKey }
        val generated = concepts.map { concept ->
            val displayWord = byConceptKey[concept.conceptKey]?.displayWord?.trim()
            if (displayWord.isNullOrBlank()) {
                throw FlipcardTranslationException("translation_missing:${concept.conceptKey}")
            }
            GeneratedFlipcardTranslation(conceptId = concept.conceptId, displayWord = displayWord)
        }
        Database.useConnection { it.replaceGeneratedFlipcardTranslations(language, generated) }
    }

    private fun translate(
        language: LearningLanguage,
        concepts: List<FlipcardConceptTranslationSource>,
    ): List<TranslationItem> {
        val apiKey = System.getenv("OPENAI_API_KEY")?.takeIf { it.isNotBlank() }
            ?: throw FlipcardTranslationException("translation_not_configured")
        val body = translationJson.encodeToString(responsesRequest(language, concepts))
        val request = HttpRequest.newBuilder(URI.create("https://api.openai.com/v1/responses"))
            .timeout(Duration.ofSeconds(90))
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
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
            prefix = "Translate these concept keys and English words. Preserve conceptKey exactly.\n",
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

    private fun ArtifactJobStatus.toSpellingAudioStatus(): SpellingAudioStatus {
        return when (this) {
            ArtifactJobStatus.queued -> SpellingAudioStatus.queued
            ArtifactJobStatus.generating -> SpellingAudioStatus.generating
            ArtifactJobStatus.error -> SpellingAudioStatus.error
        }
    }
}
