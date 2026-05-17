package com.example.quiz

import kotlinx.serialization.encodeToString
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.time.Duration

private val ttsJson = Json {
    encodeDefaults = false
}

private const val defaultOpenAiTtsModel = "gpt-4o-mini-tts"
private const val defaultOpenAiTtsVoice = "marin"
private const val defaultOpenAiTtsInstructions =
    "Pronounce this single English spelling word clearly in American English. Say only the word."
private const val defaultOpenAiSpellingTtsInstructions =
    "Spell this English word clearly one letter at a time. Say only the letters."
private const val defaultGermanTtsInstructions =
    "Pronounce this single German word clearly in standard German. Say only the word."
private const val defaultGermanSpellingTtsInstructions =
    "Spell this German word clearly one letter at a time using German letter names. Say only the letters."
private const val defaultSpanishTtsInstructions =
    "Pronounce this single Spanish word clearly in neutral Spanish. Say only the word."
private const val defaultSpanishSpellingTtsInstructions =
    "Spell this Spanish word clearly one letter at a time using Spanish letter names. Say only the letters."

@Serializable
private data class OpenAiTtsRequest(
    val model: String,
    val voice: String,
    val input: String,
    val instructions: String,
    val response_format: String = "mp3",
)

class SpellingAudioException(message: String) : RuntimeException(message)

