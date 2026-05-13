package com.example.quiz

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

    fun readQuestions(testId: Long): List<Question> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readQuestions(testId)
        }
    }
}

object StatsStore {
    private val lock = Any()

    fun snapshot(testId: Long): Map<Long, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readStats(testId)
        }
    }

    fun record(testId: Long, questionId: Long, correct: Boolean, timedOut: Boolean): Pair<Long, QuestionStats>? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordStats(testId, questionId, correct, timedOut)
        }
    }
}
