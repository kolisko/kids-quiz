package com.example.quiz

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class PracticeUseCaseTest {
    @Test
    fun multiplicationDeckComesFromPortsAndKeepsStats() {
        val fake = FakePracticePorts()
        val useCase = PracticeUseCase(fake, fake, fake)

        val deck = useCase.deck(PracticeDeckRequest(activityId = ActivityId.multiplication(1), mode = PracticeDirection.product_to_factors.name))

        assertNotNull(deck)
        assertEquals(ActivityKind.multiplication, deck.activity.kind)
        assertEquals(1, deck.questions.single().id)
        assertEquals(2, deck.questionStats.getValue(1).wrong)
    }

    @Test
    fun answerRecordingMapsResultToCorrectAndTimedOutFlags() {
        val fake = FakePracticePorts()
        val useCase = PracticeUseCase(fake, fake, fake)

        val response = useCase.record(
            PracticeAnswerRequestV2(
                activityId = ActivityId.multiplication(1),
                itemId = "1",
                result = PracticeAnswerKind.timeout,
            ),
        )

        assertNotNull(response)
        assertEquals("1", response.itemId)
        assertEquals(1, fake.recordedTimedOutCount)
    }
}

private class FakePracticePorts : SettingsPort, ActivityPort, PracticePort {
    var recordedTimedOutCount = 0

    override fun readSettings(): AppSettings = AppSettings(secondsLimit = 15, targetScore = 3)
    override fun replaceSettings(settings: AppSettings): AppSettings = settings
    override fun readTests(): List<QuizTest> = listOf(QuizTest(id = 1, name = "Test", questionCount = 1))
    override fun testExists(testId: Long): Boolean = testId == 1L
    override fun readQuestions(testId: Long): List<Question> = listOf(Question(id = 1, q = "6", answers = listOf("2 * 3")))
    override fun readQuestionStats(testId: Long, direction: PracticeDirection): Map<Long, QuestionStats> =
        mapOf(1L to QuestionStats(correct = 0, wrong = 2, timeout = 0))

    override fun recordQuestionAnswer(
        testId: Long,
        questionId: Long,
        correct: Boolean,
        timedOut: Boolean,
        direction: PracticeDirection,
    ): Pair<Long, QuestionStats>? {
        if (timedOut) recordedTimedOutCount += 1
        return questionId to QuestionStats(timeout = recordedTimedOutCount)
    }

    override fun readSpellingSession(mode: SpellingSessionMode, language: LearningLanguage): SpellingSession? = null
    override fun readSpellingStats(language: LearningLanguage): Map<String, QuestionStats> = emptyMap()
    override fun recordSpellingAnswer(word: String, correct: Boolean, timedOut: Boolean, language: LearningLanguage): Pair<String, QuestionStats>? = null
    override fun readFlipcardSession(limit: Int, language: LearningLanguage): FlipcardSession = FlipcardSession(emptyList(), language)
    override fun readFlipcardStats(language: LearningLanguage): Map<String, QuestionStats> = emptyMap()
    override fun recordFlipcardAnswer(word: String, correct: Boolean, timedOut: Boolean, language: LearningLanguage): Pair<String, QuestionStats>? = null
}
