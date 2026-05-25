package com.example.quiz

class SettingsUseCase(private val settings: SettingsPort) {
    fun read(): AppSettings = settings.readSettings()

    fun replace(request: AppSettings): AppSettings {
        return settings.replaceSettings(
            request.copy(
                secondsLimit = request.secondsLimit.coerceAtLeast(1),
                targetScore = request.targetScore.coerceAtLeast(1),
                celebrationTapLimit = request.celebrationTapLimit.coerceAtLeast(0),
            ),
        )
    }
}

class ActivityCatalogUseCase(private val activities: ActivityPort) {
    fun catalog(): ActivityCatalog {
        val multiplication = activities.readTests()
            .filter { it.type == QuizTestType.multiplication }
            .map { test ->
                ActivitySummary(
                    id = ActivityId.multiplication(test.id),
                    kind = ActivityKind.multiplication,
                    label = test.name,
                    testId = test.id,
                    questionCount = test.questionCount,
                )
            }
        val languageActivities = LearningLanguage.entries.flatMap { language ->
            listOf(
                ActivitySummary(
                    id = ActivityId.spelling(language),
                    kind = ActivityKind.spelling,
                    label = "${language.displayName()} spelling",
                    language = language,
                ),
                ActivitySummary(
                    id = ActivityId.flipcards(language),
                    kind = ActivityKind.flipcards,
                    label = "${language.displayName()} flipcards",
                    language = language,
                ),
            )
        }
        return ActivityCatalog(activities = multiplication + languageActivities)
    }
}

class PracticeUseCase(
    private val activities: ActivityPort,
    private val settings: SettingsPort,
    private val practice: PracticePort,
    private val assets: AssetPort? = null,
) {
    fun deck(request: PracticeDeckRequest): PracticeDeck? {
        return when (val id = ActivityId.parse(request.activityId)) {
            is ActivityId.Multiplication -> multiplicationDeck(id, request.mode)
            is ActivityId.Spelling -> spellingDeck(id, request.mode)
            is ActivityId.Flipcards -> flipcardDeck(id, request.limit)
            null -> null
        }
    }

    fun record(request: PracticeAnswerRequestV2): PracticeAnswerResponseV2? {
        val correct = request.result == PracticeAnswerKind.correct
        val timedOut = request.result == PracticeAnswerKind.timeout
        return when (val id = ActivityId.parse(request.activityId)) {
            is ActivityId.Multiplication -> {
                val questionId = request.itemId.toLongOrNull() ?: return null
                val (_, stats) = practice.recordQuestionAnswer(
                    testId = id.testId,
                    questionId = questionId,
                    correct = correct,
                    timedOut = timedOut,
                    direction = request.direction,
                ) ?: return null
                PracticeAnswerResponseV2(itemId = questionId.toString(), stats = stats)
            }
            is ActivityId.Spelling -> {
                val (word, stats) = practice.recordSpellingAnswer(request.itemId, correct, timedOut, id.language)
                    ?: return null
                PracticeAnswerResponseV2(itemId = word, stats = stats)
            }
            is ActivityId.Flipcards -> {
                val (word, stats) = practice.recordFlipcardAnswer(request.itemId, correct, timedOut, id.language)
                    ?: return null
                PracticeAnswerResponseV2(itemId = word, stats = stats)
            }
            null -> null
        }
    }

    private fun multiplicationDeck(id: ActivityId.Multiplication, mode: String?): PracticeDeck? {
        val test = activities.readTests().firstOrNull { it.id == id.testId } ?: return null
        val direction = runCatching {
            PracticeDirection.valueOf(mode ?: PracticeDirection.product_to_factors.name)
        }.getOrDefault(PracticeDirection.product_to_factors)
        return PracticeDeck(
            activity = ActivitySummary(
                id = ActivityId.multiplication(test.id),
                kind = ActivityKind.multiplication,
                label = test.name,
                testId = test.id,
                questionCount = test.questionCount,
            ),
            mode = mode,
            settings = settings.readSettings(),
            questions = practice.readQuestions(test.id),
            questionStats = practice.readQuestionStats(test.id, direction),
        )
    }

    private fun spellingDeck(id: ActivityId.Spelling, mode: String?): PracticeDeck? {
        val sessionMode = runCatching {
            SpellingSessionMode.valueOf(mode ?: SpellingSessionMode.latest.name)
        }.getOrDefault(SpellingSessionMode.latest)
        val session = practice.readSpellingSession(sessionMode, id.language) ?: return null
        return PracticeDeck(
            activity = ActivitySummary(
                id = ActivityId.spelling(id.language),
                kind = ActivityKind.spelling,
                label = "${id.language.displayName()} spelling",
                language = id.language,
                questionCount = session.words.size,
            ),
            mode = sessionMode.name,
            settings = settings.readSettings(),
            spellingWords = session.words,
            wordStats = practice.readSpellingStats(id.language),
        )
    }

    private fun flipcardDeck(id: ActivityId.Flipcards, limit: Int): PracticeDeck {
        val session = practice.readFlipcardSession(limit.coerceAtLeast(1), id.language)
        val sessionKeys = session.words.map { it.normalized }.toSet()
        val sessionAssets = assets
            ?.readFlipcardAssets(id.language)
            ?.items
            ?.filter { it.normalized in sessionKeys }
            ?: emptyList()
        return PracticeDeck(
            activity = ActivitySummary(
                id = ActivityId.flipcards(id.language),
                kind = ActivityKind.flipcards,
                label = "${id.language.displayName()} flipcards",
                language = id.language,
                questionCount = session.words.size,
            ),
            settings = settings.readSettings(),
            flipcardWords = session.words,
            flipcardAssets = sessionAssets,
            wordStats = practice.readFlipcardStats(id.language),
        )
    }
}

