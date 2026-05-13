package com.example.quiz

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

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

object QuestionsStore {
    private val lock = Any()
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        prettyPrint = true
    }

    fun readQuestions(testId: Long): List<Question> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readQuestions(testId)
        }
    }

    fun replaceQuestions(testId: Long, source: String): Boolean = synchronized(lock) {
        val questions = parseQuestions(source) ?: return@synchronized false
        Database.useConnection { connection ->
            connection.transaction {
                replaceQuestions(testId, questions)
            }
        }
        true
    }

    fun questionsJson(testId: Long): String = json.encodeToString(readQuestions(testId))

    private fun parseQuestions(source: String): List<Question>? {
        val questions = runCatching { json.decodeFromString<List<Question>>(source) }.getOrNull() ?: return null
        if (questions.any { it.q.isBlank() || it.a.isBlank() }) return null
        return questions
    }
}

object StatsStore {
    private val lock = Any()

    fun snapshot(testId: Long): Map<String, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readStats(testId)
        }
    }

    fun record(testId: Long, q: String, a: String, correct: Boolean, timedOut: Boolean): Pair<String, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordStats(testId, q, a, correct, timedOut)
        }
    }
}
