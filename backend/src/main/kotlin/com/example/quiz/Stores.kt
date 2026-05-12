package com.example.quiz

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object QuestionsStore {
    private val lock = Any()
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        prettyPrint = true
    }

    fun readQuestions(): List<Question> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readQuestions()
        }
    }

    fun replaceQuestions(source: String): Boolean = synchronized(lock) {
        val questions = parseQuestions(source) ?: return@synchronized false
        Database.useConnection { connection ->
            connection.transaction {
                replaceQuestions(questions)
            }
        }
        true
    }

    fun questionsJson(): String = json.encodeToString(readQuestions())

    private fun parseQuestions(source: String): List<Question>? {
        val questions = runCatching { json.decodeFromString<List<Question>>(source) }.getOrNull() ?: return null
        if (questions.any { it.q.isBlank() || it.a.isBlank() }) return null
        return questions
    }
}

object StatsStore {
    private val lock = Any()

    fun snapshot(): Map<String, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readStats()
        }
    }

    fun record(q: String, a: String, correct: Boolean, timedOut: Boolean): Pair<String, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordStats(q, a, correct, timedOut)
        }
    }
}
