package com.example.quiz.api

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption

private val serverQuestionsFile: Path = runtimeDataFile(".quiz-questions.json")

object QuestionsStore {
    private val lock = Any()

    fun readQuestionsJson(): String = synchronized(lock) {
        if (Files.exists(serverQuestionsFile)) {
            return@synchronized Files.readString(serverQuestionsFile)
        }

        val defaultFile = listOf(
            Path.of(System.getProperty("user.dir"), "src/jsMain/resources/public/data/questions.json"),
            Path.of(System.getProperty("user.dir"), "build/processedResources/js/main/public/data/questions.json"),
            Path.of(System.getProperty("user.dir"), "build/dist/js/productionExecutable/public/data/questions.json"),
        ).firstOrNull { Files.exists(it) }

        defaultFile?.let { Files.readString(it) } ?: "[]"
    }

    fun saveQuestionsJson(source: String): Boolean = synchronized(lock) {
        if (!isValidQuestionArray(source)) return@synchronized false
        Files.writeString(
            serverQuestionsFile,
            source,
            StandardOpenOption.CREATE,
            StandardOpenOption.TRUNCATE_EXISTING,
            StandardOpenOption.WRITE,
        )
        true
    }

    private fun isValidQuestionArray(source: String): Boolean = QuestionArrayValidator(source).parse()
}

private class QuestionArrayValidator(private val source: String) {
    private var index = 0

    fun parse(): Boolean {
        skipWhitespace()
        if (!consume('[')) return false
        skipWhitespace()
        if (consume(']')) return isComplete()

        while (true) {
            if (!parseQuestionObject()) return false
            skipWhitespace()
            if (consume(']')) return isComplete()
            if (!consume(',')) return false
        }
    }

    private fun parseQuestionObject(): Boolean {
        skipWhitespace()
        if (!consume('{')) return false
        var q: String? = null
        var a: String? = null
        skipWhitespace()

        if (consume('}')) return false

        while (true) {
            val key = parseString() ?: return false
            skipWhitespace()
            if (!consume(':')) return false
            skipWhitespace()

            when (key) {
                "q" -> q = parseString() ?: return false
                "a" -> a = parseString() ?: return false
                else -> if (!skipValue()) return false
            }

            skipWhitespace()
            if (consume('}')) {
                return !q.isNullOrBlank() && !a.isNullOrBlank()
            }
            if (!consume(',')) return false
            skipWhitespace()
        }
    }

    private fun skipValue(): Boolean {
        skipWhitespace()
        val next = peek()
        return when {
            next == '"' -> parseString() != null
            next == '{' -> skipObject()
            next == '[' -> skipArray()
            next == 't' -> consumeLiteral("true")
            next == 'f' -> consumeLiteral("false")
            next == 'n' -> consumeLiteral("null")
            next == '-' || (next != null && next in '0'..'9') -> skipNumber()
            else -> false
        }
    }

    private fun skipObject(): Boolean {
        if (!consume('{')) return false
        skipWhitespace()
        if (consume('}')) return true

        while (true) {
            if (parseString() == null) return false
            skipWhitespace()
            if (!consume(':')) return false
            if (!skipValue()) return false
            skipWhitespace()
            if (consume('}')) return true
            if (!consume(',')) return false
            skipWhitespace()
        }
    }

    private fun skipArray(): Boolean {
        if (!consume('[')) return false
        skipWhitespace()
        if (consume(']')) return true

        while (true) {
            if (!skipValue()) return false
            skipWhitespace()
            if (consume(']')) return true
            if (!consume(',')) return false
            skipWhitespace()
        }
    }

    private fun skipNumber(): Boolean {
        val start = index
        consume('-')
        if (consume('0')) {
            // JSON numbers cannot contain leading zeroes, but the validator only needs a safe skip.
        } else if (peek() in '1'..'9') {
            while (peek() in '0'..'9') index += 1
        } else {
            return false
        }

        if (consume('.')) {
            if (peek() !in '0'..'9') return false
            while (peek() in '0'..'9') index += 1
        }

        if (peek() == 'e' || peek() == 'E') {
            index += 1
            if (peek() == '+' || peek() == '-') index += 1
            if (peek() !in '0'..'9') return false
            while (peek() in '0'..'9') index += 1
        }

        return index > start
    }

    private fun parseString(): String? {
        if (!consume('"')) return null
        val result = StringBuilder()

        while (index < source.length) {
            val char = source[index++]
            when (char) {
                '"' -> return result.toString()
                '\\' -> {
                    if (index >= source.length) return null
                    when (val escaped = source[index++]) {
                        '"', '\\', '/' -> result.append(escaped)
                        'b' -> result.append('\b')
                        'f' -> result.append('\u000c')
                        'n' -> result.append('\n')
                        'r' -> result.append('\r')
                        't' -> result.append('\t')
                        'u' -> {
                            val hex = source.substringOrNull(index, index + 4) ?: return null
                            val code = hex.toIntOrNull(16) ?: return null
                            result.append(code.toChar())
                            index += 4
                        }
                        else -> return null
                    }
                }
                else -> {
                    if (char < ' ') return null
                    result.append(char)
                }
            }
        }

        return null
    }

    private fun consumeLiteral(literal: String): Boolean {
        if (!source.startsWith(literal, index)) return false
        index += literal.length
        return true
    }

    private fun consume(expected: Char): Boolean {
        if (peek() != expected) return false
        index += 1
        return true
    }

    private fun skipWhitespace() {
        while (peek()?.isWhitespace() == true) index += 1
    }

    private fun isComplete(): Boolean {
        skipWhitespace()
        return index == source.length
    }

    private fun peek(): Char? = source.getOrNull(index)

    private fun String.substringOrNull(startIndex: Int, endIndex: Int): String? {
        if (startIndex < 0 || endIndex > length || startIndex > endIndex) return null
        return substring(startIndex, endIndex)
    }
}
