package com.example.quiz

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.Serializable
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

private const val smallMultiplicationTestName = "Malá násobilka"
private const val largeMultiplicationTestName = "Velká násobilka"
private const val englishTestName = "Angličtina"
private const val defaultSecondsLimit = 30
private const val defaultTargetScore = 10
private val defaultAudioSource = AudioSource.browser_tts

@Serializable
private data class LegacyQuestion(val q: String, val a: String)

private data class ExistingQuestionRow(
    val id: Long,
    val testId: Long,
    val q: String,
    val a: String,
    val sortOrder: Int,
    val createdAt: String,
    val updatedAt: String,
)

private data class ExistingStatsRow(
    val testId: Long,
    val q: String,
    val correct: Int,
    val wrong: Int,
    val timeout: Int,
    val updatedAt: String,
)

private data class MigratedQuestion(
    val id: Long,
    val testId: Long,
    val q: String,
    val sortOrder: Int,
    val createdAt: String,
    var updatedAt: String,
    val answers: MutableList<String> = mutableListOf(),
)

private data class MigratedStats(
    var correct: Int = 0,
    var wrong: Int = 0,
    var timeout: Int = 0,
    var updatedAt: String = "",
)

object Database {
    fun <T> useConnection(block: (Connection) -> T): T {
        DatabaseMigrator.ensureMigrated()
        return openConnection().use(block)
    }

