package com.example.quiz

import kotlinx.serialization.encodeToString
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
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
    private val lock = Any()
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(20))
        .build()

    fun status(setId: Long): SpellingAudioStatusResponse {
        val words = SpellingStore.readWordsForAudio(setId)
        return SpellingAudioStatusResponse(
            setId = setId,
            words = words.map { word ->
                val wordReady = Files.isRegularFile(audioPath(word, SpellingAudioKind.word))
                val spellingReady = Files.isRegularFile(audioPath(word, SpellingAudioKind.spelling))
                SpellingAudioWordStatus(
                    wordId = word.id,
                    word = word.text,
                    normalized = word.normalized,
                    status = if (wordReady) SpellingAudioStatus.ready else SpellingAudioStatus.missing,
                    audioUrl = if (wordReady) audioUrl(word, SpellingAudioKind.word) else null,
                    spellingStatus = if (spellingReady) SpellingAudioStatus.ready else SpellingAudioStatus.missing,
                    spellingAudioUrl = if (spellingReady) audioUrl(word, SpellingAudioKind.spelling) else null,
                )
            },
        )
    }

    fun generate(wordId: Long, kind: SpellingAudioKind): SpellingAudioWordResponse? {
        val word = SpellingStore.readWordForAudio(wordId) ?: return null
        synchronized(lock) {
            val outputPath = audioPath(word, kind)
            if (!Files.isRegularFile(outputPath)) {
                generateToFile(word, kind, outputPath)
            }
        }
        return SpellingAudioWordResponse(
            wordId = word.id,
            word = word.text,
            normalized = word.normalized,
            status = SpellingAudioStatus.ready,
            kind = kind,
            audioUrl = audioUrl(word, kind),
        )
    }

    fun audioFile(wordId: Long, kind: SpellingAudioKind): Path? {
        val word = SpellingStore.readWordForAudio(wordId) ?: return null
        val path = audioPath(word, kind)
        return path.takeIf { Files.isRegularFile(it) }
    }

    private fun generateToFile(word: SpellingWord, kind: SpellingAudioKind, outputPath: Path) {
        val apiKey = System.getenv("OPENAI_API_KEY")?.takeIf { it.isNotBlank() }
            ?: throw SpellingAudioException("tts_not_configured")
        Files.createDirectories(outputPath.parent)
        val tempPath = outputPath.resolveSibling("${outputPath.fileName}.tmp")
        val body = ttsJson.encodeToString(
            OpenAiTtsRequest(
                model = ttsModel(),
                voice = ttsVoice(),
                input = ttsInput(word, kind),
                instructions = ttsInstructions(kind),
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

    private fun audioPath(word: SpellingWord, kind: SpellingAudioKind): Path {
        return runtimeDataPath("audio", "spelling").resolve("${audioCacheKey(word, kind)}.mp3")
    }

    private fun audioCacheKey(word: SpellingWord, kind: SpellingAudioKind): String {
        return sha256Hex(listOf(kind.name, word.normalized, ttsModel(), ttsVoice(), ttsInstructions(kind)).joinToString("\u001f"))
    }

    private fun audioUrl(word: SpellingWord, kind: SpellingAudioKind): String {
        return "/api/spelling/audio/words/${word.id}.mp3?kind=${kind.name}&v=${audioCacheKey(word, kind)}"
    }

    private fun ttsModel(): String = System.getenv("OPENAI_TTS_MODEL")?.takeIf { it.isNotBlank() }
        ?: defaultOpenAiTtsModel

    private fun ttsVoice(): String = System.getenv("OPENAI_TTS_VOICE")?.takeIf { it.isNotBlank() }
        ?: defaultOpenAiTtsVoice

    private fun ttsInstructions(kind: SpellingAudioKind): String {
        return when (kind) {
            SpellingAudioKind.word -> System.getenv("OPENAI_TTS_INSTRUCTIONS")?.takeIf { it.isNotBlank() }
                ?: defaultOpenAiTtsInstructions
            SpellingAudioKind.spelling -> System.getenv("OPENAI_SPELLING_TTS_INSTRUCTIONS")?.takeIf { it.isNotBlank() }
                ?: defaultOpenAiSpellingTtsInstructions
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

    private fun sha256Hex(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }
}
