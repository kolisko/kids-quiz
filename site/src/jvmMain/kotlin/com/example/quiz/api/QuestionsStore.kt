package com.example.quiz.api

import com.example.quiz.shared.Question
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

    fun readQuestionsJson(): String = synchronized(lock) {
        val questions = Database.useConnection { connection ->
            connection.readQuestions()
        }
        json.encodeToString(questions)
    }

    fun saveQuestionsJson(source: String): Boolean = synchronized(lock) {
        val questions = parseQuestions(source) ?: return@synchronized false
        Database.useConnection { connection ->
            connection.transaction {
                replaceQuestions(questions)
            }
        }
        true
    }

    private fun parseQuestions(source: String): List<Question>? {
        val questions = runCatching { json.decodeFromString<List<Question>>(source) }.getOrNull() ?: return null
        if (questions.any { it.q.isBlank() || it.a.isBlank() }) return null
        return questions
    }
}