    fun openConnection(): Connection {
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

object DatabaseMigrator {
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
            if (3 !in applied) {
                connection.transaction {
                    createTestsSchema()
                    upsertDefaultTests()
                    migrateQuestionStorageToTests()
                    recordMigration(3, "add_tests")
                }
            }
            if (4 !in applied) {
                connection.transaction {
                    normalizeQuestionAnswers()
                    recordMigration(4, "normalize_question_answers")
                }
            }
            if (5 !in applied) {
                connection.transaction {
                    addQuestionStatsDirection()
                    recordMigration(5, "add_question_stats_direction")
                }
            }
            if (6 !in applied) {
                connection.transaction {
                    addEnglishSpelling()
                    recordMigration(6, "add_english_spelling")
                }
            }
            if (7 !in applied) {
                connection.transaction {
                    addLatestSpellingSet()
                    recordMigration(7, "add_latest_spelling_set")
                }
            }
            if (8 !in applied) {
                connection.transaction {
                    addAppSettings()
                    recordMigration(8, "add_app_settings")
                }
            }
            if (9 !in applied) {
                connection.transaction {
                    addAudioSourceSetting()
                    recordMigration(9, "add_audio_source_setting")
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

    private fun Connection.createTestsSchema() {
        createStatement().use { statement ->
            statement.executeUpdate(
                """
                CREATE TABLE IF NOT EXISTS tests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """.trimIndent(),
            )
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_tests_sort_order ON tests(sort_order, id)")
        }
    }

    private fun Connection.upsertDefaultTests() {
        prepareStatement(
            """
            INSERT INTO tests(name, sort_order, updated_at)
            VALUES(?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(name) DO UPDATE SET
                sort_order = excluded.sort_order,
                updated_at = CURRENT_TIMESTAMP
            """.trimIndent(),
        ).use { statement ->
            listOf(smallMultiplicationTestName to 0, largeMultiplicationTestName to 1).forEach { (name, order) ->
                statement.setString(1, name)
                statement.setInt(2, order)
                statement.addBatch()
            }
            statement.executeBatch()
        }
    }

    private fun Connection.migrateQuestionStorageToTests() {
        val smallTestId = requireTestId(smallMultiplicationTestName)
        createStatement().use { statement ->
            statement.executeUpdate("DROP TABLE IF EXISTS questions_new")
            statement.executeUpdate(
                """
                CREATE TABLE questions_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    test_id INTEGER NOT NULL,
                    q TEXT NOT NULL,
                    a TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE,
                    UNIQUE(test_id, q, a)
                )
                """.trimIndent(),
            )
            statement.executeUpdate(
                """
                INSERT INTO questions_new(id, test_id, q, a, sort_order, created_at, updated_at)
                SELECT id, $smallTestId, q, a, sort_order, created_at, updated_at
                FROM questions
                """.trimIndent(),
            )
            statement.executeUpdate("DROP TABLE questions")
            statement.executeUpdate("ALTER TABLE questions_new RENAME TO questions")
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_questions_test_sort_order ON questions(test_id, sort_order, id)")

            statement.executeUpdate("DROP TABLE IF EXISTS question_stats_new")
            statement.executeUpdate(
                """
                CREATE TABLE question_stats_new (
                    test_id INTEGER NOT NULL,
                    question_key TEXT NOT NULL,
                    q TEXT NOT NULL,
                    a TEXT NOT NULL,
                    correct INTEGER NOT NULL DEFAULT 0 CHECK(correct >= 0),
                    wrong INTEGER NOT NULL DEFAULT 0 CHECK(wrong >= 0),
                    timeout INTEGER NOT NULL DEFAULT 0 CHECK(timeout >= 0),
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE,
                    PRIMARY KEY(test_id, question_key)
                )
                """.trimIndent(),
            )
            statement.executeUpdate(
                """
                INSERT INTO question_stats_new(test_id, question_key, q, a, correct, wrong, timeout, updated_at)
                SELECT $smallTestId, question_key, q, a, correct, wrong, timeout, updated_at
                FROM question_stats
                """.trimIndent(),
            )
            statement.executeUpdate("DROP TABLE question_stats")
            statement.executeUpdate("ALTER TABLE question_stats_new RENAME TO question_stats")
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_question_stats_test ON question_stats(test_id)")
        }
    }

    private fun Connection.importLegacyFiles() {
        val questionsFile = runtimeDataFile(".quiz-questions.json")
        if (Files.exists(questionsFile)) {
            val questions = parseQuestionsJson(Files.readString(questionsFile))
            replaceLegacyQuestions(questions)
        }

        val statsFile = runtimeDataFile(".quiz-stats.tsv")
        if (Files.exists(statsFile)) {
            setStats(parseLegacyStats(Files.readAllLines(statsFile)))
        }
    }

    private fun parseQuestionsJson(source: String): List<LegacyQuestion> {
        val questions = migrationJson.decodeFromString<List<LegacyQuestion>>(source)
        require(questions.all { it.q.isNotBlank() && it.a.isNotBlank() }) {
            "Legacy questions contain an empty q or a value."
        }
        return questions
    }

    private fun Connection.normalizeQuestionAnswers() {
        val questionRows = readExistingQuestionRows()
        val statsRows = readExistingStatsRows()
        val migratedQuestions = linkedMapOf<Pair<Long, String>, MigratedQuestion>()

        questionRows.forEach { row ->
            val key = row.testId to row.q.trim()
            val question = migratedQuestions.getOrPut(key) {
                MigratedQuestion(
                    id = row.id,
                    testId = row.testId,
                    q = row.q.trim(),
                    sortOrder = row.sortOrder,
                    createdAt = row.createdAt,
                    updatedAt = row.updatedAt,
                )
            }
            if (row.updatedAt > question.updatedAt) {
                question.updatedAt = row.updatedAt
            }
            splitAnswers(row.a).forEach { answer ->
                if (answer !in question.answers) {
                    question.answers.add(answer)
                }
            }
        }

        createStatement().use { statement ->
            statement.executeUpdate("DROP TABLE IF EXISTS question_answers")
            statement.executeUpdate("DROP TABLE IF EXISTS question_stats_new")
            statement.executeUpdate("DROP TABLE IF EXISTS questions_new")
            statement.executeUpdate(
                """
                CREATE TABLE questions_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    test_id INTEGER NOT NULL,
                    q TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE,
                    UNIQUE(test_id, q)
                )
                """.trimIndent(),
            )
            statement.executeUpdate(
                """
                CREATE TABLE question_answers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    question_id INTEGER NOT NULL,
                    answer TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(question_id) REFERENCES questions_new(id) ON DELETE CASCADE,
                    UNIQUE(question_id, answer)
                )
                """.trimIndent(),
            )
            statement.executeUpdate(
                """
                CREATE TABLE question_stats_new (
                    question_id INTEGER PRIMARY KEY,
                    correct INTEGER NOT NULL DEFAULT 0 CHECK(correct >= 0),
                    wrong INTEGER NOT NULL DEFAULT 0 CHECK(wrong >= 0),
                    timeout INTEGER NOT NULL DEFAULT 0 CHECK(timeout >= 0),
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(question_id) REFERENCES questions_new(id) ON DELETE CASCADE
                )
                """.trimIndent(),
            )
        }

        insertMigratedQuestions(migratedQuestions.values)
        insertMigratedQuestionStats(migratedQuestions, statsRows)

        createStatement().use { statement ->
            statement.executeUpdate("DROP TABLE question_stats")
            statement.executeUpdate("DROP TABLE questions")
            statement.executeUpdate("ALTER TABLE questions_new RENAME TO questions")
            statement.executeUpdate("ALTER TABLE question_stats_new RENAME TO question_stats")
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_questions_test_sort_order ON questions(test_id, sort_order, id)")
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_question_answers_question_sort_order ON question_answers(question_id, sort_order, id)")
        }
    }

    private fun Connection.addQuestionStatsDirection() {
        createStatement().use { statement ->
            statement.executeUpdate("DROP TABLE IF EXISTS question_stats_new")
            statement.executeUpdate(
                """
                CREATE TABLE question_stats_new (
                    question_id INTEGER NOT NULL,
                    direction TEXT NOT NULL,
                    correct INTEGER NOT NULL DEFAULT 0 CHECK(correct >= 0),
                    wrong INTEGER NOT NULL DEFAULT 0 CHECK(wrong >= 0),
                    timeout INTEGER NOT NULL DEFAULT 0 CHECK(timeout >= 0),
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE,
                    PRIMARY KEY(question_id, direction)
                )
                """.trimIndent(),
            )
            statement.executeUpdate(
                """
                INSERT INTO question_stats_new(question_id, direction, correct, wrong, timeout, updated_at)
                SELECT question_id, '${PracticeDirection.product_to_factors.name}', correct, wrong, timeout, updated_at
                FROM question_stats
                """.trimIndent(),
            )
            statement.executeUpdate("DROP TABLE question_stats")
            statement.executeUpdate("ALTER TABLE question_stats_new RENAME TO question_stats")
        }
    }

    private fun Connection.addEnglishSpelling() {
        createStatement().use { statement ->
            statement.executeUpdate("ALTER TABLE tests ADD COLUMN test_type TEXT NOT NULL DEFAULT '${QuizTestType.multiplication.name}'")
            statement.executeUpdate(
                """
                INSERT INTO tests(name, test_type, sort_order, updated_at)
                VALUES('$englishTestName', '${QuizTestType.english.name}', 2, CURRENT_TIMESTAMP)
                ON CONFLICT(name) DO UPDATE SET
                    test_type = '${QuizTestType.english.name}',
                    sort_order = 2,
                    updated_at = CURRENT_TIMESTAMP
                """.trimIndent(),
            )
            statement.executeUpdate(
                """
                CREATE TABLE IF NOT EXISTS spelling_sets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    raw_words TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """.trimIndent(),
            )
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_spelling_sets_sort_order ON spelling_sets(sort_order, id)")
            statement.executeUpdate(
                """
                CREATE TABLE IF NOT EXISTS spelling_words (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    set_id INTEGER NOT NULL,
                    word TEXT NOT NULL,
                    normalized_word TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(set_id) REFERENCES spelling_sets(id) ON DELETE CASCADE
                )
                """.trimIndent(),
            )
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_spelling_words_set_sort_order ON spelling_words(set_id, sort_order, id)")
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_spelling_words_normalized ON spelling_words(normalized_word)")
            statement.executeUpdate(
                """
                CREATE TABLE IF NOT EXISTS spelling_word_stats (
                    normalized_word TEXT PRIMARY KEY,
                    correct INTEGER NOT NULL DEFAULT 0 CHECK(correct >= 0),
                    wrong INTEGER NOT NULL DEFAULT 0 CHECK(wrong >= 0),
                    timeout INTEGER NOT NULL DEFAULT 0 CHECK(timeout >= 0),
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """.trimIndent(),
            )
        }
    }

    private fun Connection.addLatestSpellingSet() {
        createStatement().use { statement ->
            statement.executeUpdate("ALTER TABLE spelling_sets ADD COLUMN is_latest INTEGER NOT NULL DEFAULT 0 CHECK(is_latest IN (0, 1))")
            statement.executeUpdate(
                """
                UPDATE spelling_sets
                SET is_latest = 1
                WHERE id = (
                    SELECT spelling_sets.id
                    FROM spelling_sets
                    WHERE EXISTS (
                        SELECT 1 FROM spelling_words
                        WHERE spelling_words.set_id = spelling_sets.id
                    )
                    ORDER BY sort_order DESC, id DESC
                    LIMIT 1
                )
                """.trimIndent(),
            )
        }
    }

    private fun Connection.addAppSettings() {
        createStatement().use { statement ->
            statement.executeUpdate(
                """
                CREATE TABLE IF NOT EXISTS app_settings (
                    id INTEGER PRIMARY KEY CHECK(id = 1),
                    seconds_limit INTEGER NOT NULL DEFAULT $defaultSecondsLimit CHECK(seconds_limit >= 1),
                    target_score INTEGER NOT NULL DEFAULT $defaultTargetScore CHECK(target_score >= 1),
                    audio_source TEXT NOT NULL DEFAULT '${defaultAudioSource.name}',
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """.trimIndent(),
            )
            statement.executeUpdate(
                """
                INSERT INTO app_settings(id, seconds_limit, target_score, audio_source, updated_at)
                VALUES(1, $defaultSecondsLimit, $defaultTargetScore, '${defaultAudioSource.name}', CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    seconds_limit = $defaultSecondsLimit,
                    updated_at = CURRENT_TIMESTAMP
                """.trimIndent(),
            )
        }
    }

    private fun Connection.addAudioSourceSetting() {
        createStatement().use { statement ->
            val columns = statement.executeQuery("PRAGMA table_info(app_settings)").use { rows ->
                buildList {
                    while (rows.next()) add(rows.getString("name"))
                }
            }
            if ("audio_source" !in columns) {
                statement.executeUpdate(
                    "ALTER TABLE app_settings ADD COLUMN audio_source TEXT NOT NULL DEFAULT '${defaultAudioSource.name}'",
                )
            }
            statement.executeUpdate(
                """
                UPDATE app_settings
                SET audio_source = '${defaultAudioSource.name}'
                WHERE audio_source IS NULL OR audio_source = ''
                """.trimIndent(),
            )
        }
    }

    private fun Connection.readExistingQuestionRows(): List<ExistingQuestionRow> {
        return createStatement().use { statement ->
            statement.executeQuery(
                """
                SELECT id, test_id, q, a, sort_order, created_at, updated_at
                FROM questions
                ORDER BY test_id, sort_order, id
                """.trimIndent(),
            ).use { rows ->
                buildList {
                    while (rows.next()) {
                        add(
                            ExistingQuestionRow(
                                id = rows.getLong("id"),
                                testId = rows.getLong("test_id"),
                                q = rows.getString("q"),
                                a = rows.getString("a"),
                                sortOrder = rows.getInt("sort_order"),
                                createdAt = rows.getString("created_at"),
                                updatedAt = rows.getString("updated_at"),
                            ),
                        )
                    }
                }
            }
        }
    }

    private fun Connection.readExistingStatsRows(): List<ExistingStatsRow> {
        return createStatement().use { statement ->
            statement.executeQuery(
                """
                SELECT test_id, q, correct, wrong, timeout, updated_at
                FROM question_stats
                ORDER BY test_id, q
                """.trimIndent(),
            ).use { rows ->
                buildList {
                    while (rows.next()) {
                        add(
                            ExistingStatsRow(
                                testId = rows.getLong("test_id"),
                                q = rows.getString("q"),
                                correct = rows.getInt("correct"),
                                wrong = rows.getInt("wrong"),
                                timeout = rows.getInt("timeout"),
                                updatedAt = rows.getString("updated_at"),
                            ),
                        )
                    }
                }
            }
        }
    }

    private fun Connection.insertMigratedQuestions(questions: Collection<MigratedQuestion>) {
        prepareStatement(
            """
            INSERT INTO questions_new(id, test_id, q, sort_order, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?)
            """.trimIndent(),
        ).use { statement ->
            questions.forEach { question ->
                statement.setLong(1, question.id)
                statement.setLong(2, question.testId)
                statement.setString(3, question.q)
                statement.setInt(4, question.sortOrder)
                statement.setString(5, question.createdAt)
                statement.setString(6, question.updatedAt)
                statement.addBatch()
            }
            statement.executeBatch()
        }
        prepareStatement(
            """
            INSERT INTO question_answers(question_id, answer, sort_order, updated_at)
            VALUES(?, ?, ?, CURRENT_TIMESTAMP)
            """.trimIndent(),
        ).use { statement ->
            questions.forEach { question ->
                question.answers.forEachIndexed { index, answer ->
                    statement.setLong(1, question.id)
                    statement.setString(2, answer)
                    statement.setInt(3, index)
                    statement.addBatch()
                }
            }
            statement.executeBatch()
        }
    }

    private fun Connection.insertMigratedQuestionStats(
        questions: Map<Pair<Long, String>, MigratedQuestion>,
        rows: List<ExistingStatsRow>,
    ) {
        val statsByQuestionId = linkedMapOf<Long, MigratedStats>()
        rows.forEach { row ->
            val question = questions[row.testId to row.q.trim()] ?: return@forEach
            val stats = statsByQuestionId.getOrPut(question.id) { MigratedStats(updatedAt = row.updatedAt) }
            stats.correct += row.correct
            stats.wrong += row.wrong
            stats.timeout += row.timeout
            if (row.updatedAt > stats.updatedAt) {
                stats.updatedAt = row.updatedAt
            }
        }

        prepareStatement(
            """
            INSERT INTO question_stats_new(question_id, correct, wrong, timeout, updated_at)
            VALUES(?, ?, ?, ?, ?)
            """.trimIndent(),
        ).use { statement ->
            statsByQuestionId.forEach { (questionId, stats) ->
                statement.setLong(1, questionId)
                statement.setInt(2, stats.correct)
                statement.setInt(3, stats.wrong)
                statement.setInt(4, stats.timeout)
                statement.setString(5, stats.updatedAt.ifBlank { timestamp() })
                statement.addBatch()
            }
            statement.executeBatch()
        }
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

fun Connection.transaction(block: Connection.() -> Unit) {
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

fun Connection.readTests(): List<QuizTest> {
    return prepareStatement(
        """
        SELECT
            tests.id,
            tests.name,
            tests.test_type,
            CASE
                WHEN tests.test_type = '${QuizTestType.english.name}' THEN (
                    SELECT COUNT(*) FROM spelling_sets
                    WHERE TRIM(raw_words) <> ''
                )
                ELSE COUNT(questions.id)
            END AS question_count
        FROM tests
        LEFT JOIN questions ON questions.test_id = tests.id
        GROUP BY tests.id, tests.name, tests.test_type, tests.sort_order
        ORDER BY tests.sort_order, tests.id
        """.trimIndent(),
    ).use { statement ->
        statement.executeQuery().use { rows ->
            buildList {
                while (rows.next()) {
                    add(
                        QuizTest(
                            id = rows.getLong("id"),
                            name = rows.getString("name"),
                            type = QuizTestType.valueOf(rows.getString("test_type")),
                            questionCount = rows.getInt("question_count"),
                        ),
                    )
                }
            }
        }
    }
}

fun Connection.readAppSettings(): AppSettings {
    ensureAppSettingsRow()
    return prepareStatement(
        """
        SELECT seconds_limit, target_score, audio_source
        FROM app_settings
        WHERE id = 1
        """.trimIndent(),
    ).use { statement ->
        statement.executeQuery().use { rows ->
            if (!rows.next()) return AppSettings()
            AppSettings(
                secondsLimit = rows.getInt("seconds_limit"),
                targetScore = rows.getInt("target_score"),
                audioSource = rows.getString("audio_source").toAudioSource(),
            )
        }
    }
}

fun Connection.replaceAppSettings(settings: AppSettings) {
    val secondsLimit = settings.secondsLimit.coerceAtLeast(1)
    val targetScore = settings.targetScore.coerceAtLeast(1)
    prepareStatement(
        """
        INSERT INTO app_settings(id, seconds_limit, target_score, audio_source, updated_at)
        VALUES(1, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            seconds_limit = excluded.seconds_limit,
            target_score = excluded.target_score,
            audio_source = excluded.audio_source,
            updated_at = CURRENT_TIMESTAMP
        """.trimIndent(),
    ).use { statement ->
        statement.setInt(1, secondsLimit)
        statement.setInt(2, targetScore)
        statement.setString(3, settings.audioSource.name)
        statement.executeUpdate()
    }
}

fun Connection.readSpellingSets(): List<SpellingSet> {
    return prepareStatement(
        """
        SELECT id, raw_words, is_latest
        FROM spelling_sets
        ORDER BY sort_order, id
        """.trimIndent(),
    ).use { statement ->
        statement.executeQuery().use { rows ->
            buildList {
                while (rows.next()) {
                    val setId = rows.getLong("id")
                    add(
                        SpellingSet(
                            id = setId,
                            rawWords = rows.getString("raw_words"),
                            isLatest = rows.getInt("is_latest") == 1,
                            words = readSpellingWords(setId),
                        ),
                    )
                }
            }
        }
    }
}

fun Connection.replaceSpellingSets(rawSets: List<String>, latestSetIndex: Int?) {
    val preparedSets = rawSets
        .mapIndexed { index, rawWords -> index to rawWords.trim() }
        .filter { (_, rawWords) -> rawWords.isNotBlank() }
    val selectedOriginalIndex = preparedSets
        .firstOrNull { (index, rawWords) -> index == latestSetIndex && parseSpellingWords(rawWords).isNotEmpty() }
        ?.first
        ?: preparedSets.lastOrNull { (_, rawWords) -> parseSpellingWords(rawWords).isNotEmpty() }?.first

    transaction {
        prepareStatement("DELETE FROM spelling_sets").use { it.executeUpdate() }
        prepareStatement(
            """
            INSERT INTO spelling_sets(raw_words, sort_order, is_latest, updated_at)
            VALUES(?, ?, ?, CURRENT_TIMESTAMP)
            """.trimIndent(),
        ).use { setStatement ->
            prepareStatement(
                """
                INSERT INTO spelling_words(set_id, word, normalized_word, sort_order, updated_at)
                VALUES(?, ?, ?, ?, CURRENT_TIMESTAMP)
                """.trimIndent(),
            ).use { wordStatement ->
                preparedSets.forEachIndexed { setIndex, (originalIndex, rawWords) ->
                        setStatement.setString(1, rawWords)
                        setStatement.setInt(2, setIndex)
                        setStatement.setInt(3, if (originalIndex == selectedOriginalIndex) 1 else 0)
                        setStatement.executeUpdate()

                        val setId = lastInsertRowId()
                        parseSpellingWords(rawWords).forEachIndexed { wordIndex, word ->
                            wordStatement.setLong(1, setId)
                            wordStatement.setString(2, word)
                            wordStatement.setString(3, normalizeSpellingWord(word))
                            wordStatement.setInt(4, wordIndex)
                            wordStatement.addBatch()
                        }
                    }
                wordStatement.executeBatch()
            }
        }
    }
}

fun Connection.readSpellingSession(mode: SpellingSessionMode): SpellingSession? {
    val modeClause = when (mode) {
        SpellingSessionMode.latest -> "spelling_sets.is_latest = 1"
        SpellingSessionMode.older -> "spelling_sets.is_latest = 0"
    }
    val orderClause = when (mode) {
        SpellingSessionMode.latest -> "spelling_sets.sort_order DESC, spelling_sets.id DESC"
        SpellingSessionMode.older -> "RANDOM()"
    }
    val setId = prepareStatement(
        """
        SELECT spelling_sets.id
        FROM spelling_sets
        WHERE $modeClause
        AND EXISTS (
            SELECT 1 FROM spelling_words
            WHERE spelling_words.set_id = spelling_sets.id
        )
        ORDER BY $orderClause
        LIMIT 1
        """.trimIndent(),
    ).use { statement ->
        statement.executeQuery().use { rows ->
            if (!rows.next()) return null
            rows.getLong("id")
        }
    }
    return SpellingSession(setId = setId, words = readSpellingWords(setId))
}

fun Connection.readSpellingStats(): Map<String, QuestionStats> {
    return prepareStatement(
        """
        SELECT normalized_word, correct, wrong, timeout
        FROM spelling_word_stats
        ORDER BY normalized_word
        """.trimIndent(),
    ).use { statement ->
        statement.executeQuery().use { rows ->
            buildMap {
                while (rows.next()) {
                    put(
                        rows.getString("normalized_word"),
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

fun Connection.recordSpellingStats(word: String, correct: Boolean, timedOut: Boolean): Pair<String, QuestionStats>? {
    val normalized = normalizeSpellingWord(word)
    if (normalized.isBlank() || !spellingWordExists(normalized)) {
        return null
    }
    prepareStatement(
        """
        INSERT INTO spelling_word_stats(normalized_word, correct, wrong, timeout, updated_at)
        VALUES(?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(normalized_word) DO UPDATE SET
            correct = spelling_word_stats.correct + excluded.correct,
            wrong = spelling_word_stats.wrong + excluded.wrong,
            timeout = spelling_word_stats.timeout + excluded.timeout,
            updated_at = CURRENT_TIMESTAMP
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, normalized)
        statement.setInt(2, if (correct) 1 else 0)
        statement.setInt(3, if (!correct && !timedOut) 1 else 0)
        statement.setInt(4, if (timedOut) 1 else 0)
        statement.executeUpdate()
    }
    return normalized to readSpellingStat(normalized)
}

fun Connection.testExists(testId: Long): Boolean {
    return prepareStatement("SELECT 1 FROM tests WHERE id = ?").use { statement ->
        statement.setLong(1, testId)
        statement.executeQuery().use { rows -> rows.next() }
    }
}

fun Connection.readQuestions(testId: Long): List<Question> {
    return prepareStatement(
        """
        SELECT id, q
        FROM questions
        WHERE test_id = ?
        ORDER BY sort_order, id
        """.trimIndent(),
    ).use { statement ->
        statement.setLong(1, testId)
        statement.executeQuery().use { rows ->
            buildList {
                while (rows.next()) {
                    val questionId = rows.getLong("id")
                    add(
                        Question(
                            id = questionId,
                            q = rows.getString("q"),
                            answers = readAnswers(questionId),
                        ),
                    )
                }
            }
        }
    }
}

private fun Connection.replaceLegacyQuestions(questions: List<LegacyQuestion>) {
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

fun Connection.readStats(testId: Long, direction: PracticeDirection): Map<Long, QuestionStats> {
    return prepareStatement(
        """
        SELECT question_stats.question_id, question_stats.correct, question_stats.wrong, question_stats.timeout
        FROM question_stats
        INNER JOIN questions ON questions.id = question_stats.question_id
        WHERE questions.test_id = ? AND question_stats.direction = ?
        """.trimIndent(),
    ).use { statement ->
        statement.setLong(1, testId)
        statement.setString(2, direction.name)
        statement.executeQuery().use { rows ->
            buildMap {
                while (rows.next()) {
                    put(
                        rows.getLong("question_id"),
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

fun Connection.recordStats(
    testId: Long,
    questionId: Long,
    correct: Boolean,
    timedOut: Boolean,
    direction: PracticeDirection,
): Pair<Long, QuestionStats>? {
    if (!questionBelongsToTest(testId, questionId)) {
        return null
    }
    prepareStatement(
        """
        INSERT INTO question_stats(question_id, direction, correct, wrong, timeout, updated_at)
        VALUES(?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(question_id, direction) DO UPDATE SET
            correct = question_stats.correct + excluded.correct,
            wrong = question_stats.wrong + excluded.wrong,
            timeout = question_stats.timeout + excluded.timeout,
            updated_at = CURRENT_TIMESTAMP
        """.trimIndent(),
    ).use { statement ->
        statement.setLong(1, questionId)
        statement.setString(2, direction.name)
        statement.setInt(3, if (correct) 1 else 0)
        statement.setInt(4, if (!correct && !timedOut) 1 else 0)
        statement.setInt(5, if (timedOut) 1 else 0)
        statement.executeUpdate()
    }
    return questionId to readStat(testId, questionId, direction)
}

fun Connection.setStats(statsByKey: Map<String, QuestionStats>) {
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

private fun Connection.readAnswers(questionId: Long): List<String> {
    return prepareStatement(
        "SELECT answer FROM question_answers WHERE question_id = ? ORDER BY sort_order, id",
    ).use { statement ->
        statement.setLong(1, questionId)
        statement.executeQuery().use { rows ->
            buildList {
                while (rows.next()) {
                    add(rows.getString("answer"))
                }
            }
        }
    }
}

private fun Connection.readSpellingWords(setId: Long): List<SpellingWord> {
    return prepareStatement(
        """
        SELECT id, word, normalized_word
        FROM spelling_words
        WHERE set_id = ?
        ORDER BY sort_order, id
        """.trimIndent(),
    ).use { statement ->
        statement.setLong(1, setId)
        statement.executeQuery().use { rows ->
            buildList {
                while (rows.next()) {
                    add(
                        SpellingWord(
                            id = rows.getLong("id"),
                            text = rows.getString("word"),
                            normalized = rows.getString("normalized_word"),
                        ),
                    )
                }
            }
        }
    }
}

fun Connection.readSpellingWordsForAudio(setId: Long): List<SpellingWord> = readSpellingWords(setId)

fun Connection.readSpellingWordForAudio(wordId: Long): SpellingWord? {
    return prepareStatement(
        """
        SELECT id, word, normalized_word
        FROM spelling_words
        WHERE id = ?
        """.trimIndent(),
    ).use { statement ->
        statement.setLong(1, wordId)
        statement.executeQuery().use { rows ->
            if (!rows.next()) return null
            SpellingWord(
                id = rows.getLong("id"),
                text = rows.getString("word"),
                normalized = rows.getString("normalized_word"),
            )
        }
    }
}

private fun Connection.lastInsertRowId(): Long {
    return createStatement().use { statement ->
        statement.executeQuery("SELECT last_insert_rowid()").use { rows ->
            require(rows.next()) { "Missing SQLite last_insert_rowid()." }
            rows.getLong(1)
        }
    }
}

private fun Connection.ensureAppSettingsRow() {
    prepareStatement(
        """
        INSERT INTO app_settings(id, seconds_limit, target_score, audio_source, updated_at)
        VALUES(1, $defaultSecondsLimit, $defaultTargetScore, '${defaultAudioSource.name}', CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO NOTHING
        """.trimIndent(),
    ).use { it.executeUpdate() }
}

private fun Connection.spellingWordExists(normalizedWord: String): Boolean {
    return prepareStatement("SELECT 1 FROM spelling_words WHERE normalized_word = ? LIMIT 1").use { statement ->
        statement.setString(1, normalizedWord)
        statement.executeQuery().use { rows -> rows.next() }
    }
}

private fun Connection.readSpellingStat(normalizedWord: String): QuestionStats {
    return prepareStatement(
        """
        SELECT correct, wrong, timeout
        FROM spelling_word_stats
        WHERE normalized_word = ?
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, normalizedWord)
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

private fun Connection.questionBelongsToTest(testId: Long, questionId: Long): Boolean {
    return prepareStatement("SELECT 1 FROM questions WHERE test_id = ? AND id = ?").use { statement ->
        statement.setLong(1, testId)
        statement.setLong(2, questionId)
        statement.executeQuery().use { rows -> rows.next() }
    }
}

private fun Connection.readStat(testId: Long, questionId: Long, direction: PracticeDirection): QuestionStats {
    return prepareStatement(
        """
        SELECT question_stats.correct, question_stats.wrong, question_stats.timeout
        FROM question_stats
        INNER JOIN questions ON questions.id = question_stats.question_id
        WHERE questions.test_id = ? AND question_stats.question_id = ? AND question_stats.direction = ?
        """.trimIndent(),
    ).use { statement ->
        statement.setLong(1, testId)
        statement.setLong(2, questionId)
        statement.setString(3, direction.name)
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

private fun Connection.requireTestId(name: String): Long {
    return prepareStatement("SELECT id FROM tests WHERE name = ?").use { statement ->
        statement.setString(1, name)
        statement.executeQuery().use { rows ->
            require(rows.next()) { "Missing quiz test: $name" }
            rows.getLong("id")
        }
    }
}

private fun splitQuestionKey(key: String): Pair<String, String> {
    val delimiter = "\n---answer---\n"
    val delimiterIndex = key.indexOf(delimiter)
    if (delimiterIndex < 0) return key to ""
    return key.substring(0, delimiterIndex) to key.substring(delimiterIndex + delimiter.length)
}

private fun splitAnswers(rawAnswer: String): List<String> {
    return rawAnswer.split(',')
        .map { it.trim() }
        .filter { it.isNotBlank() }
        .distinct()
        .ifEmpty { listOf(rawAnswer.trim()) }
}

private fun parseSpellingWords(rawWords: String): List<String> {
    return rawWords.split(',')
        .map { it.trim() }
        .filter { it.isNotBlank() }
}

private fun normalizeSpellingWord(word: String): String = word.trim().lowercase()

private fun String?.toAudioSource(): AudioSource {
    return AudioSource.entries.firstOrNull { it.name == this } ?: defaultAudioSource
}

private fun timestamp(): String = backupTimestampFormatter.format(Instant.now())
