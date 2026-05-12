package com.example.quiz.api

import com.example.quiz.shared.QuestionStats

private fun StringBuilder.appendJsonString(value: String) {
    append('"')
    value.forEach { char ->
        when (char) {
            '\\' -> append("\\\\")
            '"' -> append("\\\"")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            else -> append(char)
        }
    }
    append('"')
}

private fun QuestionStats.toJson(): String =
    """{"correct":$correct,"wrong":$wrong,"timeout":$timeout}"""

fun statsSnapshotJson(statsByKey: Map<String, QuestionStats>): String = buildString {
    append("""{"statsByKey":{""")
    statsByKey.entries.forEachIndexed { index, (key, stats) ->
        if (index > 0) append(',')
        appendJsonString(key)
        append(':')
        append(stats.toJson())
    }
    append("}}")
}

fun answerResultJson(key: String, stats: QuestionStats): String = buildString {
    append("""{"key":""")
    appendJsonString(key)
    append(""","stats":""")
    append(stats.toJson())
    append('}')
}

fun readJsonString(json: String, name: String): String? {
    val match = Regex(""""${Regex.escape(name)}"\s*:\s*"((?:\\.|[^"\\])*)"""").find(json) ?: return null
    return unescapeJsonString(match.groupValues[1])
}

fun readJsonBoolean(json: String, name: String): Boolean? {
    val match = Regex(""""${Regex.escape(name)}"\s*:\s*(true|false)""").find(json) ?: return null
    return match.groupValues[1] == "true"
}

private fun unescapeJsonString(value: String): String = buildString {
    var escaping = false
    value.forEach { char ->
        if (escaping) {
            append(
                when (char) {
                    'n' -> '\n'
                    'r' -> '\r'
                    't' -> '\t'
                    else -> char
                }
            )
            escaping = false
        } else if (char == '\\') {
            escaping = true
        } else {
            append(char)
        }
    }
}
