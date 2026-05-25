package com.example.quiz

class SqliteKidsQuizAdapter :
    SettingsPort,
    ActivityPort,
    PracticePort,
    ContentPort,
    AssetPort,
    TrophyPort {

    override fun readSettings(): AppSettings = SettingsStore.read()

    override fun replaceSettings(settings: AppSettings): AppSettings = SettingsStore.replace(settings)

    override fun readTests(): List<QuizTest> = TestsStore.readTests()

    override fun testExists(testId: Long): Boolean = TestsStore.exists(testId)

    override fun readQuestions(testId: Long): List<Question> = QuestionsStore.readQuestions(testId)

    override fun readQuestionStats(testId: Long, direction: PracticeDirection): Map<Long, QuestionStats> =
        StatsStore.snapshot(testId, direction)

    override fun recordQuestionAnswer(
        testId: Long,
        questionId: Long,
        correct: Boolean,
        timedOut: Boolean,
        direction: PracticeDirection,
    ): Pair<Long, QuestionStats>? = StatsStore.record(testId, questionId, correct, timedOut, direction)

    override fun readSpellingSession(mode: SpellingSessionMode, language: LearningLanguage): SpellingSession? =
        SpellingStore.readSession(mode, language)

    override fun readSpellingStats(language: LearningLanguage): Map<String, QuestionStats> =
        SpellingStore.snapshot(language)

    override fun recordSpellingAnswer(
        word: String,
        correct: Boolean,
        timedOut: Boolean,
        language: LearningLanguage,
    ): Pair<String, QuestionStats>? = SpellingStore.record(word, correct, timedOut, language)

    override fun readFlipcardSession(limit: Int, language: LearningLanguage): FlipcardSession =
        FlipcardStore.readSession(limit, language)

    override fun readFlipcardStats(language: LearningLanguage): Map<String, QuestionStats> =
        FlipcardStore.snapshot(language)

    override fun recordFlipcardAnswer(
        word: String,
        correct: Boolean,
        timedOut: Boolean,
        language: LearningLanguage,
    ): Pair<String, QuestionStats>? = FlipcardStore.record(word, correct, timedOut, language)

    override fun readSpellingSets(language: LearningLanguage): List<SpellingSet> =
        SpellingStore.readSets(language)

    override fun replaceSpellingSets(
        rawSets: List<String>,
        latestSetIndex: Int?,
        language: LearningLanguage,
    ): List<SpellingSet> = SpellingStore.replaceSets(rawSets, latestSetIndex, language)

    override fun readFlipcardWords(language: LearningLanguage): FlipcardWordsResponse =
        FlipcardStore.readWords(language)

    override fun replaceFlipcardWords(words: String, language: LearningLanguage): FlipcardWordsResponse =
        FlipcardStore.replaceWords(words, language)

    override fun readFlipcardAssets(language: LearningLanguage): FlipcardAssetsResponse =
        FlipcardStore.readAssets(language)

    override fun enqueueMissingFlipcardImages(language: LearningLanguage): FlipcardAssetBulkEnqueueResponse =
        FlipcardStore.enqueueMissingImages(language)

    override fun enqueueMissingFlipcardAudio(language: LearningLanguage): FlipcardAssetBulkEnqueueResponse =
        FlipcardStore.enqueueMissingAudio(language)

    override fun flipcardImageStatus(word: String): FlipcardImageResponse? =
        FlipcardImageService.status(word)

    override fun enqueueFlipcardImage(word: String, force: Boolean): FlipcardImageResponse? =
        FlipcardImageService.enqueueGeneration(word, force)

    override fun spellingAudioStatus(
        word: String,
        kind: SpellingAudioKind,
        language: LearningLanguage,
    ): SpellingAudioWordResponse? = SpellingAudioService.status(word, kind, language)

    override fun enqueueSpellingAudio(
        word: String,
        kind: SpellingAudioKind,
        language: LearningLanguage,
        force: Boolean,
        forFlipcard: Boolean,
    ): SpellingAudioWordResponse? {
        if (forFlipcard) {
            return SpellingAudioService.enqueueGeneration(
                rawWord = word,
                kind = kind,
                language = language,
                jobKind = ArtifactJobKind.flipcard_audio_word,
                force = force,
            )
        }
        return SpellingAudioService.enqueueGeneration(rawWord = word, kind = kind, language = language, force = force)
    }

    override fun translationBackfillStatus(language: LearningLanguage): FlipcardTranslationBackfillStatusResponse =
        FlipcardStore.translationBackfillStatus(language)

    override fun enqueueTranslationBackfill(language: LearningLanguage): FlipcardTranslationBackfillStatusResponse =
        FlipcardStore.enqueueTranslationBackfill(language)

    override fun readTrophies(): List<TrophyItem> = TrophyStore.readAll()

    override fun awardTrophy(animalKey: String): List<TrophyItem> = TrophyStore.award(animalKey)
}
