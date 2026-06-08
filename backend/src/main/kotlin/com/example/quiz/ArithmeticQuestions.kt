package com.example.quiz

object ArithmeticQuestionGenerator {
    private val allQuestions: List<ArithmeticQuestion> by lazy { buildQuestions() }
    private val allQuestionKeys: Set<String> by lazy { allQuestions.mapTo(mutableSetOf()) { it.key } }

    fun questions(mode: ArithmeticMode): List<ArithmeticQuestion> {
        return when (mode) {
            ArithmeticMode.easy -> allQuestions.filter { it.difficulty == ArithmeticDifficulty.easy }
            ArithmeticMode.normal -> allQuestions.filter { it.difficulty == ArithmeticDifficulty.normal }
            ArithmeticMode.hard -> allQuestions.filter { it.difficulty == ArithmeticDifficulty.hard }
            ArithmeticMode.mix -> allQuestions
        }
    }

    fun isValidKey(key: String): Boolean = key in allQuestionKeys

    private fun buildQuestions(): List<ArithmeticQuestion> {
        val byKey = linkedMapOf<String, ArithmeticQuestion>()
        for (left in 1..100) {
            for (right in 1..100) {
                val sum = left + right
                if (sum <= 100) {
                    addAdditionQuestion(byKey, left, right, sum)
                }

                val difference = left - right
                if (difference >= 0) {
                    addSubtractionQuestion(byKey, left, right, difference)
                }
            }
        }
        return byKey.values.toList()
    }

    private fun addAdditionQuestion(
        byKey: MutableMap<String, ArithmeticQuestion>,
        left: Int,
        right: Int,
        sum: Int,
    ) {
        val difficulty = arithmeticDifficulty(left, right, sum, addition = true)
        val first = minOf(left, right)
        val second = maxOf(left, right)
        val displayFirst = if (first <= 10 && second > 10) second else first
        val displaySecond = if (first <= 10 && second > 10) first else second
        val key = "add:$first:$second"
        byKey.putIfAbsent(
            key,
            ArithmeticQuestion(
                key = key,
                text = "$displayFirst + $displaySecond",
                answer = sum.toString(),
                difficulty = difficulty,
            ),
        )
    }

    private fun addSubtractionQuestion(
        byKey: MutableMap<String, ArithmeticQuestion>,
        left: Int,
        right: Int,
        difference: Int,
    ) {
        val difficulty = arithmeticDifficulty(left, right, difference, addition = false)
        val key = "sub:$left:$right"
        byKey.putIfAbsent(
            key,
            ArithmeticQuestion(
                key = key,
                text = "$left - $right",
                answer = difference.toString(),
                difficulty = difficulty,
            ),
        )
    }

    private fun arithmeticDifficulty(
        left: Int,
        right: Int,
        result: Int,
        addition: Boolean,
    ): ArithmeticDifficulty {
        val easy = if (addition) {
            val smaller = minOf(left, right)
            val larger = maxOf(left, right)
            smaller <= 10 && sameTenWindow(larger, result)
        } else {
            right <= 10 && sameTenWindow(left, result)
        }
        if (easy) return ArithmeticDifficulty.easy
        return if (addition) {
            if ((left % 10) + (right % 10) >= 10) ArithmeticDifficulty.hard else ArithmeticDifficulty.normal
        } else {
            if ((left % 10) < (right % 10)) ArithmeticDifficulty.hard else ArithmeticDifficulty.normal
        }
    }

    private fun sameTenWindow(first: Int, second: Int): Boolean {
        val low = minOf(first, second)
        val high = maxOf(first, second)
        return (0..90 step 10).any { start ->
            low >= start && high <= start + 10
        }
    }
}
