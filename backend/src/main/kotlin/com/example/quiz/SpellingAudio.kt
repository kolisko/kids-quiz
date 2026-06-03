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
private val openAiTtsVoices = listOf(
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "fable",
    "nova",
    "onyx",
    "sage",
    "shimmer",
    "verse",
    "marin",
    "cedar",
)
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
private const val defaultCzechTtsInstructions =
    "Mluv česky jako rodilý mluvčí. Vyslov vstup přirozeně česky, s českým přízvukem, českými samohláskami a přízvukem na první slabice. Řekni pouze dané české slovo nebo krátkou frázi. Nepoužívej anglickou výslovnost ani anglický přízvuk."
private const val defaultCzechSpellingTtsInstructions =
    "Spell this Czech word clearly one letter at a time using Czech letter names. Say only the letters in Czech. Do not pronounce the full word."
private const val previousGermanTtsInstructions =
    "Pronounce this single German word clearly in standard German. Say only the word."
private const val previousGermanSpellingTtsInstructions =
    "Spell this German word clearly one letter at a time using German letter names. Say only the letters."
private const val previousSpanishTtsInstructions =
    "Pronounce this single Spanish word clearly in neutral Spanish. Say only the word."
private const val previousSpanishSpellingTtsInstructions =
    "Spell this Spanish word clearly one letter at a time using Spanish letter names. Say only the letters."

fun audioTtsVoiceOptions(): List<String> = openAiTtsVoices

fun defaultAudioTtsSettings(language: LearningLanguage): AudioTtsSettingsResponse {
    return AudioTtsSettingsResponse(
        language = language,
        voice = defaultAudioTtsVoice(language),
        instructions = defaultAudioTtsInstructions(language),
        testWord = "test",
        voices = audioTtsVoiceOptions(),
    )
}

fun sanitizedAudioTtsSettings(
    language: LearningLanguage,
    voice: String,
    instructions: String,
    testWord: String,
): AudioTtsSettingsResponse {
    val normalizedVoice = voice.trim().lowercase()
    require(normalizedVoice in openAiTtsVoices) { "invalid_tts_voice" }
    val normalizedInstructions = instructions.trim()
    require(normalizedInstructions.isNotBlank()) { "invalid_tts_instructions" }
    val normalizedTestWord = testWord.trim().ifBlank { "test" }
    require(normalizedTestWord.length <= 120) { "invalid_tts_test_word" }
    return AudioTtsSettingsResponse(
        language = language,
        voice = normalizedVoice,
        instructions = normalizedInstructions,
        testWord = normalizedTestWord,
        voices = audioTtsVoiceOptions(),
    )
}

private fun defaultAudioTtsVoice(language: LearningLanguage): String {
    val languageSpecificEnv = "OPENAI_${language.name.uppercase()}_TTS_VOICE"
    val configured = System.getenv(languageSpecificEnv)?.takeIf { it.isNotBlank() }
        ?: System.getenv("OPENAI_TTS_VOICE")?.takeIf { it.isNotBlank() }
    return configured?.trim()?.lowercase()?.takeIf { it in openAiTtsVoices }
        ?: defaultOpenAiTtsVoice
}

