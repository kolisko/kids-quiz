package com.example.quiz

import kotlinx.serialization.Serializable

@Serializable
enum class PracticeDirection {
    product_to_factors,
    factors_to_product,
}

@Serializable
enum class QuizTestType {
    multiplication,
    english,
}

enum class SpellingSessionMode {
    latest,
    older,
}

@Serializable
enum class AudioSource {
    browser_tts,
    backend_mp3,
}

@Serializable
enum class SpellingAudioStatus {
    ready,
    missing,
}

enum class SpellingAudioKind {
    word,
    spelling,
}

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
    val type: QuizTestType = QuizTestType.multiplication,
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
data class AppSettings(
    val secondsLimit: Int = 30,
    val targetScore: Int = 10,
    val audioSource: AudioSource = AudioSource.browser_tts,
)

@Serializable
data class AnswerResultRequest(
    val questionId: Long,
    val correct: Boolean,
    val timedOut: Boolean = false,
    val direction: PracticeDirection = PracticeDirection.product_to_factors,
)

@Serializable
data class AnswerResultResponse(
    val questionId: Long,
    val stats: QuestionStats,
)

@Serializable
data class SpellingSet(
    val id: Long,
    val rawWords: String,
    val isLatest: Boolean = false,
    val words: List<SpellingWord> = emptyList(),
)

@Serializable
data class SpellingWord(
    val id: Long,
    val text: String,
    val normalized: String,
)

@Serializable
data class SpellingAudioWordStatus(
    val wordId: Long,
    val word: String,
    val normalized: String,
    val status: SpellingAudioStatus,
    val audioUrl: String? = null,
    val spellingStatus: SpellingAudioStatus = SpellingAudioStatus.missing,
    val spellingAudioUrl: String? = null,
)

@Serializable
data class SpellingAudioStatusResponse(
    val setId: Long,
    val words: List<SpellingAudioWordStatus>,
)

@Serializable
data class SpellingAudioWordResponse(
    val wordId: Long,
    val word: String,
    val normalized: String,
    val status: SpellingAudioStatus,
    val kind: SpellingAudioKind = SpellingAudioKind.word,
    val audioUrl: String,
)

@Serializable
data class SpellingSetsRequest(
    val sets: List<String> = emptyList(),
    val latestSetIndex: Int? = null,
)

@Serializable
data class SpellingSession(
    val setId: Long,
    val words: List<SpellingWord>,
)

@Serializable
data class SpellingStatsSnapshot(
    val statsByWord: Map<String, QuestionStats> = emptyMap(),
)

@Serializable
data class SpellingAnswerResultRequest(
    val word: String,
    val correct: Boolean,
    val timedOut: Boolean = false,
)

@Serializable
data class SpellingAnswerResultResponse(
    val word: String,
    val stats: QuestionStats,
)
