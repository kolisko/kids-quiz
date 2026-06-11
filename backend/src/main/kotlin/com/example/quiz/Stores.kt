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

object TestMenuStore {
    private val lock = Any()
    private val mathLaunchKey = Regex("""^tests\.math\.(\d+)\.(product_to_factors|factors_to_product|mix)$""")
    private val arithmeticLaunchKey = Regex("""^tests\.math\.arithmetic\.(easy|normal|hard|mix)$""")
    private val spellingLaunchKey = Regex("""^tests\.language\.(en|de|es|cs)\.spelling\.(latest|older|mix)$""")
    private val flipcardsLaunchKey = Regex("""^tests\.language\.(en|de|es|cs)\.flipcards$""")
    private val practiceModes = listOf(
        PracticeMode.product_to_factors to "Najdi násobení",
        PracticeMode.factors_to_product to "Spočítej výsledek",
        PracticeMode.mix to "Mix",
    )
    private val arithmeticModes = listOf(
        ArithmeticMode.easy to "Lehké",
        ArithmeticMode.normal to "Normál",
        ArithmeticMode.hard to "Těžké",
        ArithmeticMode.mix to "Mix",
    )
    private val languageLabels = listOf(
        LearningLanguage.en to "Angličtina",
        LearningLanguage.de to "Němčina",
        LearningLanguage.es to "Španělština",
        LearningLanguage.cs to "Čeština",
    )

    fun read(userId: Long, includeHidden: Boolean): TestMenuNode = synchronized(lock) {
        Database.useConnection { connection ->
            val settings = connection.readAppSettings(userId)
            val tree = buildTree(connection.readTests(), settings.hiddenTestMenuKeys.toSet())
            if (includeHidden) tree else tree.onlyVisible() ?: TestMenuNode(key = rootKey, label = "Testy")
        }
    }

    fun launch(userId: Long, key: String): TestMenuLaunchResponse? = synchronized(lock) {
        Database.useConnection { connection ->
            val settings = connection.readAppSettings(userId)
            val tests = connection.readTests()
            val visibleTree = buildTree(tests, settings.hiddenTestMenuKeys.toSet()).onlyVisible()
            if (visibleTree?.find(key)?.launchable != true) return@useConnection null

            mathLaunchKey.matchEntire(key)?.let { match ->
                val testId = match.groupValues[1].toLongOrNull() ?: return@useConnection null
                val mode = PracticeMode.valueOf(match.groupValues[2])
                val test = tests.firstOrNull { it.id == testId && it.type == QuizTestType.multiplication } ?: return@useConnection null
                return@useConnection TestMenuLaunchResponse(
                    key = key,
                    kind = TestMenuLaunchKind.multiplication,
                    settings = settings,
                    selectedTest = test,
                    practiceMode = mode,
                    questions = connection.readQuestions(testId),
                    mathStats = mapOf(
                        PracticeDirection.product_to_factors to QuestionStatsSnapshot(
                            statsByQuestionId = connection.readStats(userId, testId, PracticeDirection.product_to_factors),
                        ),
                        PracticeDirection.factors_to_product to QuestionStatsSnapshot(
                            statsByQuestionId = connection.readStats(userId, testId, PracticeDirection.factors_to_product),
                        ),
                    ),
                )
            }

            arithmeticLaunchKey.matchEntire(key)?.let { match ->
                val mode = ArithmeticMode.valueOf(match.groupValues[1])
                val questions = ArithmeticQuestionGenerator.questions(mode)
                return@useConnection TestMenuLaunchResponse(
                    key = key,
                    kind = TestMenuLaunchKind.arithmetic,
                    settings = settings,
                    selectedTest = QuizTest(
                        id = -2,
                        name = "Sčítání a odčítání",
                        type = QuizTestType.arithmetic,
                        questionCount = questions.size,
                    ),
                    arithmeticMode = mode,
                    arithmeticQuestions = questions,
                    arithmeticStats = ArithmeticStatsSnapshot(statsByKey = connection.readArithmeticStats(userId)),
                )
            }

            spellingLaunchKey.matchEntire(key)?.let { match ->
                val language = match.groupValues[1].toLearningLanguage()
                val mode = SpellingSessionMode.valueOf(match.groupValues[2])
                val session = connection.readSpellingSession(mode, language) ?: return@useConnection null
                return@useConnection TestMenuLaunchResponse(
                    key = key,
                    kind = TestMenuLaunchKind.spelling,
                    settings = settings,
                    selectedTest = languageTest(language),
                    selectedLanguage = language,
                    spellingMode = mode,
                    spellingSession = session,
                    spellingStats = SpellingStatsSnapshot(statsByWord = connection.readSpellingStats(userId, language)),
                )
            }

            flipcardsLaunchKey.matchEntire(key)?.let { match ->
                val language = match.groupValues[1].toLearningLanguage()
                return@useConnection TestMenuLaunchResponse(
                    key = key,
                    kind = TestMenuLaunchKind.flipcards,
                    settings = settings,
                    selectedTest = languageTest(language),
                    selectedLanguage = language,
                    flipcardStats = FlipcardStatsSnapshot(statsByWord = connection.readFlipcardStats(userId, language)),
                )
            }

            null
        }
    }