object SpellingAudioService {
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(20))
        .build()

    fun status(
        rawWord: String,
        kind: SpellingAudioKind,
        language: LearningLanguage = LearningLanguage.en,
    ): SpellingAudioWordResponse? {
        val word = spellingAudioWord(rawWord) ?: return null
        val ready = Files.isRegularFile(audioPath(word, kind, language))
        val job = ArtifactGenerationQueue.snapshot(audioJobKey(word, kind, language))
        return SpellingAudioWordResponse(
            word = word.text,
            normalized = word.normalized,
            status = when {
                ready -> SpellingAudioStatus.ready
                job != null -> job.status.toSpellingAudioStatus()
                else -> SpellingAudioStatus.missing
            },
            kind = kind,
            audioUrl = if (ready) audioUrl(word, kind, language) else null,
            error = if (ready) null else job?.error,
        )
    }

    fun enqueueGeneration(
        rawWord: String,
        kind: SpellingAudioKind,
        language: LearningLanguage = LearningLanguage.en,
    ): SpellingAudioWordResponse? {
        val word = spellingAudioWord(rawWord) ?: return null
        val outputPath = audioPath(word, kind, language)
        if (Files.isRegularFile(outputPath)) {
            ArtifactGenerationQueue.clear(audioJobKey(word, kind, language))
            return SpellingAudioWordResponse(
                word = word.text,
                normalized = word.normalized,
                status = SpellingAudioStatus.ready,
                kind = kind,
                audioUrl = audioUrl(word, kind, language),
            )
        }
        val job = ArtifactGenerationQueue.enqueue(audioJobKey(word, kind, language), ArtifactJobPool.audio) {
            if (!Files.isRegularFile(outputPath)) {
                generateToFile(word, kind, language, outputPath)
            }
        }
        return SpellingAudioWordResponse(
            word = word.text,
            normalized = word.normalized,
            status = job.status.toSpellingAudioStatus(),
            kind = kind,
            audioUrl = null,
            error = job.error,
        )
    }

    fun audioFile(
        rawWord: String,
        kind: SpellingAudioKind,
        language: LearningLanguage = LearningLanguage.en,
    ): Path? {
        val word = spellingAudioWord(rawWord) ?: return null
        val path = audioPath(word, kind, language)
        return path.takeIf { Files.isRegularFile(it) }
    }

    private fun generateToFile(
        word: SpellingWord,
        kind: SpellingAudioKind,
        language: LearningLanguage,
        outputPath: Path,
    ) {
        val apiKey = System.getenv("OPENAI_API_KEY")?.takeIf { it.isNotBlank() }
            ?: throw SpellingAudioException("tts_not_configured")
        Files.createDirectories(outputPath.parent)
        val tempPath = outputPath.resolveSibling("${outputPath.fileName}.tmp")
        val body = ttsJson.encodeToString(
            OpenAiTtsRequest(
                model = ttsModel(),
                voice = ttsVoice(),
                input = ttsInput(word, kind),
                instructions = ttsInstructions(kind, language),
            ),
        )
        val request = HttpRequest.newBuilder(URI.create("https://api.openai.com/v1/audio/speech"))
            .timeout(Duration.ofSeconds(60))
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray())
        if (response.statusCode() !in 200..299) {
            val errorBody = response.body().decodeToString().take(500)
            throw SpellingAudioException("tts_generation_failed:${response.statusCode()}:$errorBody")
        }
        Files.write(tempPath, response.body())
        Files.move(tempPath, outputPath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
    }

    private fun audioPath(word: SpellingWord, kind: SpellingAudioKind, language: LearningLanguage): Path {
        return runtimeDataPath("audio", "spelling").resolve("${audioCacheKey(word, kind, language)}.mp3")
    }

    private fun audioCacheKey(word: SpellingWord, kind: SpellingAudioKind, language: LearningLanguage): String {
        return sha256Hex(
            listOf(language.name, kind.name, word.normalized, ttsModel(), ttsVoice(), ttsInstructions(kind, language))
                .joinToString("\u001f"),
        )
    }

    private fun audioJobKey(word: SpellingWord, kind: SpellingAudioKind, language: LearningLanguage): String {
        return "spelling_audio:${audioCacheKey(word, kind, language)}"
    }

    private fun audioUrl(word: SpellingWord, kind: SpellingAudioKind, language: LearningLanguage): String {
        return "/api/spelling/audio/words/${urlEncodePathSegment(word.text)}.mp3?language=${language.name}&kind=${kind.name}&v=${audioCacheKey(word, kind, language)}"
    }

    private fun ttsModel(): String = System.getenv("OPENAI_TTS_MODEL")?.takeIf { it.isNotBlank() }
        ?: defaultOpenAiTtsModel

    private fun ttsVoice(): String = System.getenv("OPENAI_TTS_VOICE")?.takeIf { it.isNotBlank() }
        ?: defaultOpenAiTtsVoice

    private fun ttsInstructions(kind: SpellingAudioKind, language: LearningLanguage): String {
        return when (language) {
            LearningLanguage.en -> when (kind) {
                SpellingAudioKind.word -> System.getenv("OPENAI_TTS_INSTRUCTIONS")?.takeIf { it.isNotBlank() }
                    ?: defaultOpenAiTtsInstructions
                SpellingAudioKind.spelling -> System.getenv("OPENAI_SPELLING_TTS_INSTRUCTIONS")?.takeIf { it.isNotBlank() }
                    ?: defaultOpenAiSpellingTtsInstructions
            }
            LearningLanguage.de -> when (kind) {
                SpellingAudioKind.word -> System.getenv("OPENAI_DE_TTS_INSTRUCTIONS")?.takeIf { it.isNotBlank() }
                    ?: defaultGermanTtsInstructions
                SpellingAudioKind.spelling -> System.getenv("OPENAI_DE_SPELLING_TTS_INSTRUCTIONS")?.takeIf { it.isNotBlank() }
                    ?: defaultGermanSpellingTtsInstructions
            }
            LearningLanguage.es -> when (kind) {
                SpellingAudioKind.word -> System.getenv("OPENAI_ES_TTS_INSTRUCTIONS")?.takeIf { it.isNotBlank() }
                    ?: defaultSpanishTtsInstructions
                SpellingAudioKind.spelling -> System.getenv("OPENAI_ES_SPELLING_TTS_INSTRUCTIONS")?.takeIf { it.isNotBlank() }
                    ?: defaultSpanishSpellingTtsInstructions
            }
        }
    }

    private fun ttsInput(word: SpellingWord, kind: SpellingAudioKind): String {
        return when (kind) {
            SpellingAudioKind.word -> word.text
            SpellingAudioKind.spelling -> spellingLetters(word.text).joinToString(", ")
        }
    }

    private fun spellingLetters(word: String): List<String> {
        return word.trim()
            .filter { it.isLetterOrDigit() }
            .map { it.uppercaseChar().toString() }
    }

    private fun spellingAudioWord(rawWord: String): SpellingWord? {
        val text = rawWord.trim()
        if (text.isBlank()) return null
        return SpellingWord(
            id = 0,
            text = text,
            normalized = text.lowercase(),
        )
    }

    private fun urlEncodePathSegment(value: String): String {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20")
    }

    private fun sha256Hex(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun ArtifactJobStatus.toSpellingAudioStatus(): SpellingAudioStatus {
        return when (this) {
            ArtifactJobStatus.queued -> SpellingAudioStatus.queued
            ArtifactJobStatus.generating -> SpellingAudioStatus.generating
            ArtifactJobStatus.error -> SpellingAudioStatus.error
        }
    }
}
