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
            audioStatus = audio?.status ?: SpellingAudioStatus.missing,
            audioUrl = audio?.audioUrl,
            audioError = audio?.error,
        )
    }
}