    private fun buildTree(tests: List<QuizTest>, hiddenKeys: Set<String>): TestMenuNode {
        val mathTests = tests
            .filter { it.type == QuizTestType.multiplication }
            .map { test ->
                val testKey = "tests.math.${test.id}"
                TestMenuNode(
                    key = testKey,
                    label = test.name,
                    visible = testKey !in hiddenKeys,
                    children = practiceModes.map { (mode, label) ->
                        val modeKey = "$testKey.${mode.name}"
                        TestMenuNode(
                            key = modeKey,
                            label = label,
                            launchable = true,
                            visible = modeKey !in hiddenKeys,
                        )
                    },
                )
            }
        val arithmeticKey = "tests.math.arithmetic"
        val arithmeticNode = TestMenuNode(
            key = arithmeticKey,
            label = "Sčítání a odčítání",
            visible = arithmeticKey !in hiddenKeys,
            children = arithmeticModes.map { (mode, label) ->
                val modeKey = "$arithmeticKey.${mode.name}"
                TestMenuNode(
                    key = modeKey,
                    label = label,
                    launchable = true,
                    visible = modeKey !in hiddenKeys,
                )
            },
        )
        val mathKey = "tests.math"
        val languageNodes = languageLabels.map { (language, label) ->
            val languageKey = "tests.language.${language.name}"
            val spellingKey = "$languageKey.spelling"
            TestMenuNode(
                key = languageKey,
                label = label,
                visible = languageKey !in hiddenKeys,
                children = listOf(
                    TestMenuNode(
                        key = spellingKey,
                        label = "Spelling",
                        visible = spellingKey !in hiddenKeys,
                        children = listOf(
                            TestMenuNode(
                                key = "$spellingKey.latest",
                                label = "Nová slovíčka",
                                launchable = true,
                                visible = "$spellingKey.latest" !in hiddenKeys,
                            ),
                            TestMenuNode(
                                key = "$spellingKey.older",
                                label = "Starší slovíčka",
                                launchable = true,
                                visible = "$spellingKey.older" !in hiddenKeys,
                            ),
                            TestMenuNode(
                                key = "$spellingKey.mix",
                                label = "Mix",
                                launchable = true,
                                visible = "$spellingKey.mix" !in hiddenKeys,
                            ),
                        ),
                    ),
                    TestMenuNode(
                        key = "$languageKey.flipcards",
                        label = "Flipcards",
                        launchable = true,
                        visible = "$languageKey.flipcards" !in hiddenKeys,
                    ),
                ),
            )
        }
        return TestMenuNode(
            key = rootKey,
            label = "Testy",
            visible = rootKey !in hiddenKeys,
            children = listOf(
                TestMenuNode(
                    key = mathKey,
                    label = "Matematika",
                    visible = mathKey !in hiddenKeys,
                    children = mathTests + arithmeticNode,
                ),
            ) + languageNodes,
        )
    }

