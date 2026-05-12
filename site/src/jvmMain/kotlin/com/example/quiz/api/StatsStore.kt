package com.example.quiz.api

import com.example.quiz.shared.QuestionStats
import com.example.quiz.shared.questionKey
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.util.Base64

private val statsFile: Path = runtimeDataFile(".quiz-stats.tsv")

object StatsStore {
    private val lock = Any()
    private var statsByKey: MutableMap<String, QuestionStats> = load().toMutableMap()

    fun snapshot(): Map<String, QuestionStats> = synchronized(lock) {
        statsByKey.toMap()
    }

    fun record(q: String, a: String, correct: Boolean, timedOut: Boolean): Pair<String, QuestionStats> = synchronized(lock) {
        val key = questionKey(q, a)
        val previous = statsByKey[key] ?: QuestionStats()
        val next = when {
            correct -> previous.copy(correct = previous.correct + 1)
            timedOut -> previous.copy(timeout = previous.timeout + 1)
            else -> previous.copy(wrong = previous.wrong + 1)
        }
        statsByKey[key] = next
        save()
        key to next
    }

    private fun load(): Map<String, QuestionStats> {
        if (!Files.exists(statsFile)) return emptyMap()
        return Files.readAllLines(statsFile).mapNotNull { line ->
            val parts = line.split('\t')
            if (parts.size != 4) return@mapNotNull null
            val key = runCatching {
                String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8)
            }.getOrNull() ?: return@mapNotNull null
            val correct = parts[1].toIntOrNull() ?: return@mapNotNull null
            val wrong = parts[2].toIntOrNull() ?: return@mapNotNull null
            val timeout = parts[3].toIntOrNull() ?: return@mapNotNull null
            key to QuestionStats(correct = correct, wrong = wrong, timeout = timeout)
        }.toMap()
    }

    private fun save() {
        val parent = statsFile.parent
        if (parent != null) Files.createDirectories(parent)
        val content = statsByKey.entries.joinToString(separator = "\n", postfix = "\n") { (key, stats) ->
            val encodedKey = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(key.toByteArray(StandardCharsets.UTF_8))
            "$encodedKey\t${stats.correct}\t${stats.wrong}\t${stats.timeout}"
        }
        Files.writeString(
            statsFile,
            content,
            StandardOpenOption.CREATE,
            StandardOpenOption.TRUNCATE_EXISTING,
            StandardOpenOption.WRITE,
        )
    }
}
