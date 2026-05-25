package com.example.quiz

interface SettingsPort {
    fun readSettings(): AppSettings
    fun replaceSettings(settings: AppSettings): AppSettings
}

interface ActivityPort {
    fun readTests(): List<QuizTest>
    fun testExists(testId: Long): Boolean
}

interface PracticePort {
    fun readQuestions(testId: Long): List<Question>
    fun readQuestionStats(testId: Long, direction: PracticeDirection): Map<Long, QuestionStats>
    fun recordQuestionAnswer(
        testId: Long,
        questionId: Long,
        correct: Boolean,
        timedOut: Boolean,
        direction: PracticeDirection,
    ): Pair<Long, QuestionStats>?

    fun readSpellingSession(mode: SpellingSessionMode, language: LearningLanguage): SpellingSession?
    fun readSpellingStats(language: LearningLanguage): Map<String, QuestionStats>
    fun recordSpellingAnswer(
        word: String,
        correct: Boolean,
        timedOut: Boolean,
        language: LearningLanguage,
    ): Pair<String, QuestionStats>?

    fun readFlipcardSession(limit: Int, language: LearningLanguage): FlipcardSession
    fun readFlipcardStats(language: LearningLanguage): Map<String, QuestionStats>
    fun recordFlipcardAnswer(
        word: String,
        correct: Boolean,
        timedOut: Boolean,
        language: LearningLanguage,
    ): Pair<String, QuestionStats>?
}

interface ContentPort {
    fun readSpellingSets(language: LearningLanguage): List<SpellingSet>
    fun replaceSpellingSets(rawSets: List<String>, latestSetIndex: Int?, language: LearningLanguage): List<SpellingSet>
    fun readFlipcardWords(language: LearningLanguage): FlipcardWordsResponse
    fun replaceFlipcardWords(words: String, language: LearningLanguage): FlipcardWordsResponse
}

interface AssetPort {
    fun readFlipcardAssets(language: LearningLanguage): FlipcardAssetsResponse
    fun enqueueMissingFlipcardImages(language: LearningLanguage): FlipcardAssetBulkEnqueueResponse
    fun enqueueMissingFlipcardAudio(language: LearningLanguage): FlipcardAssetBulkEnqueueResponse
    fun flipcardImageStatus(word: String): FlipcardImageResponse?
    fun enqueueFlipcardImage(word: String, force: Boolean): FlipcardImageResponse?
    fun spellingAudioStatus(word: String, kind: SpellingAudioKind, language: LearningLanguage): SpellingAudioWordResponse?
    fun enqueueSpellingAudio(
        word: String,
        kind: SpellingAudioKind,
        language: LearningLanguage,
        force: Boolean,
        forFlipcard: Boolean,
    ): SpellingAudioWordResponse?

    fun translationBackfillStatus(language: LearningLanguage): FlipcardTranslationBackfillStatusResponse
    fun enqueueTranslationBackfill(language: LearningLanguage): FlipcardTranslationBackfillStatusResponse
}

interface TrophyPort {
    fun readTrophies(): List<TrophyItem>
    fun awardTrophy(animalKey: String): List<TrophyItem>
}