    private fun TestMenuNode.onlyVisible(): TestMenuNode? {
        if (!visible) return null
        val visibleChildren = children.mapNotNull { it.onlyVisible() }
        if (!launchable && key != rootKey && visibleChildren.isEmpty()) return null
        return copy(children = visibleChildren)
    }

    private fun TestMenuNode.find(key: String): TestMenuNode? {
        if (this.key == key) return this
        return children.firstNotNullOfOrNull { it.find(key) }
    }

    private fun languageTest(language: LearningLanguage): QuizTest {
        return QuizTest(
            id = -1,
            name = languageLabels.firstOrNull { it.first == language }?.second ?: "Jazyk",
            type = QuizTestType.english,
            questionCount = 0,
        )
    }

    private const val rootKey = "tests"
}

object SettingsStore {
    private val lock = Any()

    fun read(userId: Long): AppSettings = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readAppSettings(userId)
        }
    }

    fun replace(userId: Long, settings: AppSettings): AppSettings = synchronized(lock) {
        Database.useConnection { connection ->
            connection.replaceAppSettings(userId, settings)
            connection.readAppSettings(userId)
        }
    }

    fun patch(userId: Long, request: AppSettingsPatchRequest): AppSettings = synchronized(lock) {
        Database.useConnection { connection ->
            val current = connection.readAppSettings(userId)
            val merged = current.copy(
                secondsLimit = request.secondsLimit ?: current.secondsLimit,
                targetScore = request.targetScore ?: current.targetScore,
                celebrationTapLimit = request.celebrationTapLimit ?: current.celebrationTapLimit,
                audioSource = request.audioSource ?: current.audioSource,
                flipcardSource = request.flipcardSource ?: current.flipcardSource,
                flipcardPromptLanguage = request.flipcardPromptLanguage ?: current.flipcardPromptLanguage,
                hiddenTestMenuKeys = request.hiddenTestMenuKeys ?: current.hiddenTestMenuKeys,
            )
            connection.replaceAppSettings(userId, merged)
            connection.readAppSettings(userId)
        }
    }
}

object UserAdminStore {
    private val lock = Any()

    fun readUsers(): AdminUsersResponse = synchronized(lock) {
        Database.useConnection { connection -> connection.readAdminUsers() }
    }

    fun updateStatus(userId: Long, status: UserStatus): AuthUser? = synchronized(lock) {
        Database.useConnection { connection -> connection.updateUserStatus(userId, status) }
    }
}

object TrophyStore {
    private val lock = Any()

    fun readAll(userId: Long): List<TrophyItem> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readTrophies(userId)
        }
    }

    fun awardNext(userId: Long): TrophyAwardResponse = synchronized(lock) {
        Database.useConnection { connection ->
            val animalKey = TrophyAnimalService.nextUnwonAnimalKey(connection.readTrophyKeys(userId))
                ?: throw IllegalStateException("trophy_pool_exhausted")
            connection.insertTrophy(userId, animalKey)
            val trophies = connection.readTrophies(userId)
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

    fun snapshot(userId: Long, testId: Long, direction: PracticeDirection): Map<Long, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readStats(userId, testId, direction)
        }
    }

    fun record(
        userId: Long,
        testId: Long,
        questionId: Long,
        correct: Boolean,
        timedOut: Boolean,
        direction: PracticeDirection,
    ): Pair<Long, QuestionStats>? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordStats(userId, testId, questionId, correct, timedOut, direction)
        }
    }

    fun recordSession(userId: Long, testId: Long, results: List<AnswerSessionResult>): Map<PracticeDirection, QuestionStatsSnapshot> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordStatsSession(userId, testId, results)
        }
    }
}