private fun defaultAudioTtsInstructions(language: LearningLanguage): String {
    return when (language) {
        LearningLanguage.en -> System.getenv("OPENAI_TTS_INSTRUCTIONS")?.takeIf { it.isNotBlank() }
            ?: defaultOpenAiTtsInstructions
        LearningLanguage.de -> System.getenv("OPENAI_DE_TTS_INSTRUCTIONS")?.takeIf { it.isNotBlank() }
            ?: defaultGermanTtsInstructions
        LearningLanguage.es -> System.getenv("OPENAI_ES_TTS_INSTRUCTIONS")?.takeIf { it.isNotBlank() }
            ?: defaultSpanishTtsInstructions
        LearningLanguage.cs -> System.getenv("OPENAI_CS_TTS_INSTRUCTIONS")?.takeIf { it.isNotBlank() }
            ?: defaultCzechTtsInstructions
    }
}

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
        useFlipcardSettings: Boolean = false,
    ): SpellingAudioWordResponse? {
        val word = spellingAudioWord(rawWord) ?: return null
        val ready = Files.isRegularFile(audioPath(word, kind, language, useFlipcardSettings))
        val job = ArtifactGenerationQueue.snapshot(audioJobKey(word, kind, language, useFlipcardSettings))
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
            audioUrl = if (ready) audioUrl(word, kind, language, useFlipcardSettings) else null,
            error = if (ready) null else job?.error,
        )
    }

    fun setStatuses(sets: List<SpellingSet>): SpellingAudioSetStatusResponse {
        return SpellingAudioSetStatusResponse(items = sets.map(::setStatus))
    }

    fun setStatus(set: SpellingSet): SpellingAudioSetStatus {
        val uniqueWords = set.words
            .filter { it.text.isNotBlank() }
            .distinctBy { it.normalized }
        val itemStatuses = uniqueWords.flatMap { word ->
            SpellingAudioKind.entries.mapNotNull { kind -> status(word.text, kind, set.language) }
        }
        val requiredAudioCount = uniqueWords.size * SpellingAudioKind.entries.size
        val readyAudioCount = itemStatuses.count { it.status == SpellingAudioStatus.ready }
        val queuedAudioCount = itemStatuses.count { it.status == SpellingAudioStatus.queued }
        val generatingAudioCount = itemStatuses.count { it.status == SpellingAudioStatus.generating }
        val errorAudioCount = itemStatuses.count { it.status == SpellingAudioStatus.error }
        val missingAudioCount = itemStatuses.count { it.status == SpellingAudioStatus.missing } +
            (requiredAudioCount - itemStatuses.size).coerceAtLeast(0)
        val status = when {
            requiredAudioCount == 0 -> SpellingAudioStatus.missing
            errorAudioCount > 0 -> SpellingAudioStatus.error
            generatingAudioCount > 0 -> SpellingAudioStatus.generating
            queuedAudioCount > 0 -> SpellingAudioStatus.queued
            readyAudioCount == requiredAudioCount -> SpellingAudioStatus.ready
            else -> SpellingAudioStatus.missing
        }
        return SpellingAudioSetStatus(
            setId = set.id,
            language = set.language,
            status = status,
            wordCount = set.words.size,
            uniqueWordCount = uniqueWords.size,
            requiredAudioCount = requiredAudioCount,
            readyAudioCount = readyAudioCount,
            missingAudioCount = missingAudioCount,
            queuedAudioCount = queuedAudioCount,
            generatingAudioCount = generatingAudioCount,
            errorAudioCount = errorAudioCount,
        )
    }

    fun enqueueMissingForSet(set: SpellingSet): SpellingAudioSetStatus {
        val uniqueWords = set.words
            .filter { it.text.isNotBlank() }
            .distinctBy { it.normalized }
        uniqueWords.forEach { word ->
            SpellingAudioKind.entries.forEach { kind ->
                val currentStatus = status(word.text, kind, set.language)?.status
                if (currentStatus != SpellingAudioStatus.ready) {
                    enqueueGeneration(word.text, kind, set.language)
                }
            }
        }
        return setStatus(set)
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
        val useFlipcardSettings = jobKind == ArtifactJobKind.flipcard_audio_word
        val outputPath = audioPath(word, kind, language, useFlipcardSettings)
        if (!force && Files.isRegularFile(outputPath)) {
            ArtifactGenerationQueue.markReady(audioJobKey(word, kind, language, useFlipcardSettings))
            return SpellingAudioWordResponse(
                word = word.text,
                normalized = word.normalized,
                status = SpellingAudioStatus.ready,
                kind = kind,
                audioUrl = audioUrl(word, kind, language, useFlipcardSettings),
            )
        }
        val job = ArtifactGenerationQueue.enqueueAudio(
            key = audioJobKey(word, kind, language, useFlipcardSettings),
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
        useFlipcardSettings: Boolean = false,
    ): Path? {
        val word = spellingAudioWord(rawWord) ?: return null
        val path = audioPath(word, kind, language, useFlipcardSettings)
        return path.takeIf { Files.isRegularFile(it) }
    }

    fun runQueuedGeneration(
        rawWord: String,
        kind: SpellingAudioKind,
        language: LearningLanguage = LearningLanguage.en,
        jobKind: ArtifactJobKind = when (kind) {
            SpellingAudioKind.word -> ArtifactJobKind.spelling_audio_word
            SpellingAudioKind.spelling -> ArtifactJobKind.spelling_audio_spelling
        },
        force: Boolean = false,
    ) {
        val word = spellingAudioWord(rawWord) ?: throw SpellingAudioException("invalid_word")
        val useFlipcardSettings = jobKind == ArtifactJobKind.flipcard_audio_word
        val outputPath = audioPath(word, kind, language, useFlipcardSettings)
        if (force || !Files.isRegularFile(outputPath)) {
            generateToFile(word, kind, language, outputPath, useFlipcardSettings)
        }
    }

    fun generatePreview(rawWord: String, language: LearningLanguage, voice: String, instructions: String): ByteArray {
        val settings = sanitizedAudioTtsSettings(
            language = language,
            voice = voice,
            instructions = instructions,
            testWord = rawWord,
        )
        val word = spellingAudioWord(settings.testWord) ?: throw SpellingAudioException("invalid_word")
        return generateBytes(
            word = word,
            kind = SpellingAudioKind.word,
            language = language,
            voice = settings.voice,
            instructions = settings.instructions,
        )
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
                val newPath = audioPath(word, kind, LearningLanguage.en, useFlipcardSettings = false)
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
                        val targetPath = audioPath(word, kind, language, useFlipcardSettings = false)
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
        useFlipcardSettings: Boolean,
    ) {
        Files.createDirectories(outputPath.parent)
        val tempPath = outputPath.resolveSibling("${outputPath.fileName}.tmp")
        val bytes = generateBytes(
            word = word,
            kind = kind,
            language = language,
            voice = ttsVoice(language, useFlipcardSettings),
            instructions = ttsInstructions(kind, language, useFlipcardSettings),
        )
        Files.write(tempPath, bytes)
        Files.move(tempPath, outputPath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
    }

    private fun generateBytes(
        word: SpellingWord,
        kind: SpellingAudioKind,
        language: LearningLanguage,
        voice: String,
        instructions: String,
    ): ByteArray {
        val apiKey = System.getenv("OPENAI_API_KEY")?.takeIf { it.isNotBlank() }
            ?: throw SpellingAudioException("tts_not_configured")
        val body = ttsJson.encodeToString(
            OpenAiTtsRequest(
                model = ttsModel(),
                voice = voice,
                input = ttsInput(word, kind, language),
                instructions = instructions,
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
        return response.body()
    }

    private fun audioPath(
        word: SpellingWord,
        kind: SpellingAudioKind,
        language: LearningLanguage,
        useFlipcardSettings: Boolean,
    ): Path {
        return runtimeDataPath("audio", "spelling").resolve("${audioCacheKey(word, kind, language, useFlipcardSettings)}.mp3")
    }

    private fun legacyAudioPath(word: SpellingWord, kind: SpellingAudioKind): Path {
        return runtimeDataPath("audio", "spelling").resolve("${legacyAudioCacheKey(word, kind)}.mp3")
    }

    private fun audioCacheKey(
        word: SpellingWord,
        kind: SpellingAudioKind,
        language: LearningLanguage,
        useFlipcardSettings: Boolean,
    ): String {
        return sha256Hex(
            listOf(
                language.name,
                kind.name,
                word.normalized,
                ttsModel(),
                ttsVoice(language, useFlipcardSettings),
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
                ttsVoice(language, useFlipcardSettings = false),
                instructions,
                ttsInput(word, kind, language),
            )
                .joinToString("\u001f"),
        )
    }

    private fun legacyAudioCacheKey(word: SpellingWord, kind: SpellingAudioKind): String {
        return sha256Hex(
            listOf(
                kind.name,
                word.normalized,
                ttsModel(),
                ttsVoice(LearningLanguage.en, useFlipcardSettings = false),
                ttsInstructions(kind, LearningLanguage.en),
            ).joinToString("\u001f"),
        )
    }

    private fun audioJobKey(
        word: SpellingWord,
        kind: SpellingAudioKind,
        language: LearningLanguage,
        useFlipcardSettings: Boolean,
    ): String {
        return "spelling_audio:${audioCacheKey(word, kind, language, useFlipcardSettings)}"
    }

    private fun audioUrl(
        word: SpellingWord,
        kind: SpellingAudioKind,
        language: LearningLanguage,
        useFlipcardSettings: Boolean,
    ): String {
        val cacheKey = audioCacheKey(word, kind, language, useFlipcardSettings)
        return if (useFlipcardSettings && kind == SpellingAudioKind.word) {
            "/api/flipcards/audio/${language.name}/${urlEncodePathSegment(word.text)}.mp3?v=$cacheKey"
        } else {
            "/api/spelling/audio/words/${urlEncodePathSegment(word.text)}.mp3?language=${language.name}&kind=${kind.name}&v=$cacheKey"
        }
    }

    private fun ttsModel(): String = System.getenv("OPENAI_TTS_MODEL")?.takeIf { it.isNotBlank() }
        ?: defaultOpenAiTtsModel

    private fun ttsVoice(language: LearningLanguage, useFlipcardSettings: Boolean): String {
        if (useFlipcardSettings) {
            return Database.useConnection { connection -> connection.readAudioTtsSettings(language).voice }
        }
        return System.getenv("OPENAI_TTS_VOICE")?.takeIf { it.isNotBlank() }
            ?: defaultOpenAiTtsVoice
    }

    private fun ttsInstructions(
        kind: SpellingAudioKind,
        language: LearningLanguage,
        useFlipcardSettings: Boolean = false,
    ): String {
        if (useFlipcardSettings && kind == SpellingAudioKind.word) {
            return Database.useConnection { connection -> connection.readAudioTtsSettings(language).instructions }
        }
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
            LearningLanguage.cs -> when (kind) {
                SpellingAudioKind.word -> System.getenv("OPENAI_CS_TTS_INSTRUCTIONS")?.takeIf { it.isNotBlank() }
                    ?: defaultCzechTtsInstructions
                SpellingAudioKind.spelling -> System.getenv("OPENAI_CS_SPELLING_TTS_INSTRUCTIONS")?.takeIf { it.isNotBlank() }
                    ?: defaultCzechSpellingTtsInstructions
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
            LearningLanguage.cs -> null
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
            LearningLanguage.cs -> when (letter) {
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
                'q' -> "Kve"
                'r' -> "Er"
                's' -> "Es"
                't' -> "Te"
                'u' -> "U"
                'v' -> "Ve"
                'w' -> "Dvojite ve"
                'x' -> "Iks"
                'y' -> "Ypsilon"
                'z' -> "Zet"
                'á' -> "Dlouhe A"
                'č' -> "Ce s hackem"
                'ď' -> "De s hackem"
                'é' -> "Dlouhe E"
                'ě' -> "E s hackem"
                'í' -> "Dlouhe I"
                'ň' -> "En s hackem"
                'ó' -> "Dlouhe O"
                'ř' -> "Er s hackem"
                'š' -> "Es s hackem"
                'ť' -> "Te s hackem"
                'ú' -> "Dlouhe U"
                'ů' -> "U s krouzkem"
                'ý' -> "Dlouhe Y"
                'ž' -> "Zet s hackem"
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
