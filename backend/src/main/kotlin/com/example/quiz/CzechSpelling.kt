package com.example.quiz

import kotlinx.serialization.Serializable
import java.sql.Connection
import java.text.Normalizer
import java.util.Locale

const val czechSpellingMenuKey = "tests.czech.orthography"

@Serializable
data class CzechSpellingQuestion(
    val key: String,
    val word: String,
    val blankIndex: Int,
    val options: List<String>,
)

@Serializable
data class CzechSpellingStatsSnapshot(val statsByKey: Map<String, QuestionStats> = emptyMap())

@Serializable
data class CzechSpellingSessionResult(val key: String, val correct: Boolean)

@Serializable
data class CzechSpellingSessionRequest(val results: List<CzechSpellingSessionResult> = emptyList())

@Serializable
data class CzechSpellingWords(val rawWords: String)

object CzechSpellingQuestions {
    // One missing letter per question. Avoid words such as kůra/kúra, vír/výr or byl/bil,
    // whose spelling cannot be decided without a sentence. Short i/y only.
    private val defaultGroups = listOf(
        "ú" to "úkol únor úterý ústa úsměv úraz úl úhoř údolí úklid úroda úkryt úspora úspěch úcta útěk útok úvod úpatí únava",
        "ů" to "dům stůl kůň dvůr vůz nůž sůl hůl půda růže kůže můra bůh půlka důlek důl průvan půjčka krůta trůn",
        "i" to "žirafa život šipka šiška ticho divadlo divoký rodina hodina kladivo činka čich čistota šikovný kniha cibule bič pilina silnice zima",
        "y" to "ryba rys rybník chyba chytat hyena dudy motyka tykadlo boty noty schody jahody brambory myš myslivec mlynář jazyk pytel sysel",
    )
    val defaultWords: String = defaultGroups.flatMap { (_, words) -> words.split(' ') }.joinToString(", ")

    fun parseWords(rawWords: String): List<String> {
        require(rawWords.length <= 40000) { "too_many_czech_spelling_words" }
        val words = rawWords.split(Regex("[,\\n\\r]"))
            .map { Normalizer.normalize(it.trim().lowercase(Locale.ROOT), Normalizer.Form.NFC) }
            .filter { it.isNotEmpty() }.distinct()
        require(words.isNotEmpty()) { "empty_czech_spelling_words" }
        require(words.size <= 500) { "too_many_czech_spelling_words" }
        require(words.all { it.length <= 40 && it.matches(Regex("[\\p{L}]+")) }) { "invalid_czech_spelling_words" }
        require(words.all { word -> word.any { it in "úůiy" } }) { "missing_czech_spelling_letters" }
        return words
    }

    fun fromWords(rawWords: String): List<CzechSpellingQuestion> = parseWords(rawWords).flatMap { word ->
        word.indices.filter { word[it] in "úůiy" }.map { index ->
            val letter = word[index]
            CzechSpellingQuestion(
                key = "$word:$index",
                word = word,
                blankIndex = index,
                options = if (letter == 'ú' || letter == 'ů') listOf("ú", "ů") else listOf("i", "y"),
            )
        }
    }
}

fun Connection.addCzechSpellingStats() {
    createStatement().use { statement ->
        statement.executeUpdate("""
            CREATE TABLE czech_spelling_stats (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                item_key TEXT NOT NULL,
                correct INTEGER NOT NULL DEFAULT 0 CHECK(correct >= 0),
                wrong INTEGER NOT NULL DEFAULT 0 CHECK(wrong >= 0),
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(user_id, item_key)
            )
        """.trimIndent())
        statement.executeUpdate("""
            CREATE TABLE czech_spelling_words (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                raw_words TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """.trimIndent())
    }
}

fun Connection.readCzechSpellingStats(userId: Long): Map<String, QuestionStats> =
    prepareStatement("SELECT item_key, correct, wrong FROM czech_spelling_stats WHERE user_id = ?").use { statement ->
        statement.setLong(1, userId)
        statement.executeQuery().use { rows ->
            buildMap {
                while (rows.next()) put(rows.getString("item_key"), QuestionStats(rows.getInt("correct"), rows.getInt("wrong")))
            }
        }
    }

object CzechSpellingStore {
    fun readWords(userId: Long): CzechSpellingWords = Database.useConnection { it.readCzechSpellingWords(userId) }

    fun replaceWords(userId: Long, rawWords: String): CzechSpellingWords {
        val normalized = CzechSpellingQuestions.parseWords(rawWords).joinToString(", ")
        return Database.useConnection { connection ->
            connection.prepareStatement("""
                INSERT INTO czech_spelling_words(user_id, raw_words) VALUES(?, ?)
                ON CONFLICT(user_id) DO UPDATE SET raw_words = excluded.raw_words, updated_at = CURRENT_TIMESTAMP
            """.trimIndent()).use { statement ->
                statement.setLong(1, userId)
                statement.setString(2, normalized)
                statement.executeUpdate()
            }
            connection.readCzechSpellingWords(userId)
        }
    }

    fun recordSession(userId: Long, results: List<CzechSpellingSessionResult>): CzechSpellingStatsSnapshot =
        Database.useConnection { connection ->
            val keys = CzechSpellingQuestions.fromWords(connection.readCzechSpellingWords(userId).rawWords).map { it.key }.toSet()
            require(results.all { it.key in keys }) { "invalid_czech_spelling_question" }
            connection.transaction {
                prepareStatement("""
                    INSERT INTO czech_spelling_stats(user_id, item_key, correct, wrong)
                    VALUES(?, ?, ?, ?)
                    ON CONFLICT(user_id, item_key) DO UPDATE SET
                        correct = czech_spelling_stats.correct + excluded.correct,
                        wrong = czech_spelling_stats.wrong + excluded.wrong,
                        updated_at = CURRENT_TIMESTAMP
                """.trimIndent()).use { statement ->
                    // Each word/letter position contributes once per test, even after repeated attempts.
                    results.groupBy { it.key }.forEach { (key, attempts) ->
                        val correct = attempts.all { it.correct }
                        statement.setLong(1, userId)
                        statement.setString(2, key)
                        statement.setInt(3, if (correct) 1 else 0)
                        statement.setInt(4, if (correct) 0 else 1)
                        statement.addBatch()
                    }
                    statement.executeBatch()
                }
            }
            CzechSpellingStatsSnapshot(connection.readCzechSpellingStats(userId))
        }
}

fun Connection.readCzechSpellingWords(userId: Long): CzechSpellingWords =
    prepareStatement("SELECT raw_words FROM czech_spelling_words WHERE user_id = ?").use { statement ->
        statement.setLong(1, userId)
        statement.executeQuery().use { rows ->
            CzechSpellingWords(if (rows.next()) rows.getString("raw_words") else CzechSpellingQuestions.defaultWords)
        }
    }
