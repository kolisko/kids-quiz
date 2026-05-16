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

    fun readSets(): List<SpellingSet> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readSpellingSets()
        }
    }

    fun replaceSets(rawSets: List<String>, latestSetIndex: Int?): List<SpellingSet> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.replaceSpellingSets(rawSets, latestSetIndex)
            connection.readSpellingSets()
        }
    }

    fun readSession(mode: SpellingSessionMode): SpellingSession? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readSpellingSession(mode)
        }
    }

    fun snapshot(): Map<String, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readSpellingStats()
        }
    }

    fun record(word: String, correct: Boolean, timedOut: Boolean): Pair<String, QuestionStats>? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordSpellingStats(word, correct, timedOut)
        }
    }
}

object FlipcardStore {
    private val lock = Any()

    fun readWords(): FlipcardWordsResponse = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readFlipcardWordsResponse()
        }
    }

    fun replaceWords(words: String): FlipcardWordsResponse = synchronized(lock) {
        Database.useConnection { connection ->
            connection.replaceFlipcardWords(words)
            connection.readFlipcardWordsResponse()
        }
    }

    fun readSession(limit: Int): FlipcardSession = synchronized(lock) {
        Database.useConnection { connection ->
            when (connection.readAppSettings().flipcardSource) {
                FlipcardSource.all_words -> connection.readFlipcardSession(limit)
                FlipcardSource.ready_only -> {
                    val words = connection.readFlipcardWords()
                        .filter { word ->
                            val asset = flipcardAsset(word)
                            asset.imageStatus == FlipcardImageStatus.ready && asset.audioStatus == SpellingAudioStatus.ready
                        }
                        .shuffled()
                        .take(limit.coerceAtLeast(1))
                    FlipcardSession(words = words)
                }
            }
        }
    }

    fun readAssets(): FlipcardAssetsResponse = synchronized(lock) {
        Database.useConnection { connection ->
            FlipcardAssetsResponse(items = connection.readFlipcardWords().map(::flipcardAsset))
        }
    }

    fun snapshot(): Map<String, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readFlipcardStats()
        }
    }

    fun record(word: String, correct: Boolean, timedOut: Boolean): Pair<String, QuestionStats>? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordFlipcardStats(word, correct, timedOut)
        }
    }

    private fun flipcardAsset(word: FlipcardWord): FlipcardAsset {
        val image = FlipcardImageService.status(word.text)
        val audio = SpellingAudioService.status(word.text, SpellingAudioKind.word)
        return FlipcardAsset(
            word = word.text,
            normalized = word.normalized,
            imageStatus = image?.status ?: FlipcardImageStatus.missing,
            imageUrl = image?.imageUrl,
            imageError = image?.error,
            audioStatus = audio?.status ?: SpellingAudioStatus.missing,
            audioUrl = audio?.audioUrl,
            audioError = audio?.error,
        )
    }
}
