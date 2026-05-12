package com.example.quiz.api

import com.example.quiz.shared.Question
import com.example.quiz.shared.QuestionStats
import com.example.quiz.shared.questionKey
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.sql.Connection
import java.sql.DriverManager
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Base64

private val migrationJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
}

private val backupTimestampFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyyMMddHHmmss").withZone(ZoneOffset.UTC)

internal object Database {
    fun <T> useConnection(block: (Connection) -> T): T {
        DatabaseMigrator.ensureMigrated()
        return openConnection().use(block)
    }

    internal fun openConnection(): Connection {
        val dbFile = runtimeDatabaseFile()
        dbFile.parent?.let { Files.createDirectories(it) }
        Class.forName("org.sqlite.JDBC")
        return DriverManager.getConnection("jdbc:sqlite:${dbFile.toAbsolutePath()}").also { connection ->
            connection.createStatement().use { statement ->
                statement.execute("PRAGMA foreign_keys = ON")
                statement.execute("PRAGMA busy_timeout = 5000")
            }
        }
    }
}

internal object DatabaseMigrator {
    private val lock = Any()
    @Volatile
    private var migrated = false

    fun ensureMigrated() {
        if (!migrated) migrate(backupExistingDatabase = false)
    }

    fun migrate(backupExistingDatabase: Boolean) = synchronized(lock) {
        if (migrated) return@synchronized
        val dbFile = runtimeDatabaseFile()
        dbFile.parent?.let { Files.createDirectories(it) }
        if (backupExistingDatabase && Files.exists(dbFile)) {
            backupDatabase(dbFile)
        }

        Database.openConnection().use { connection ->
            connection.createMigrationsTable()
            val applied = connection.appliedMigrationVersions()
            if (1 !in applied) {
                connection.transaction {
                    createCoreSchema()
                    recordMigration(1, "create_schema")
                }
            }
            if (2 !in applied) {
                connection.transaction {
                    importLegacyFiles()
                }
                archiveLegacyFiles()
                connection.transaction {
                    recordMigration(2, "import_legacy_files")
                }
            }
        }
        migrated = true
    }

    private fun backupDatabase(dbFile: Path) {
        val backupDir = runtimeDataFile("backups")
        Files.createDirectories(backupDir)
        val backupFile = backupDir.resolve("kids-quiz.sqlite.before-migrate-${timestamp()}.bak")
        Files.copy(dbFile, backupFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.COPY_ATTRIBUTES)
    }

    private fun Connection.createMigrationsTable() {
        createStatement().use { statement ->
            statement.executeUpdate(
                """
                CREATE TABLE IF NOT EXISTS _schema_migrations (
                    version INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """.trimIndent(),
            )
        }
    }

    private fun Connection.createCoreSchema() {
        createStatement().use { statement ->
            statement.executeUpdate(
                """
                CREATE TABLE IF NOT EXISTS questions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    q TEXT NOT NULL,
                    a TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(q, a)
                )
                """.trimIndent(),
            )
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_questions_sort_order ON questions(sort_order, id)")
            statement.executeUpdate(
                """
                CREATE TABLE IF NOT EXISTS question_stats (
                    question_key TEXT PRIMARY KEY,
                    q TEXT NOT NULL,
                    a TEXT NOT NULL,
                    correct INTEGER NOT NULL DEFAULT 0 CHECK(correct >= 0),
                    wrong INTEGER NOT NULL DEFAULT 0 CHECK(wrong >= 0),
                    timeout INTEGER NOT NULL DEFAULT 0 CHECK(timeout >= 0),
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """.trimIndent(),
            )
        }
    }

    private fun Connection.importLegacyFiles() {
        val questionsFile = runtimeDataFile(".quiz-questions.json")
        if (Files.exists(questionsFile)) {
            val questions = parseQuestionsJson(Files.readString(questionsFile))
            replaceQuestions(questions)
        }

        val statsFile = runtimeDataFile(".quiz-stats.tsv")
        if (Files.exists(statsFile)) {
            setStats(parseLegacyStats(Files.readAllLines(statsFile)))
        }
    }

    private fun parseQuestionsJson(source: String): List<Question> {
        val questions = migrationJson.decodeFromString<List<Question>>(source)
        require(questions.all { it.q.isNotBlank() && it.a.isNotBlank() }) {
            "Legacy questions contain an empty q or a value."
        }
        return questions
    }

