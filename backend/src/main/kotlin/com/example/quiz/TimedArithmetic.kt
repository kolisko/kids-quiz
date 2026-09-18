package com.example.quiz

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import java.sql.Connection
import java.util.UUID

const val timedArithmeticMenuKey = "tests.math.timed-arithmetic"
private val timedJson = Json { ignoreUnknownKeys = true }

@Serializable
data class TimedArithmeticQuestion(val key: String, val text: String, val answer: Int)

@Serializable
data class TimedArithmeticLevel(
    val level: Int,
    val seconds: Int,
    val record: Int,
    val questions: List<TimedArithmeticQuestion>,
)

@Serializable
data class TimedArithmeticSummary(
    val levels: List<TimedArithmeticLevel>,
    val totalRecord: Int,
    val superboxCount: Int,
)

@Serializable
data class TimedArithmeticStartRequest(val requestId: String)

@Serializable
data class TimedArithmeticRun(
    val id: String,
    val startsAt: Long,
    val serverNow: Long,
    val summary: TimedArithmeticSummary,
)

@Serializable
data class TimedArithmeticAttempt(val key: String, val correct: Boolean, val elapsedMs: Long)

@Serializable
data class TimedArithmeticFinishRequest(val levels: List<List<TimedArithmeticAttempt>>)

@Serializable
data class TimedArithmeticLevelResult(
    val level: Int,
    val seconds: Int,
    val correct: Int,
    val wrong: Int,
    val previousRecord: Int,
    val record: Int,
    val trophy: TrophyItem? = null,
)

@Serializable
data class TimedArithmeticResult(
    val runId: String,
    val levels: List<TimedArithmeticLevelResult>,
    val total: Int,
    val previousTotalRecord: Int,
    val totalRecord: Int,
    val superboxAwarded: Boolean,
    val superboxCount: Int,
)

object TimedArithmeticQuestions {
    private val pools = (1..3).associateWith { level ->
        val questions = linkedMapOf<String, TimedArithmeticQuestion>()
        for (left in 1..20) for (right in 1..20) {
            val sum = left + right
            val difference = left - right
            val addition = when (level) {
                1 -> sum <= 10
                2 -> left >= 10 && sum <= 20
                else -> left < 10 && right < 10 && sum > 10
            }
            val subtraction = when (level) {
                1 -> left <= 10 && difference >= 0
                2 -> left >= 10 && difference >= 10
                else -> left in 11..19 && right < 10 && difference in 1..9
            }
            if (addition) {
                val key = "add:${minOf(left, right)}:${maxOf(left, right)}"
                questions.putIfAbsent(key, TimedArithmeticQuestion(key, "$left + $right", sum))
            }
            if (subtraction) {
                val key = "sub:$left:$right"
                questions[key] = TimedArithmeticQuestion(key, "$left − $right", difference)
            }
        }
        questions.values.toList()
    }

    fun forLevel(level: Int): List<TimedArithmeticQuestion> = pools.getValue(level)
}

fun validTimedArithmeticSeconds(seconds: List<Int>): Boolean = seconds.size == 3 && seconds.all { it in 10..600 }

fun Connection.addTimedArithmetic() {
    createStatement().use { statement ->
        statement.execute("ALTER TABLE user_settings ADD COLUMN timed_arithmetic_seconds TEXT NOT NULL DEFAULT '[120,120,120]'")
        statement.execute("""
            CREATE TABLE timed_arithmetic_runs (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                starts_at_ms INTEGER NOT NULL,
                seconds_json TEXT NOT NULL,
                result_json TEXT,
                completed_at TEXT
            )
        """.trimIndent())
        statement.execute("CREATE INDEX timed_arithmetic_runs_user ON timed_arithmetic_runs(user_id)")
        statement.execute("""
            CREATE TABLE timed_arithmetic_records (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                level INTEGER NOT NULL CHECK(level BETWEEN 0 AND 3),
                duration_key TEXT NOT NULL,
                score INTEGER NOT NULL CHECK(score >= 0),
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(user_id, level, duration_key)
            )
        """.trimIndent())
        statement.execute("""
            CREATE TABLE superboxes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                source_run_id TEXT NOT NULL UNIQUE REFERENCES timed_arithmetic_runs(id),
                acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """.trimIndent())
        statement.execute("CREATE INDEX superboxes_user ON superboxes(user_id)")
    }
}

