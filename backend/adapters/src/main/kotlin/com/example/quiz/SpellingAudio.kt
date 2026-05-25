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
    "Pronounce this as a single German word in standard German phonology. Say only the word. Do not use English pronunciation, even if the spelling is identical or similar to English."
private const val defaultGermanSpellingTtsInstructions =
    "Spell this German word clearly one letter at a time using German letter names. Say only the letters in German. Do not pronounce the full word."
private const val defaultSpanishTtsInstructions =
    "Pronounce this as a single Spanish word in neutral Spanish phonology. Say only the word. Do not use English pronunciation, even if the spelling is identical or similar to English, for example tractor, hotel, radio, animal."
private const val defaultSpanishSpellingTtsInstructions =
    "Spell this Spanish word clearly one letter at a time using Spanish letter names. Say only the letters in Spanish. Do not pronounce the full word."
private const val previousGermanTtsInstructions =
    "Pronounce this single German word clearly in standard German. Say only the word."
private const val previousGermanSpellingTtsInstructions =
    "Spell this German word clearly one letter at a time using German letter names. Say only the letters."
private const val previousSpanishTtsInstructions =
    "Pronounce this single Spanish word clearly in neutral Spanish. Say only the word."
private const val previousSpanishSpellingTtsInstructions =
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
                job?.status == ArtifactJobStatus.ready -> SpellingAudioStatus.missing
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
        jobKind: ArtifactJobKind = when (kind) {
            SpellingAudioKind.word -> ArtifactJobKind.spelling_audio_word
            SpellingAudioKind.spelling -> ArtifactJobKind.spelling_audio_spelling
        },
        force: Boolean = false,
    ): SpellingAudioWordResponse? {
        val word = spellingAudioWord(rawWord) ?: return null
        val outputPath = audioPath(word, kind, language)
        if (!force && Files.isRegularFile(outputPath)) {
            ArtifactGenerationQueue.markReady(audioJobKey(word, kind, language))
            return SpellingAudioWordResponse(
                word = word.text,
                normalized = word.normalized,
                status = SpellingAudioStatus.ready,
                kind = kind,
                audioUrl = audioUrl(word, kind, language),
            )
        }
        val job = ArtifactGenerationQueue.enqueueAudio(
            key = audioJobKey(word, kind, language),
            word = word.text,
            language = language,
            kind = kind,
            jobKind = jobKind,
            force = force,
        )
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

    fun runQueuedGeneration(
        rawWord: String,
        kind: SpellingAudioKind,
        language: LearningLanguage = LearningLanguage.en,
        force: Boolean = false,
    ) {
        val word = spellingAudioWord(rawWord) ?: throw SpellingAudioException("invalid_word")
        val outputPath = audioPath(word, kind, language)
        if (force || !Files.isRegularFile(outputPath)) {
            generateToFile(word, kind, language, outputPath)
        }
    }

    fun migrateLegacyEnglishCache(rawWords: List<String>) {
        val words = rawWords
            .mapNotNull(::spellingAudioWord)
        if (words.isEmpty()) return
        val audioDir = runtimeDataPath("audio", "spelling")
        if (!Files.isDirectory(audioDir)) return
        Files.createDirectories(audioDir)
        val legacyPathsToDelete = mutableSetOf<Path>()
        words.forEach { word ->
            SpellingAudioKind.entries.forEach { kind ->
                val legacyPath = legacyAudioPath(word, kind)
                val newPath = audioPath(word, kind, LearningLanguage.en)
                if (Files.isRegularFile(legacyPath) && !Files.exists(newPath)) {
                    Files.copy(legacyPath, newPath, StandardCopyOption.REPLACE_EXISTING)
                }
                if (Files.isRegularFile(legacyPath)) {
                    legacyPathsToDelete.add(legacyPath)
                }
            }
        }
        legacyPathsToDelete.forEach { path ->
            if (Files.isRegularFile(path)) Files.delete(path)
        }
    }

    fun migrateInstructionlessCacheKeys(wordsByLanguage: Map<LearningLanguage, List<String>>) {
        wordsByLanguage.forEach { (language, rawWords) ->
            rawWords
                .mapNotNull(::spellingAudioWord)
                .forEach { word ->
                    SpellingAudioKind.entries.forEach { kind ->
                        val targetPath = audioPath(word, kind, language)
                        if (Files.isRegularFile(targetPath)) return@forEach
                        val sourcePath = legacyInstructionAudioPaths(word, kind, language)
                            .firstOrNull { Files.isRegularFile(it) }
                            ?: return@forEach
                        Files.createDirectories(targetPath.parent)
                        Files.copy(sourcePath, targetPath, StandardCopyOption.REPLACE_EXISTING)
                    }
                }
        }
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
                input = ttsInput(word, kind, language),
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

    private fun legacyAudioPath(word: SpellingWord, kind: SpellingAudioKind): Path {
        return runtimeDataPath("audio", "spelling").resolve("${legacyAudioCacheKey(word, kind)}.mp3")
    }

    private fun audioCacheKey(word: SpellingWord, kind: SpellingAudioKind, language: LearningLanguage): String {
        return sha256Hex(
            listOf(
                language.name,
                kind.name,
                word.normalized,
                ttsModel(),
                ttsVoice(),
                ttsInput(word, kind, language),
            )
                .joinToString("\u001f"),
        )
    }

    private fun legacyInstructionAudioPaths(word: SpellingWord, kind: SpellingAudioKind, language: LearningLanguage): List<Path> {
        val paths = instructionMigrationCandidates(kind, language)
            .map { instructions ->
                runtimeDataPath("audio", "spelling").resolve("${legacyInstructionAudioCacheKey(word, kind, language, instructions)}.mp3")
            }
            .toMutableList()
        if (language == LearningLanguage.en) {
            paths.add(legacyAudioPath(word, kind))
        }
        return paths.distinct()
    }

    private fun legacyInstructionAudioCacheKey(
        word: SpellingWord,
        kind: SpellingAudioKind,
        language: LearningLanguage,
        instructions: String,
    ): String {
        return sha256Hex(
            listOf(
                language.name,
                kind.name,
                word.normalized,
                ttsModel(),
                ttsVoice(),
                instructions,
                ttsInput(word, kind, language),
            )
                .joinToString("\u001f"),
        )
    }

    private fun legacyAudioCacheKey(word: SpellingWord, kind: SpellingAudioKind): String {
        return sha256Hex(listOf(kind.name, word.normalized, ttsModel(), ttsVoice(), ttsInstructions(kind, LearningLanguage.en)).joinToString("\u001f"))
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

    private fun instructionMigrationCandidates(kind: SpellingAudioKind, language: LearningLanguage): List<String> {
        val current = ttsInstructions(kind, language)
        val previousDefault = when (language) {
            LearningLanguage.en -> null
            LearningLanguage.de -> when (kind) {
                SpellingAudioKind.word -> previousGermanTtsInstructions
                SpellingAudioKind.spelling -> previousGermanSpellingTtsInstructions
            }
            LearningLanguage.es -> when (kind) {
                SpellingAudioKind.word -> previousSpanishTtsInstructions
                SpellingAudioKind.spelling -> previousSpanishSpellingTtsInstructions
            }
        }
        return listOfNotNull(current, previousDefault).distinct()
    }

    private fun ttsInput(word: SpellingWord, kind: SpellingAudioKind, language: LearningLanguage): String {
        return when (kind) {
            SpellingAudioKind.word -> word.text
            SpellingAudioKind.spelling -> spellingSpeechWords(word.text, language)
        }
    }

    private fun spellingSpeechWords(word: String, language: LearningLanguage): String {
        return word.trim()
            .split(Regex("\\s+"))
            .map { token ->
                token
                    .filter { it.isLetterOrDigit() }
                    .map { spellingSpeechName(it, language) }
                    .joinToString(", ")
            }
            .filter { it.isNotBlank() }
            .joinToString(". ")
    }

    private fun spellingSpeechName(character: Char, language: LearningLanguage): String {
        val letter = character.lowercaseChar()
        return when (language) {
            LearningLanguage.en -> letter.uppercaseChar().toString()
            LearningLanguage.de -> when (letter) {
                'a' -> "A"
                'b' -> "Be"
                'c' -> "Ce"
                'd' -> "De"
                'e' -> "E"
                'f' -> "Ef"
                'g' -> "Ge"
                'h' -> "Ha"
                'i' -> "I"
                'j' -> "Jot"
                'k' -> "Ka"
                'l' -> "El"
                'm' -> "Em"
                'n' -> "En"
                'o' -> "O"
                'p' -> "Pe"
                'q' -> "Ku"
                'r' -> "Er"
                's' -> "Es"
                't' -> "Te"
                'u' -> "U"
                'v' -> "Fau"
                'w' -> "We"
                'x' -> "Ix"
                'y' -> "Ypsilon"
                'z' -> "Zett"
                'ä' -> "A Umlaut"
                'ö' -> "O Umlaut"
                'ü' -> "U Umlaut"
                'ß' -> "Eszett"
                else -> character.toString()
            }
            LearningLanguage.es -> when (letter) {
                'a' -> "a"
                'b' -> "be"
                'c' -> "ce"
                'd' -> "de"
                'e' -> "e"
                'f' -> "efe"
                'g' -> "ge"
                'h' -> "hache"
                'i' -> "i"
                'j' -> "jota"
                'k' -> "ka"
                'l' -> "ele"
                'm' -> "eme"
                'n' -> "ene"
                'ñ' -> "eñe"
                'o' -> "o"
                'p' -> "pe"
                'q' -> "cu"
                'r' -> "erre"
                's' -> "ese"
                't' -> "te"
                'u' -> "u"
                'v' -> "uve"
                'w' -> "uve doble"
                'x' -> "equis"
                'y' -> "ye"
                'z' -> "zeta"
                else -> character.toString()
            }
        }
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
            ArtifactJobStatus.ready -> SpellingAudioStatus.ready
            ArtifactJobStatus.error -> SpellingAudioStatus.error
        }
    }
}