object ArithmeticStore {
    private val lock = Any()

    fun recordSession(userId: Long, results: List<ArithmeticSessionResult>): ArithmeticStatsSnapshot = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordArithmeticStatsSession(userId, results)
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

    fun snapshot(userId: Long, language: LearningLanguage): Map<String, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readSpellingStats(userId, language)
        }
    }

    fun record(userId: Long, word: String, correct: Boolean, timedOut: Boolean, language: LearningLanguage): Pair<String, QuestionStats>? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordSpellingStats(userId, word, correct, timedOut, language)
        }
    }

    fun recordSession(userId: Long, results: List<WordSessionResult>, language: LearningLanguage): SpellingStatsSnapshot = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordSpellingStatsSession(userId, results, language)
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

    fun replaceWords(request: FlipcardWordsRequest, language: LearningLanguage): FlipcardWordsResponse = synchronized(lock) {
        Database.useConnection { connection ->
            connection.replaceFlipcardWords(request.words, request.items, language)
            connection.readFlipcardWordsResponse(language)
        }
    }

    fun syncFromSpelling(language: LearningLanguage): FlipcardSpellingSyncResponse = synchronized(lock) {
        Database.useConnection { connection -> connection.syncFlipcardWordsFromSpelling(language) }
    }

    fun readSession(userId: Long, limit: Int, language: LearningLanguage): FlipcardSession = synchronized(lock) {
        Database.useConnection { connection ->
            when (connection.readAppSettings(userId).flipcardSource) {
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
            val spellingNormalizedWords = connection.readSpellingNormalizedWords(language)
            FlipcardAssetsResponse(
                items = connection.readFlipcardWords(language).map { flipcardAsset(it, language, spellingNormalizedWords) },
            )
        }
    }

    fun setImageReported(conceptKey: String, reported: Boolean): FlipcardImageReportResponse? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.setFlipcardImageReported(conceptKey, reported)
        }
    }

    fun readAudioTtsSettings(language: LearningLanguage): AudioTtsSettingsResponse = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readAudioTtsSettings(language)
        }
    }

    fun replaceAudioTtsSettings(
        language: LearningLanguage,
        request: AudioTtsSettingsRequest,
    ): AudioTtsSettingsResponse = synchronized(lock) {
        Database.useConnection { connection ->
            connection.replaceAudioTtsSettings(language, request)
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
            val status = SpellingAudioService.status(
                rawWord = word.text,
                kind = SpellingAudioKind.word,
                language = language,
                useFlipcardSettings = true,
            )?.status ?: SpellingAudioStatus.missing
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

    fun snapshot(userId: Long, language: LearningLanguage): Map<String, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readFlipcardStats(userId, language)
        }
    }

    fun record(userId: Long, word: String, correct: Boolean, timedOut: Boolean, language: LearningLanguage): Pair<String, QuestionStats>? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordFlipcardStats(userId, word, correct, timedOut, language)
        }
    }

    fun recordSession(userId: Long, results: List<WordSessionResult>, language: LearningLanguage): FlipcardStatsSnapshot = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordFlipcardStatsSession(userId, results, language)
        }
    }

    private fun flipcardAsset(
        word: FlipcardWord,
        language: LearningLanguage,
        spellingNormalizedWords: Set<String> = emptySet(),
    ): FlipcardAsset {
        val image = FlipcardImageService.status(word.conceptKey)
        val audio = SpellingAudioService.status(
            rawWord = word.text,
            kind = SpellingAudioKind.word,
            language = language,
            useFlipcardSettings = true,
        )
        return FlipcardAsset(
            word = word.text,
            normalized = word.normalized,
            conceptKey = word.conceptKey,
            language = language,
            inFlipcards = true,
            inSpelling = word.normalized in spellingNormalizedWords,
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
