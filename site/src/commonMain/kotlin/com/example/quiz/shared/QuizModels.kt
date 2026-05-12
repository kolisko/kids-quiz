package com.example.quiz.shared

import kotlinx.serialization.Serializable

@Serializable
data class Question(val q: String, val a: String)

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
    val statsByKey: Map<String, QuestionStats> = emptyMap(),
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
    val q: String,
    val a: String,
    val correct: Boolean,
    val timedOut: Boolean = false,
)

@Serializable
data class AnswerResultResponse(
    val key: String,
    val stats: QuestionStats,
)

fun questionKey(q: String, a: String): String = "${q.trim()}\n---answer---\n${a.trim()}"
