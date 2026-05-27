package com.example.quiz

object TestsStore {
    private val lock = Any()

    fun readTests(): List<QuizTest> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readTests()
        }
    }

    fun exists(testId: Long): Boolean = synchronized(lock) {
        Database.useConnection { connection ->
            connection.testExists(testId)
        }
    }
}

object SettingsStore {
    private val lock = Any()

    fun read(): AppSettings = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readAppSettings()
        }
    }

    fun replace(settings: AppSettings): AppSettings = synchronized(lock) {
        Database.useConnection { connection ->
            connection.replaceAppSettings(settings)
            connection.readAppSettings()
        }
    }
}

object TrophyStore {
    private val lock = Any()

    fun readAll(): List<TrophyItem> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readTrophies()
        }
    }

    fun awardNext(): TrophyAwardResponse = synchronized(lock) {
        Database.useConnection { connection ->
            val animalKey = TrophyAnimalService.nextUnwonAnimalKey(connection.readTrophyKeys())
                ?: throw IllegalStateException("trophy_pool_exhausted")
            connection.insertTrophy(animalKey)
            val trophies = connection.readTrophies()
            val awarded = trophies.firstOrNull { it.animalKey == animalKey }
                ?: throw IllegalStateException("awarded_trophy_missing")
            TrophyAwardResponse(awarded = awarded, trophies = trophies)
        }
    }
}

object QuestionsStore {
    private val lock = Any()

    fun readQuestions(testId: Long): List<Question> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readQuestions(testId)
        }
    }
}

object StatsStore {
    private val lock = Any()

    fun snapshot(testId: Long, direction: PracticeDirection): Map<Long, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readStats(testId, direction)
        }
    }

    fun record(
        testId: Long,
        questionId: Long,
        correct: Boolean,
        timedOut: Boolean,
        direction: PracticeDirection,
    ): Pair<Long, QuestionStats>? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordStats(testId, questionId, correct, timedOut, direction)
        }
    }

    fun recordSession(testId: Long, results: List<AnswerSessionResult>): Map<PracticeDirection, QuestionStatsSnapshot> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordStatsSession(testId, results)
        }
    }
}

object SpellingStore {
    private val lock = Any()

    fun readSets(language: LearningLanguage): List<SpellingSet> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readSpellingSets(language)
        }
    }

    fun replaceSets(rawSets: List<String>, latestSetIndex: Int?, language: LearningLanguage): List<SpellingSet> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.replaceSpellingSets(rawSets, latestSetIndex, language)
            connection.readSpellingSets(language)
        }
    }

    fun readSession(mode: SpellingSessionMode, language: LearningLanguage): SpellingSession? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readSpellingSession(mode, language)
        }
    }

    fun snapshot(language: LearningLanguage): Map<String, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readSpellingStats(language)
        }
    }

    fun record(word: String, correct: Boolean, timedOut: Boolean, language: LearningLanguage): Pair<String, QuestionStats>? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordSpellingStats(word, correct, timedOut, language)
        }
    }

    fun recordSession(results: List<WordSessionResult>, language: LearningLanguage): SpellingStatsSnapshot = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordSpellingStatsSession(results, language)
        }
    }
}

object FlipcardStore {
    private val lock = Any()