    private fun parseLegacyStats(lines: List<String>): Map<String, QuestionStats> {
        return lines.mapNotNull { line ->
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

    private fun archiveLegacyFiles() {
        val legacyFiles = listOf(runtimeDataFile(".quiz-questions.json"), runtimeDataFile(".quiz-stats.tsv"))
            .filter { Files.exists(it) }
        if (legacyFiles.isEmpty()) return

        val backupDir = runtimeDataFile("backups").resolve("legacy-files-${timestamp()}")
        Files.createDirectories(backupDir)
        legacyFiles.forEach { file ->
            Files.move(file, backupDir.resolve(file.fileName), StandardCopyOption.REPLACE_EXISTING)
        }
    }

    private fun Connection.appliedMigrationVersions(): Set<Int> {
        return createStatement().use { statement ->
            statement.executeQuery("SELECT version FROM _schema_migrations").use { rows ->
                buildSet {
                    while (rows.next()) add(rows.getInt("version"))
                }
            }
        }
    }

    private fun Connection.recordMigration(version: Int, name: String) {
        prepareStatement("INSERT INTO _schema_migrations(version, name) VALUES(?, ?)").use { statement ->
            statement.setInt(1, version)
            statement.setString(2, name)
            statement.executeUpdate()
        }
    }
}

internal fun Connection.transaction(block: Connection.() -> Unit) {
    val previousAutoCommit = autoCommit
    autoCommit = false
    try {
        block()
        commit()
    } catch (throwable: Throwable) {
        rollback()
        throw throwable
    } finally {
        autoCommit = previousAutoCommit
    }
}

internal fun Connection.readQuestions(): List<Question> {
    return prepareStatement("SELECT q, a FROM questions ORDER BY sort_order, id").use { statement ->
        statement.executeQuery().use { rows ->
            buildList {
                while (rows.next()) {
                    add(Question(q = rows.getString("q"), a = rows.getString("a")))
                }
            }
        }
    }
}

internal fun Connection.replaceQuestions(questions: List<Question>) {
    prepareStatement("DELETE FROM questions").use { it.executeUpdate() }
    prepareStatement(
        """
        INSERT INTO questions(q, a, sort_order, updated_at)
        VALUES(?, ?, ?, CURRENT_TIMESTAMP)
        """.trimIndent(),
    ).use { statement ->
        questions.forEachIndexed { index, question ->
            statement.setString(1, question.q.trim())
            statement.setString(2, question.a.trim())
            statement.setInt(3, index)
            statement.addBatch()
        }
        statement.executeBatch()
    }
}

internal fun Connection.readStats(): Map<String, QuestionStats> {
    return prepareStatement("SELECT question_key, correct, wrong, timeout FROM question_stats").use { statement ->
        statement.executeQuery().use { rows ->
            buildMap {
                while (rows.next()) {
                    put(
                        rows.getString("question_key"),
                        QuestionStats(
                            correct = rows.getInt("correct"),
                            wrong = rows.getInt("wrong"),
                            timeout = rows.getInt("timeout"),
                        ),
                    )
                }
            }
        }
    }
}

internal fun Connection.recordStats(q: String, a: String, correct: Boolean, timedOut: Boolean): Pair<String, QuestionStats> {
    val key = questionKey(q, a)
    prepareStatement(
        """
        INSERT INTO question_stats(question_key, q, a, correct, wrong, timeout, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(question_key) DO UPDATE SET
            correct = question_stats.correct + excluded.correct,
            wrong = question_stats.wrong + excluded.wrong,
            timeout = question_stats.timeout + excluded.timeout,
            q = excluded.q,
            a = excluded.a,
            updated_at = CURRENT_TIMESTAMP
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, key)
        statement.setString(2, q.trim())
        statement.setString(3, a.trim())
        statement.setInt(4, if (correct) 1 else 0)
        statement.setInt(5, if (!correct && !timedOut) 1 else 0)
        statement.setInt(6, if (timedOut) 1 else 0)
        statement.executeUpdate()
    }
    return key to readStat(key)
}

internal fun Connection.setStats(statsByKey: Map<String, QuestionStats>) {
    prepareStatement(
        """
        INSERT INTO question_stats(question_key, q, a, correct, wrong, timeout, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(question_key) DO UPDATE SET
            q = excluded.q,
            a = excluded.a,
            correct = excluded.correct,
            wrong = excluded.wrong,
            timeout = excluded.timeout,
            updated_at = CURRENT_TIMESTAMP
        """.trimIndent(),
    ).use { statement ->
        statsByKey.forEach { (key, stats) ->
            val (q, a) = splitQuestionKey(key)
            statement.setString(1, key)
            statement.setString(2, q)
            statement.setString(3, a)
            statement.setInt(4, stats.correct)
            statement.setInt(5, stats.wrong)
            statement.setInt(6, stats.timeout)
            statement.addBatch()
        }
        statement.executeBatch()
    }
}

private fun Connection.readStat(key: String): QuestionStats {
    return prepareStatement(
        "SELECT correct, wrong, timeout FROM question_stats WHERE question_key = ?",
    ).use { statement ->
        statement.setString(1, key)
        statement.executeQuery().use { rows ->
            if (!rows.next()) return QuestionStats()
            QuestionStats(
                correct = rows.getInt("correct"),
                wrong = rows.getInt("wrong"),
                timeout = rows.getInt("timeout"),
            )
        }
    }
}

private fun splitQuestionKey(key: String): Pair<String, String> {
    val delimiter = "\n---answer---\n"
    val delimiterIndex = key.indexOf(delimiter)
    if (delimiterIndex < 0) return key to ""
    return key.substring(0, delimiterIndex) to key.substring(delimiterIndex + delimiter.length)
}

private fun timestamp(): String = backupTimestampFormatter.format(Instant.now())