class ContentUseCase(private val content: ContentPort) {
    fun spellingSets(language: LearningLanguage): List<SpellingSet> = content.readSpellingSets(language)
    fun replaceSpellingSets(language: LearningLanguage, request: SpellingSetsRequest): List<SpellingSet> =
        content.replaceSpellingSets(request.sets, request.latestSetIndex, language)

    fun flipcardWords(language: LearningLanguage): FlipcardWordsResponse = content.readFlipcardWords(language)
    fun replaceFlipcardWords(language: LearningLanguage, request: FlipcardWordsRequest): FlipcardWordsResponse =
        content.replaceFlipcardWords(request.words, language)
}

class AssetUseCase(private val assets: AssetPort) {
    fun flipcardAssets(language: LearningLanguage): FlipcardAssetsResponse = assets.readFlipcardAssets(language)
    fun enqueueMissingImages(language: LearningLanguage): FlipcardAssetBulkEnqueueResponse =
        assets.enqueueMissingFlipcardImages(language)

    fun enqueueMissingAudio(language: LearningLanguage): FlipcardAssetBulkEnqueueResponse =
        assets.enqueueMissingFlipcardAudio(language)

    fun flipcardImageStatus(word: String): FlipcardImageResponse? = assets.flipcardImageStatus(word)
    fun enqueueFlipcardImage(word: String, force: Boolean): FlipcardImageResponse? =
        assets.enqueueFlipcardImage(word, force)

    fun audioStatus(request: AssetStatusRequest): SpellingAudioWordResponse? =
        assets.spellingAudioStatus(request.word, request.kind, request.language)

    fun enqueueAudio(request: AssetStatusRequest, force: Boolean, forFlipcard: Boolean): SpellingAudioWordResponse? =
        assets.enqueueSpellingAudio(request.word, request.kind, request.language, force, forFlipcard)

    fun translationStatus(language: LearningLanguage): FlipcardTranslationBackfillStatusResponse =
        assets.translationBackfillStatus(language)

    fun enqueueTranslations(language: LearningLanguage): FlipcardTranslationBackfillStatusResponse =
        assets.enqueueTranslationBackfill(language)
}

class TrophyUseCase(private val trophies: TrophyPort) {
    fun read(): List<TrophyItem> = trophies.readTrophies()
    fun award(request: TrophyAwardRequest): List<TrophyItem>? {
        if (request.animalKey !in ValidTrophyAnimalKeys) return null
        return trophies.awardTrophy(request.animalKey)
    }
}

sealed class ActivityId {
    data class Multiplication(val testId: Long) : ActivityId()
    data class Spelling(val language: LearningLanguage) : ActivityId()
    data class Flipcards(val language: LearningLanguage) : ActivityId()

    companion object {
        fun multiplication(testId: Long): String = "multiplication:$testId"
        fun spelling(language: LearningLanguage): String = "spelling:${language.name}"
        fun flipcards(language: LearningLanguage): String = "flipcards:${language.name}"

        fun parse(raw: String): ActivityId? {
            val parts = raw.split(':')
            if (parts.size != 2) return null
            return when (parts[0]) {
                "multiplication" -> parts[1].toLongOrNull()?.let(::Multiplication)
                "spelling" -> parts[1].toLearningLanguageOrNull()?.let(::Spelling)
                "flipcards" -> parts[1].toLearningLanguageOrNull()?.let(::Flipcards)
                else -> null
            }
        }
    }
}

val ValidTrophyAnimalKeys: Set<String> = (1..40).map { "animal-${it.toString().padStart(2, '0')}" }.toSet()

fun LearningLanguage.displayName(): String = when (this) {
    LearningLanguage.en -> "Angličtina"
    LearningLanguage.de -> "Němčina"
    LearningLanguage.es -> "Španělština"
}

fun String.toLearningLanguageOrNull(): LearningLanguage? = LearningLanguage.entries.firstOrNull { it.name == this }