object TimedArithmeticStore {
    fun summary(userId: Long): TimedArithmeticSummary = Database.useConnection {
        it.timedArithmeticSummary(userId, it.readAppSettings(userId).timedArithmeticSeconds)
    }

    fun start(userId: Long, requestId: String): TimedArithmeticRun = Database.useConnection { connection ->
        require(runCatching { UUID.fromString(requestId).toString() == requestId }.getOrDefault(false)) { "invalid_request_id" }
        val existing = connection.readTimedRun(userId, requestId)
        if (existing != null) {
            require(existing.result == null) { "run_already_finished" }
            return@useConnection TimedArithmeticRun(requestId, existing.startsAt, System.currentTimeMillis(), connection.timedArithmeticSummary(userId, existing.seconds))
        }
        require(connection.readAppSettings(userId).hiddenTestMenuKeys.none {
            timedArithmeticMenuKey == it || timedArithmeticMenuKey.startsWith("$it.")
        }) { "test_hidden" }
        val seconds = connection.readAppSettings(userId).timedArithmeticSeconds
        val startsAt = System.currentTimeMillis() + 3000
        connection.transaction {
            // A new game replaces only this user's abandoned, unfinished game.
            prepareStatement("DELETE FROM timed_arithmetic_runs WHERE user_id = ? AND result_json IS NULL").use {
                it.setLong(1, userId)
                it.executeUpdate()
            }
            prepareStatement("INSERT INTO timed_arithmetic_runs(id, user_id, starts_at_ms, seconds_json) VALUES(?, ?, ?, ?)").use {
                it.setString(1, requestId)
                it.setLong(2, userId)
                it.setLong(3, startsAt)
                it.setString(4, timedJson.encodeToString(seconds))
                it.executeUpdate()
            }
        }
        TimedArithmeticRun(requestId, startsAt, System.currentTimeMillis(), connection.timedArithmeticSummary(userId, seconds))
    }

    fun finish(userId: Long, id: String, request: TimedArithmeticFinishRequest): TimedArithmeticResult = Database.useConnection { connection ->
        val run = connection.readTimedRun(userId, id) ?: throw IllegalArgumentException("run_not_found")
        // The stored result is also the idempotency receipt for retries and double submissions.
        run.result?.let { return@useConnection timedJson.decodeFromString<TimedArithmeticResult>(it) }
        val endAt = run.startsAt + run.seconds.sum() * 1000L
        require(System.currentTimeMillis() >= endAt) { "run_not_finished" }
        require(request.levels.size == 3) { "invalid_levels" }
        var offset = 0L
        request.levels.forEachIndexed { index, attempts ->
            require(attempts.size <= run.seconds[index] * 5) { "too_many_answers" }
            val keys = TimedArithmeticQuestions.forLevel(index + 1).mapTo(mutableSetOf()) { it.key }
            var previousTime = offset - 1
            var previousKey: String? = null
            val deadline = offset + run.seconds[index] * 1000L
            attempts.forEach {
                require(it.key in keys && it.key != previousKey) { "invalid_question" }
                require(it.elapsedMs in offset until deadline && it.elapsedMs > previousTime) { "invalid_answer_time" }
                previousTime = it.elapsedMs
                previousKey = it.key
            }
            offset = deadline
        }
        var result: TimedArithmeticResult? = null
        connection.transaction {
            val levels = request.levels.mapIndexed { index, attempts ->
                val level = index + 1
                val seconds = run.seconds[index]
                val score = attempts.count { it.correct }
                val old = timedRecord(userId, level, seconds.toString())
                var trophy: TrophyItem? = null
                if (score > old) {
                    storeTimedRecord(userId, level, seconds.toString(), score)
                    val key = TrophyAnimalService.nextUnwonV2AnimalKey(readTrophyKeys(userId))
                        ?: throw IllegalStateException("trophy_pool_exhausted")
                    insertTrophy(userId, key)
                    trophy = readTrophies(userId).first { it.animalKey == key }
                }
                TimedArithmeticLevelResult(level, seconds, score, attempts.size - score, old, maxOf(old, score), trophy)
            }
            val total = levels.sumOf { it.correct }
            val durationKey = run.seconds.joinToString(",")
            val oldTotal = timedRecord(userId, 0, durationKey)
            if (total > oldTotal) {
                storeTimedRecord(userId, 0, durationKey, total)
                prepareStatement("INSERT INTO superboxes(user_id, source_run_id) VALUES(?, ?)").use {
                    it.setLong(1, userId)
                    it.setString(2, id)
                    it.executeUpdate()
                }
            }
            val saved = TimedArithmeticResult(id, levels, total, oldTotal, maxOf(oldTotal, total), total > oldTotal, superboxCount(userId))
            prepareStatement("UPDATE timed_arithmetic_runs SET result_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").use {
                it.setString(1, timedJson.encodeToString(saved))
                it.setString(2, id)
                it.setLong(3, userId)
                it.executeUpdate()
            }
            result = saved
        }
        result!!
    }
}

