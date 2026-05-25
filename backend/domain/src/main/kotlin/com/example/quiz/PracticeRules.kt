package com.example.quiz

object PracticeScoring {
    fun apply(currentScore: Int, result: PracticeAnswerKind): Int = when (result) {
        PracticeAnswerKind.correct -> currentScore + 1
        PracticeAnswerKind.wrong,
        PracticeAnswerKind.timeout -> currentScore - 1
    }
}

object AdaptiveQuestionWeighting {
    fun weight(stats: QuestionStats = QuestionStats(), sessionMistakeWeight: Int = 0): Int {
        val historicalMistakes = stats.wrong + stats.timeout
        val historicalSuccesses = stats.correct
        val historyWeight = (historicalMistakes * 2 - historicalSuccesses).coerceAtLeast(0)
        return 1 + historyWeight + sessionMistakeWeight.coerceAtLeast(0)
    }

    fun weightedQuestionIds(statsByQuestionId: Map<Long, QuestionStats>, sessionWeights: Map<Long, Int>): List<Long> {
        val ids = (statsByQuestionId.keys + sessionWeights.keys).sorted()
        return ids.flatMap { id ->
            List(weight(statsByQuestionId[id] ?: QuestionStats(), sessionWeights[id] ?: 0)) { id }
        }
    }
}

fun normalizePracticeWord(word: String): String = word.trim().lowercase()
