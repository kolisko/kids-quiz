package com.example.quiz

import kotlin.test.Test
import kotlin.test.assertEquals

class PracticeRulesTest {
    @Test
    fun scoringAppliesSinglePenaltyForWrongAndTimeout() {
        assertEquals(4, PracticeScoring.apply(5, PracticeAnswerKind.timeout))
        assertEquals(4, PracticeScoring.apply(5, PracticeAnswerKind.wrong))
        assertEquals(6, PracticeScoring.apply(5, PracticeAnswerKind.correct))
    }

    @Test
    fun adaptiveWeightPrefersHistoricalAndSessionMistakes() {
        val easy = AdaptiveQuestionWeighting.weight(QuestionStats(correct = 4, wrong = 0, timeout = 0))
        val difficult = AdaptiveQuestionWeighting.weight(QuestionStats(correct = 1, wrong = 2, timeout = 1), sessionMistakeWeight = 2)

        assertEquals(1, easy)
        assertEquals(8, difficult)
    }

    @Test
    fun wordNormalizationMatchesExistingStoragePolicy() {
        assertEquals("apfel", normalizePracticeWord("  Apfel "))
    }
}
