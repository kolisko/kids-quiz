package com.example.quiz

import kotlinx.serialization.Serializable

@Serializable
data class Question(
    val id: Long,
    val q: String,
    val answers: List<String>,
)

@Serializable
data class QuizTest(
    val id: Long,
    val name: String,
    val questionCount: Int = 0,
)

@Serializable
data class QuestionStats(
    val correct: Int = 0,
    val wrong: Int = 0,
    val timeout: Int = 0,
) {
    val mistakes: Int get() = wrong + timeout
}

@Serializable
data class QuestionStatsSnapshot(
    val statsByQuestionId: Map<Long, QuestionStats> = emptyMap(),
)

@Serializable
data class AuthStatusResponse(
    val authenticated: Boolean,
)

@Serializable
data class LoginRequest(
    val password: String,
)

@Serializable
data class AnswerResultRequest(
    val questionId: Long,
    val correct: Boolean,
    val timedOut: Boolean = false,
)

@Serializable
data class AnswerResultResponse(
    val questionId: Long,
    val stats: QuestionStats,
)
