package com.example.quiz.api

import com.example.quiz.shared.QuestionStats

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
