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

    fun snapshot(testId: Long, direction: PracticeDirection): Map<Long, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readStats(testId, direction)
        }
    }

    fun record(
        testId: Long,
        questionId: Long,
        correct: Boolean,
        timedOut: Boolean,
        direction: PracticeDirection,
    ): Pair<Long, QuestionStats>? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordStats(testId, questionId, correct, timedOut, direction)
        }
    }
}

object SpellingStore {
    private val lock = Any()

    fun readSets(): List<SpellingSet> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readSpellingSets()
        }
    }

    fun replaceSets(rawSets: List<String>): List<SpellingSet> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.replaceSpellingSets(rawSets)
            connection.readSpellingSets()
        }
    }

    fun readSession(): SpellingSession? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readSpellingSession()
        }
    }

    fun snapshot(): Map<String, QuestionStats> = synchronized(lock) {
        Database.useConnection { connection ->
            connection.readSpellingStats()
        }
    }

    fun record(word: String, correct: Boolean, timedOut: Boolean): Pair<String, QuestionStats>? = synchronized(lock) {
        Database.useConnection { connection ->
            connection.recordSpellingStats(word, correct, timedOut)
        }
    }
}