private data class StoredTimedRun(val startsAt: Long, val seconds: List<Int>, val result: String?)

private fun Connection.readTimedRun(userId: Long, id: String): StoredTimedRun? =
    prepareStatement("SELECT starts_at_ms, seconds_json, result_json FROM timed_arithmetic_runs WHERE id = ? AND user_id = ?").use {
        it.setString(1, id)
        it.setLong(2, userId)
        it.executeQuery().use { rows ->
            if (!rows.next()) null else StoredTimedRun(rows.getLong(1), timedJson.decodeFromString(rows.getString(2)), rows.getString(3))
        }
    }

fun Connection.timedArithmeticSummary(userId: Long, seconds: List<Int>) = TimedArithmeticSummary(
    levels = seconds.mapIndexed { index, limit ->
        TimedArithmeticLevel(index + 1, limit, timedRecord(userId, index + 1, limit.toString()), TimedArithmeticQuestions.forLevel(index + 1))
    },
    totalRecord = timedRecord(userId, 0, seconds.joinToString(",")),
    superboxCount = superboxCount(userId),
)

private fun Connection.timedRecord(userId: Long, level: Int, durationKey: String): Int =
    prepareStatement("SELECT score FROM timed_arithmetic_records WHERE user_id = ? AND level = ? AND duration_key = ?").use {
        it.setLong(1, userId)
        it.setInt(2, level)
        it.setString(3, durationKey)
        it.executeQuery().use { rows -> if (rows.next()) rows.getInt(1) else 0 }
    }

private fun Connection.storeTimedRecord(userId: Long, level: Int, durationKey: String, score: Int) {
    prepareStatement("""
        INSERT INTO timed_arithmetic_records(user_id, level, duration_key, score) VALUES(?, ?, ?, ?)
        ON CONFLICT(user_id, level, duration_key) DO UPDATE SET score = excluded.score, updated_at = CURRENT_TIMESTAMP
    """.trimIndent()).use {
        it.setLong(1, userId)
        it.setInt(2, level)
        it.setString(3, durationKey)
        it.setInt(4, score)
        it.executeUpdate()
    }
}

private fun Connection.superboxCount(userId: Long): Int =
    prepareStatement("SELECT COUNT(*) FROM superboxes WHERE user_id = ?").use {
        it.setLong(1, userId)
        it.executeQuery().use { rows -> rows.next(); rows.getInt(1) }
    }