    fun readWords(language: LearningLanguage): FlipcardWordsResponse = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readFlipcardWordsResponse(language)
        }
    }

    fun replaceWords(words: String, language: LearningLanguage): FlipcardWordsResponse = synchronized(lock) {
        Database.useConnection { connection ->
            connection.replaceFlipcardWords(words, language)
            connection.readFlipcardWordsResponse(language)
        }
    }

    fun readSession(limit: Int, language: LearningLanguage): FlipcardSession = synchronized(lock) {
        Database.useConnection { connection ->
            when (connection.readAppSettings().flipcardSource) {
                FlipcardSource.all_words -> connection.readFlipcardSession(limit, language)
                FlipcardSource.ready_only -> {
                    val words = connection.readFlipcardWords(language)
                        .filter { word ->
                            val asset = flipcardAsset(word, language)
                            asset.imageStatus == FlipcardImageStatus.ready && asset.audioStatus == SpellingAudioStatus.ready
                        }
                        .shuffled()
                        .take(limit.coerceAtLeast(1))
                    FlipcardSession(words = words, language = language)
                }
            }
        }
    }

    fun readAssets(language: LearningLanguage): FlipcardAssetsResponse = synchronized(lock) {
        Database.useConnection { connection ->
            FlipcardAssetsResponse(items = connection.readFlipcardWords(language).map { flipcardAsset(it, language) })
        }
    }

    fun setImageReported(conceptKey: String, reported: Boolean): FlipcardImageReportResponse? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.setFlipcardImageReported(conceptKey, reported)
        }
    }

    fun enqueueMissingImages(language: LearningLanguage): FlipcardAssetBulkEnqueueResponse {
        val words = synchronized(lock) {
            Database.useConnection { connection -> connection.readFlipcardWords(language) }
        }
        var queued = 0
        var alreadyReady = 0
        var alreadyActive = 0
        words.forEach { word ->
            val status = FlipcardImageService.status(word.conceptKey)?.status ?: FlipcardImageStatus.missing
            when (status) {
                FlipcardImageStatus.ready -> alreadyReady += 1
                FlipcardImageStatus.queued,
                FlipcardImageStatus.generating -> alreadyActive += 1
                FlipcardImageStatus.missing,
                FlipcardImageStatus.error -> {
                    val response = FlipcardImageService.enqueueGeneration(word.conceptKey)
                    when (response?.status) {
                        FlipcardImageStatus.ready -> alreadyReady += 1
                        FlipcardImageStatus.queued,
                        FlipcardImageStatus.generating -> queued += 1
                        FlipcardImageStatus.error,
                        FlipcardImageStatus.missing,
                        null -> queued += 1
                    }
                }
            }
        }
        return FlipcardAssetBulkEnqueueResponse(
            total = words.size,
            queued = queued,
            alreadyReady = alreadyReady,
            alreadyActive = alreadyActive,
        )
    }

    fun enqueueMissingAudio(language: LearningLanguage): FlipcardAssetBulkEnqueueResponse {
        val words = synchronized(lock) {
            Database.useConnection { connection -> connection.readFlipcardWords(language) }
        }
        var queued = 0
        var alreadyReady = 0
        var alreadyActive = 0
        words.forEach { word ->
            val status = SpellingAudioService.status(word.text, SpellingAudioKind.word, language)?.status ?: SpellingAudioStatus.missing
            when (status) {
                SpellingAudioStatus.ready -> alreadyReady += 1
                SpellingAudioStatus.queued,
                SpellingAudioStatus.generating -> alreadyActive += 1
                SpellingAudioStatus.missing,
                SpellingAudioStatus.error -> {
                    val response = SpellingAudioService.enqueueGeneration(
                        rawWord = word.text,
                        kind = SpellingAudioKind.word,
                        language = language,
                        jobKind = ArtifactJobKind.flipcard_audio_word,
                    )
                    when (response?.status) {
                        SpellingAudioStatus.ready -> alreadyReady += 1
                        SpellingAudioStatus.queued,
                        SpellingAudioStatus.generating -> queued += 1
                        SpellingAudioStatus.error,
                        SpellingAudioStatus.missing,
                        null -> queued += 1
                    }
                }
            }
        }
        return FlipcardAssetBulkEnqueueResponse(
            total = words.size,
            queued = queued,
            alreadyReady = alreadyReady,
            alreadyActive = alreadyActive,
        )
    }

    fun translationBackfillStatus(language: LearningLanguage): FlipcardTranslationBackfillStatusResponse {
        return FlipcardTranslationService.status(language)
    }

    fun enqueueTranslationBackfill(language: LearningLanguage): FlipcardTranslationBackfillStatusResponse {
        return FlipcardTranslationService.enqueueBackfill(language)
    }

    fun snapshot(language: LearningLanguage): Map<String, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readFlipcardStats(language)
        }
    }

    fun record(word: String, correct: Boolean, timedOut: Boolean, language: LearningLanguage): Pair<String, QuestionStats>? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordFlipcardStats(word, correct, timedOut, language)
        }
    }

    fun recordSession(results: List<WordSessionResult>, language: LearningLanguage): FlipcardStatsSnapshot = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordFlipcardStatsSession(results, language)
        }
    }

    private fun flipcardAsset(word: FlipcardWord, language: LearningLanguage): FlipcardAsset {
        val image = FlipcardImageService.status(word.conceptKey)
        val audio = SpellingAudioService.status(word.text, SpellingAudioKind.word, language)
        return FlipcardAsset(
            word = word.text,
            normalized = word.normalized,
            conceptKey = word.conceptKey,
            language = language,
            imageStatus = image?.status ?: FlipcardImageStatus.missing,
            imageUrl = image?.imageUrl,
            imageError = image?.error,
            imageReported = word.imageReported,
            audioStatus = audio?.status ?: SpellingAudioStatus.missing,
            audioUrl = audio?.audioUrl,
            audioError = audio?.error,
        )
    }
}
