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
private const val defaultCelebrationTapLimit = 100
private val defaultAudioSource = AudioSource.browser_tts
private val defaultFlipcardSource = FlipcardSource.all_words

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

private data class LegacyFlipcardRow(
    val word: String,
    val normalized: String,
    val sortOrder: Int,
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
                statement.execute("PRAGMA journal_mode = WAL")
                statement.execute("PRAGMA foreign_keys = ON")
                statement.execute("PRAGMA busy_timeout = 30000")
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
            if (10 !in applied) {
                connection.transaction {
                    addEnglishFlipcards()
                    recordMigration(10, "add_english_flipcards")
                }
            }
            if (11 !in applied) {
                connection.transaction {
                    addFlipcardSourceSetting()
                    recordMigration(11, "add_flipcard_source_setting")
                }
            }
            if (12 !in applied) {
                connection.transaction {
                    addMultilingualLanguageContent()
                    recordMigration(12, "add_multilingual_language_content")
                }
            }
            if (13 !in applied) {
                connection.transaction {
                    addFlipcardTranslationBackfillTracking()
                    recordMigration(13, "add_flipcard_translation_backfill_tracking")
                }
            }
            if (14 !in applied) {
                val words = connection.readEnglishAudioCacheMigrationWords()
                SpellingAudioService.migrateLegacyEnglishCache(words)
                connection.transaction {
                    recordMigration(14, "migrate_english_audio_cache_keys")
                }
            }
            if (15 !in applied) {
                connection.transaction {
                    addArtifactJobs()
                    recordMigration(15, "add_artifact_jobs")
                }
            }
            if (16 !in applied) {
                val wordsByLanguage = connection.readAudioCacheMigrationWordsByLanguage()
                SpellingAudioService.migrateInstructionlessCacheKeys(wordsByLanguage)
                connection.transaction {
                    recordMigration(16, "migrate_audio_cache_keys_without_instructions")
                }
            }
            if (17 !in applied) {
                connection.transaction {
                    addCelebrationTapLimitSetting()
                    recordMigration(17, "add_celebration_tap_limit_setting")
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
                    celebration_tap_limit INTEGER NOT NULL DEFAULT $defaultCelebrationTapLimit CHECK(celebration_tap_limit >= 0),
                    audio_source TEXT NOT NULL DEFAULT '${defaultAudioSource.name}',
                    flipcard_source TEXT NOT NULL DEFAULT '${defaultFlipcardSource.name}',
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """.trimIndent(),
            )
            statement.executeUpdate(
                """
                INSERT INTO app_settings(id, seconds_limit, target_score, celebration_tap_limit, audio_source, flipcard_source, updated_at)
                VALUES(1, $defaultSecondsLimit, $defaultTargetScore, $defaultCelebrationTapLimit, '${defaultAudioSource.name}', '${defaultFlipcardSource.name}', CURRENT_TIMESTAMP)
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

    private fun Connection.addFlipcardSourceSetting() {
        createStatement().use { statement ->
            val columns = statement.executeQuery("PRAGMA table_info(app_settings)").use { rows ->
                buildList {
                    while (rows.next()) add(rows.getString("name"))
                }
            }
            if ("flipcard_source" !in columns) {
                statement.executeUpdate(
                    "ALTER TABLE app_settings ADD COLUMN flipcard_source TEXT NOT NULL DEFAULT '${defaultFlipcardSource.name}'",
                )
            }
            statement.executeUpdate(
                """
                UPDATE app_settings
                SET flipcard_source = '${defaultFlipcardSource.name}'
                WHERE flipcard_source IS NULL OR flipcard_source = ''
                """.trimIndent(),
            )
        }
    }

    private fun Connection.addCelebrationTapLimitSetting() {
        createStatement().use { statement ->
            val columns = statement.executeQuery("PRAGMA table_info(app_settings)").use { rows ->
                buildList {
                    while (rows.next()) add(rows.getString("name"))
                }
            }
            if ("celebration_tap_limit" !in columns) {
                statement.executeUpdate(
                    "ALTER TABLE app_settings ADD COLUMN celebration_tap_limit INTEGER NOT NULL DEFAULT $defaultCelebrationTapLimit CHECK(celebration_tap_limit >= 0)",
                )
            }
            statement.executeUpdate(
                """
                UPDATE app_settings
                SET celebration_tap_limit = $defaultCelebrationTapLimit
                WHERE celebration_tap_limit IS NULL OR celebration_tap_limit < 0
                """.trimIndent(),
            )
        }
    }

    private fun Connection.addEnglishFlipcards() {
        createStatement().use { statement ->
            statement.executeUpdate(
                """
                CREATE TABLE IF NOT EXISTS flipcard_words (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    word TEXT NOT NULL,
                    normalized_word TEXT NOT NULL UNIQUE,
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """.trimIndent(),
            )
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_flipcard_words_sort_order ON flipcard_words(sort_order, id)")
            statement.executeUpdate(
                """
                CREATE TABLE IF NOT EXISTS flipcard_word_stats (
                    normalized_word TEXT PRIMARY KEY,
                    correct INTEGER NOT NULL DEFAULT 0 CHECK(correct >= 0),
                    wrong INTEGER NOT NULL DEFAULT 0 CHECK(wrong >= 0),
                    timeout INTEGER NOT NULL DEFAULT 0 CHECK(timeout >= 0),
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """.trimIndent(),
            )
        }
        replaceLegacyFlipcardWords(defaultFlipcardWords)
    }

    private fun Connection.replaceLegacyFlipcardWords(words: List<String>) {
        prepareStatement("DELETE FROM flipcard_words").use { it.executeUpdate() }
        prepareStatement(
            """
            INSERT INTO flipcard_words(word, normalized_word, sort_order, updated_at)
            VALUES(?, ?, ?, CURRENT_TIMESTAMP)
            """.trimIndent(),
        ).use { statement ->
            words.forEachIndexed { index, word ->
                statement.setString(1, word)
                statement.setString(2, normalizeFlipcardWord(word))
                statement.setInt(3, index)
                statement.addBatch()
            }
            statement.executeBatch()
        }
    }

    private fun Connection.addMultilingualLanguageContent() {
        createStatement().use { statement ->
            val spellingSetColumns = statement.executeQuery("PRAGMA table_info(spelling_sets)").use { rows ->
                buildList {
                    while (rows.next()) add(rows.getString("name"))
                }
            }
            if ("language" !in spellingSetColumns) {
                statement.executeUpdate("ALTER TABLE spelling_sets ADD COLUMN language TEXT NOT NULL DEFAULT '${LearningLanguage.en.name}'")
            }
            val spellingWordColumns = statement.executeQuery("PRAGMA table_info(spelling_words)").use { rows ->
                buildList {
                    while (rows.next()) add(rows.getString("name"))
                }
            }
            if ("language" !in spellingWordColumns) {
                statement.executeUpdate("ALTER TABLE spelling_words ADD COLUMN language TEXT NOT NULL DEFAULT '${LearningLanguage.en.name}'")
            }
            statement.executeUpdate("UPDATE spelling_sets SET language = '${LearningLanguage.en.name}' WHERE language IS NULL OR language = ''")
            statement.executeUpdate("UPDATE spelling_words SET language = '${LearningLanguage.en.name}' WHERE language IS NULL OR language = ''")
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_spelling_sets_language_sort_order ON spelling_sets(language, sort_order, id)")
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_spelling_words_language_normalized ON spelling_words(language, normalized_word)")

            statement.executeUpdate("DROP TABLE IF EXISTS spelling_word_stats_new")
            statement.executeUpdate(
                """
                CREATE TABLE spelling_word_stats_new (
                    language TEXT NOT NULL,
                    normalized_word TEXT NOT NULL,
                    correct INTEGER NOT NULL DEFAULT 0 CHECK(correct >= 0),
                    wrong INTEGER NOT NULL DEFAULT 0 CHECK(wrong >= 0),
                    timeout INTEGER NOT NULL DEFAULT 0 CHECK(timeout >= 0),
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(language, normalized_word)
                )
                """.trimIndent(),
            )
            statement.executeUpdate(
                """
                INSERT INTO spelling_word_stats_new(language, normalized_word, correct, wrong, timeout, updated_at)
                SELECT '${LearningLanguage.en.name}', normalized_word, correct, wrong, timeout, updated_at
                FROM spelling_word_stats
                """.trimIndent(),
            )
            statement.executeUpdate("DROP TABLE spelling_word_stats")
            statement.executeUpdate("ALTER TABLE spelling_word_stats_new RENAME TO spelling_word_stats")

            statement.executeUpdate(
                """
                CREATE TABLE IF NOT EXISTS flipcard_concepts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    concept_key TEXT NOT NULL UNIQUE,
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """.trimIndent(),
            )
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_flipcard_concepts_sort_order ON flipcard_concepts(sort_order, id)")
            statement.executeUpdate(
                """
                CREATE TABLE IF NOT EXISTS flipcard_translations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    concept_id INTEGER NOT NULL,
                    language TEXT NOT NULL,
                    word TEXT NOT NULL,
                    normalized_word TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(concept_id) REFERENCES flipcard_concepts(id) ON DELETE CASCADE,
                    UNIQUE(concept_id, language)
                )
                """.trimIndent(),
            )
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_flipcard_translations_language_sort_order ON flipcard_translations(language, sort_order, id)")
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_flipcard_translations_language_normalized ON flipcard_translations(language, normalized_word)")

            statement.executeUpdate("DROP TABLE IF EXISTS flipcard_word_stats_new")
            statement.executeUpdate(
                """
                CREATE TABLE flipcard_word_stats_new (
                    language TEXT NOT NULL,
                    normalized_word TEXT NOT NULL,
                    correct INTEGER NOT NULL DEFAULT 0 CHECK(correct >= 0),
                    wrong INTEGER NOT NULL DEFAULT 0 CHECK(wrong >= 0),
                    timeout INTEGER NOT NULL DEFAULT 0 CHECK(timeout >= 0),
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(language, normalized_word)
                )
                """.trimIndent(),
            )
            statement.executeUpdate(
                """
                INSERT INTO flipcard_word_stats_new(language, normalized_word, correct, wrong, timeout, updated_at)
                SELECT '${LearningLanguage.en.name}', normalized_word, correct, wrong, timeout, updated_at
                FROM flipcard_word_stats
                """.trimIndent(),
            )
            statement.executeUpdate("DROP TABLE flipcard_word_stats")
            statement.executeUpdate("ALTER TABLE flipcard_word_stats_new RENAME TO flipcard_word_stats")
        }
        seedFlipcardConceptsAndTranslations()
        seedDefaultSpellingSetsForNewLanguages()
    }

    private fun Connection.addFlipcardTranslationBackfillTracking() {
        createStatement().use { statement ->
            statement.executeUpdate(
                """
                CREATE TABLE IF NOT EXISTS flipcard_translation_backfills (
                    language TEXT PRIMARY KEY,
                    concept_count INTEGER NOT NULL DEFAULT 0 CHECK(concept_count >= 0),
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """.trimIndent(),
            )
        }
    }

    private fun Connection.addArtifactJobs() {
        createStatement().use { statement ->
            statement.executeUpdate(
                """
                CREATE TABLE IF NOT EXISTS artifact_jobs (
                    job_key TEXT PRIMARY KEY,
                    pool TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('queued', 'generating', 'ready', 'error')),
                    payload_json TEXT NOT NULL,
                    error TEXT,
                    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    completed_at TEXT
                )
                """.trimIndent(),
            )
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_artifact_jobs_pool_status_created ON artifact_jobs(pool, status, created_at)")
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_artifact_jobs_status_updated ON artifact_jobs(status, updated_at)")
        }
    }

    private fun Connection.seedFlipcardConceptsAndTranslations() {
        val englishRows = readLegacyFlipcardRows().ifEmpty {
            defaultFlipcardWords.mapIndexed { index, word -> LegacyFlipcardRow(word, normalizeFlipcardWord(word), index) }
        }
        prepareStatement(
            """
            INSERT INTO flipcard_concepts(concept_key, sort_order, updated_at)
            VALUES(?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(concept_key) DO UPDATE SET
                sort_order = excluded.sort_order,
                updated_at = CURRENT_TIMESTAMP
            """.trimIndent(),
        ).use { statement ->
            englishRows.forEach { row ->
                statement.setString(1, row.normalized)
                statement.setInt(2, row.sortOrder)
                statement.addBatch()
            }
            statement.executeBatch()
        }
        replaceFlipcardTranslationsForLanguage(LearningLanguage.en, englishRows.map { it.word })
        replaceFlipcardTranslationsForLanguage(LearningLanguage.de, englishRows.map { defaultGermanFlipcardTranslations[it.normalized] ?: it.word })
        replaceFlipcardTranslationsForLanguage(LearningLanguage.es, englishRows.map { defaultSpanishFlipcardTranslations[it.normalized] ?: it.word })
    }

    private fun Connection.seedDefaultSpellingSetsForNewLanguages() {
        if (readSpellingSets(LearningLanguage.de).isEmpty()) {
            replaceSpellingSets(listOf(defaultGermanSpellingWords.joinToString(", ")), 0, LearningLanguage.de)
        }
        if (readSpellingSets(LearningLanguage.es).isEmpty()) {
            replaceSpellingSets(listOf(defaultSpanishSpellingWords.joinToString(", ")), 0, LearningLanguage.es)
        }
    }

    private fun Connection.replaceFlipcardTranslationsForLanguage(language: LearningLanguage, words: List<String>) {
        val conceptKeys = readFlipcardConceptKeys()
        prepareStatement("DELETE FROM flipcard_translations WHERE language = ?").use {
            it.setString(1, language.name)
            it.executeUpdate()
        }
        prepareStatement(
            """
            INSERT INTO flipcard_translations(concept_id, language, word, normalized_word, sort_order, updated_at)
            VALUES(?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """.trimIndent(),
        ).use { statement ->
            words.forEachIndexed { index, word ->
                val conceptKey = when (language) {
                    LearningLanguage.en -> normalizeFlipcardWord(word)
                    else -> conceptKeys.getOrNull(index) ?: normalizeFlipcardWord(word)
                }
                val conceptId = requireFlipcardConceptId(conceptKey)
                statement.setLong(1, conceptId)
                statement.setString(2, language.name)
                statement.setString(3, word)
                statement.setString(4, normalizeFlipcardWord(word))
                statement.setInt(5, index)
                statement.addBatch()
            }
            statement.executeBatch()
        }
    }

    private fun Connection.readLegacyFlipcardRows(): List<LegacyFlipcardRow> {
        return createStatement().use { statement ->
            statement.executeQuery(
                """
                SELECT word, normalized_word, sort_order
                FROM flipcard_words
                ORDER BY sort_order, id
                """.trimIndent(),
            ).use { rows ->
                buildList {
                    while (rows.next()) {
                        add(
                            LegacyFlipcardRow(
                                word = rows.getString("word"),
                                normalized = rows.getString("normalized_word"),
                                sortOrder = rows.getInt("sort_order"),
                            ),
                        )
                    }
                }
            }
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

fun Connection.resetInterruptedArtifactJobs() {
    prepareStatement(
        """
        UPDATE artifact_jobs
        SET status = 'queued',
            error = NULL,
            completed_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'generating'
        """.trimIndent(),
    ).use { it.executeUpdate() }
}

fun Connection.readArtifactJob(jobKey: String): ArtifactJobSnapshot? {
    return prepareStatement(
        "SELECT status, error FROM artifact_jobs WHERE job_key = ?",
    ).use { statement ->
        statement.setString(1, jobKey)
        statement.executeQuery().use { rows ->
            if (!rows.next()) {
                null
            } else {
                ArtifactJobSnapshot(
                    status = ArtifactJobStatus.valueOf(rows.getString("status")),
                    error = rows.getString("error"),
                )
            }
        }
    }
}

fun Connection.upsertArtifactJob(
    jobKey: String,
    pool: ArtifactJobPool,
    kind: ArtifactJobKind,
    payloadJson: String,
): ArtifactJobSnapshot {
    prepareStatement(
        """
        INSERT INTO artifact_jobs(job_key, pool, kind, status, payload_json, error, attempt_count, created_at, updated_at, completed_at)
        VALUES(?, ?, ?, 'queued', ?, NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
        ON CONFLICT(job_key) DO UPDATE SET
            pool = excluded.pool,
            kind = excluded.kind,
            status = 'queued',
            payload_json = excluded.payload_json,
            error = NULL,
            completed_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE artifact_jobs.status NOT IN ('queued', 'generating')
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, jobKey)
        statement.setString(2, pool.name)
        statement.setString(3, kind.name)
        statement.setString(4, payloadJson)
        statement.executeUpdate()
    }
    return readArtifactJob(jobKey) ?: ArtifactJobSnapshot(status = ArtifactJobStatus.queued)
}

fun Connection.markArtifactJobReady(jobKey: String) {
    prepareStatement(
        """
        UPDATE artifact_jobs
        SET status = 'ready',
            error = NULL,
            updated_at = CURRENT_TIMESTAMP,
            completed_at = CURRENT_TIMESTAMP
        WHERE job_key = ?
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, jobKey)
        statement.executeUpdate()
    }
}

fun Connection.markArtifactJobError(jobKey: String, error: String) {
    prepareStatement(
        """
        UPDATE artifact_jobs
        SET status = 'error',
            error = ?,
            updated_at = CURRENT_TIMESTAMP,
            completed_at = NULL
        WHERE job_key = ?
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, error)
        statement.setString(2, jobKey)
        statement.executeUpdate()
    }
}

fun Connection.claimNextArtifactJob(pool: ArtifactJobPool): ArtifactQueuedJob? {
    val candidate = prepareStatement(
        """
        SELECT job_key, pool, kind, payload_json
        FROM artifact_jobs
        WHERE pool = ? AND status = 'queued'
        ORDER BY created_at, job_key
        LIMIT 1
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, pool.name)
        statement.executeQuery().use { rows ->
            if (!rows.next()) {
                null
            } else {
                ArtifactQueuedJob(
                    jobKey = rows.getString("job_key"),
                    pool = ArtifactJobPool.valueOf(rows.getString("pool")),
                    kind = ArtifactJobKind.valueOf(rows.getString("kind")),
                    payloadJson = rows.getString("payload_json"),
                )
            }
        }
    } ?: return null

    val updated = prepareStatement(
        """
        UPDATE artifact_jobs
        SET status = 'generating',
            error = NULL,
            attempt_count = attempt_count + 1,
            completed_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE job_key = ? AND status = 'queued'
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, candidate.jobKey)
        statement.executeUpdate()
    }
    return if (updated == 1) candidate else null
}

data class ArtifactQueuedJob(
    val jobKey: String,
    val pool: ArtifactJobPool,
    val kind: ArtifactJobKind,
    val payloadJson: String,
)

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
        SELECT seconds_limit, target_score, celebration_tap_limit, audio_source, flipcard_source
        FROM app_settings
        WHERE id = 1
        """.trimIndent(),
    ).use { statement ->
        statement.executeQuery().use { rows ->
            if (!rows.next()) return AppSettings()
            AppSettings(
                secondsLimit = rows.getInt("seconds_limit"),
                targetScore = rows.getInt("target_score"),
                celebrationTapLimit = rows.getInt("celebration_tap_limit"),
                audioSource = rows.getString("audio_source").toAudioSource(),
                flipcardSource = rows.getString("flipcard_source").toFlipcardSource(),
            )
        }
    }
}

fun Connection.replaceAppSettings(settings: AppSettings) {
    val secondsLimit = settings.secondsLimit.coerceAtLeast(1)
    val targetScore = settings.targetScore.coerceAtLeast(1)
    val celebrationTapLimit = settings.celebrationTapLimit.coerceAtLeast(0)
    prepareStatement(
        """
        INSERT INTO app_settings(id, seconds_limit, target_score, celebration_tap_limit, audio_source, flipcard_source, updated_at)
        VALUES(1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            seconds_limit = excluded.seconds_limit,
            target_score = excluded.target_score,
            celebration_tap_limit = excluded.celebration_tap_limit,
            audio_source = excluded.audio_source,
            flipcard_source = excluded.flipcard_source,
            updated_at = CURRENT_TIMESTAMP
        """.trimIndent(),
    ).use { statement ->
        statement.setInt(1, secondsLimit)
        statement.setInt(2, targetScore)
        statement.setInt(3, celebrationTapLimit)
        statement.setString(4, settings.audioSource.name)
        statement.setString(5, settings.flipcardSource.name)
        statement.executeUpdate()
    }
}

fun Connection.readSpellingSets(language: LearningLanguage = LearningLanguage.en): List<SpellingSet> {
    return prepareStatement(
        """
        SELECT id, raw_words, is_latest, language
        FROM spelling_sets
        WHERE language = ?
        ORDER BY sort_order, id
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, language.name)
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
                            language = rows.getString("language").toLearningLanguage(),
                        ),
                    )
                }
            }
        }
    }
}

fun Connection.replaceSpellingSets(
    rawSets: List<String>,
    latestSetIndex: Int?,
    language: LearningLanguage = LearningLanguage.en,
) {
    val preparedSets = rawSets
        .mapIndexed { index, rawWords -> index to rawWords.trim() }
        .filter { (_, rawWords) -> rawWords.isNotBlank() }
    val selectedOriginalIndex = preparedSets
        .firstOrNull { (index, rawWords) -> index == latestSetIndex && parseSpellingWords(rawWords).isNotEmpty() }
        ?.first
        ?: preparedSets.lastOrNull { (_, rawWords) -> parseSpellingWords(rawWords).isNotEmpty() }?.first

    transaction {
        prepareStatement("DELETE FROM spelling_sets WHERE language = ?").use {
            it.setString(1, language.name)
            it.executeUpdate()
        }
        prepareStatement(
            """
            INSERT INTO spelling_sets(raw_words, sort_order, is_latest, language, updated_at)
            VALUES(?, ?, ?, ?, CURRENT_TIMESTAMP)
            """.trimIndent(),
        ).use { setStatement ->
            prepareStatement(
                """
                INSERT INTO spelling_words(set_id, word, normalized_word, sort_order, language, updated_at)
                VALUES(?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """.trimIndent(),
            ).use { wordStatement ->
                preparedSets.forEachIndexed { setIndex, (originalIndex, rawWords) ->
                        setStatement.setString(1, rawWords)
                        setStatement.setInt(2, setIndex)
                        setStatement.setInt(3, if (originalIndex == selectedOriginalIndex) 1 else 0)
                        setStatement.setString(4, language.name)
                        setStatement.executeUpdate()

                        val setId = lastInsertRowId()
                        parseSpellingWords(rawWords).forEachIndexed { wordIndex, word ->
                            wordStatement.setLong(1, setId)
                            wordStatement.setString(2, word)
                            wordStatement.setString(3, normalizeSpellingWord(word))
                            wordStatement.setInt(4, wordIndex)
                            wordStatement.setString(5, language.name)
                            wordStatement.addBatch()
                        }
                    }
                wordStatement.executeBatch()
            }
        }
    }
}

fun Connection.readSpellingSession(
    mode: SpellingSessionMode,
    language: LearningLanguage = LearningLanguage.en,
): SpellingSession? {
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
        AND spelling_sets.language = ?
        AND EXISTS (
            SELECT 1 FROM spelling_words
            WHERE spelling_words.set_id = spelling_sets.id
        )
        ORDER BY $orderClause
        LIMIT 1
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, language.name)
        statement.executeQuery().use { rows ->
            if (!rows.next()) return null
            rows.getLong("id")
        }
    }
    return SpellingSession(setId = setId, words = readSpellingWords(setId), language = language)
}

fun Connection.readSpellingStats(language: LearningLanguage = LearningLanguage.en): Map<String, QuestionStats> {
    return prepareStatement(
        """
        SELECT normalized_word, correct, wrong, timeout
        FROM spelling_word_stats
        WHERE language = ?
        ORDER BY normalized_word
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, language.name)
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

fun Connection.recordSpellingStats(
    word: String,
    correct: Boolean,
    timedOut: Boolean,
    language: LearningLanguage = LearningLanguage.en,
): Pair<String, QuestionStats>? {
    val normalized = normalizeSpellingWord(word)
    if (normalized.isBlank() || !spellingWordExists(normalized, language)) {
        return null
    }
    prepareStatement(
        """
        INSERT INTO spelling_word_stats(language, normalized_word, correct, wrong, timeout, updated_at)
        VALUES(?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(language, normalized_word) DO UPDATE SET
            correct = spelling_word_stats.correct + excluded.correct,
            wrong = spelling_word_stats.wrong + excluded.wrong,
            timeout = spelling_word_stats.timeout + excluded.timeout,
            updated_at = CURRENT_TIMESTAMP
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, language.name)
        statement.setString(2, normalized)
        statement.setInt(3, if (correct) 1 else 0)
        statement.setInt(4, if (!correct && !timedOut) 1 else 0)
        statement.setInt(5, if (timedOut) 1 else 0)
        statement.executeUpdate()
    }
    return normalized to readSpellingStat(normalized, language)
}

fun Connection.readFlipcardWordsResponse(language: LearningLanguage = LearningLanguage.en): FlipcardWordsResponse {
    val words = readFlipcardWords(language)
    return FlipcardWordsResponse(
        words = words.joinToString(", ") { it.text },
        items = words,
    )
}

fun Connection.replaceFlipcardWords(rawWords: String, language: LearningLanguage = LearningLanguage.en) {
    val words = parseFlipcardWords(rawWords)
        .distinctBy { normalizeFlipcardWord(it) }
    transaction {
        val existingConceptKeys = readFlipcardConceptKeys()
        prepareStatement(
            """
            INSERT INTO flipcard_concepts(concept_key, sort_order, updated_at)
            VALUES(?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(concept_key) DO UPDATE SET
                sort_order = excluded.sort_order,
                updated_at = CURRENT_TIMESTAMP
            """.trimIndent(),
        ).use { conceptStatement ->
            prepareStatement("DELETE FROM flipcard_translations WHERE language = ?").use {
                it.setString(1, language.name)
                it.executeUpdate()
            }
            prepareStatement(
                """
                INSERT INTO flipcard_translations(concept_id, language, word, normalized_word, sort_order, updated_at)
                VALUES(?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """.trimIndent(),
            ).use { translationStatement ->
                words.forEachIndexed { index, word ->
                    val normalized = normalizeFlipcardWord(word)
                    val conceptKey = when (language) {
                        LearningLanguage.en -> normalized
                        else -> existingConceptKeys.getOrNull(index) ?: normalized
                    }
                    conceptStatement.setString(1, conceptKey)
                    conceptStatement.setInt(2, index)
                    conceptStatement.executeUpdate()

                    val conceptId = requireFlipcardConceptId(conceptKey)
                    translationStatement.setLong(1, conceptId)
                    translationStatement.setString(2, language.name)
                    translationStatement.setString(3, word)
                    translationStatement.setString(4, normalized)
                    translationStatement.setInt(5, index)
                    translationStatement.addBatch()
                }
                translationStatement.executeBatch()
            }
        }
    }
}

fun Connection.readFlipcardTranslationBackfillProgress(language: LearningLanguage): FlipcardTranslationBackfillProgress {
    val total = prepareStatement("SELECT COUNT(*) FROM flipcard_concepts").use { statement ->
        statement.executeQuery().use { rows ->
            if (!rows.next()) 0 else rows.getInt(1)
        }
    }
    val row = prepareStatement(
        "SELECT concept_count, updated_at FROM flipcard_translation_backfills WHERE language = ?",
    ).use { statement ->
        statement.setString(1, language.name)
        statement.executeQuery().use { rows ->
            if (!rows.next()) {
                0 to null
            } else {
                rows.getInt("concept_count") to rows.getString("updated_at")
            }
        }
    }
    return FlipcardTranslationBackfillProgress(
        readyCount = row.first.coerceAtMost(total),
        totalCount = total,
        updatedAt = row.second,
    )
}

fun Connection.readFlipcardConceptsForTranslation(): List<FlipcardConceptTranslationSource> {
    return prepareStatement(
        """
        SELECT flipcard_concepts.id, flipcard_concepts.concept_key, flipcard_translations.word
        FROM flipcard_concepts
        LEFT JOIN flipcard_translations
            ON flipcard_translations.concept_id = flipcard_concepts.id
            AND flipcard_translations.language = '${LearningLanguage.en.name}'
        ORDER BY flipcard_concepts.sort_order, flipcard_concepts.id
        """.trimIndent(),
    ).use { statement ->
        statement.executeQuery().use { rows ->
            buildList {
                while (rows.next()) {
                    val conceptKey = rows.getString("concept_key")
                    add(
                        FlipcardConceptTranslationSource(
                            conceptId = rows.getLong("id"),
                            conceptKey = conceptKey,
                            englishWord = rows.getString("word") ?: conceptKey,
                        ),
                    )
                }
            }
        }
    }
}

fun Connection.replaceGeneratedFlipcardTranslations(
    language: LearningLanguage,
    translations: List<GeneratedFlipcardTranslation>,
) {
    transaction {
        prepareStatement("DELETE FROM flipcard_translations WHERE language = ?").use {
            it.setString(1, language.name)
            it.executeUpdate()
        }
        prepareStatement(
            """
            INSERT INTO flipcard_translations(concept_id, language, word, normalized_word, sort_order, updated_at)
            VALUES(?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """.trimIndent(),
        ).use { statement ->
            translations.forEachIndexed { index, translation ->
                statement.setLong(1, translation.conceptId)
                statement.setString(2, language.name)
                statement.setString(3, translation.displayWord)
                statement.setString(4, normalizeFlipcardWord(translation.displayWord))
                statement.setInt(5, index)
                statement.addBatch()
            }
            statement.executeBatch()
        }
        prepareStatement(
            """
            INSERT INTO flipcard_translation_backfills(language, concept_count, updated_at)
            VALUES(?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(language) DO UPDATE SET
                concept_count = excluded.concept_count,
                updated_at = CURRENT_TIMESTAMP
            """.trimIndent(),
        ).use { statement ->
            statement.setString(1, language.name)
            statement.setInt(2, translations.size)
            statement.executeUpdate()
        }
    }
}

fun Connection.readEnglishAudioCacheMigrationWords(): List<String> {
    return prepareStatement(
        """
        SELECT word
        FROM spelling_words
        WHERE language = '${LearningLanguage.en.name}'
        UNION
        SELECT flipcard_translations.word
        FROM flipcard_translations
        WHERE flipcard_translations.language = '${LearningLanguage.en.name}'
        ORDER BY word
        """.trimIndent(),
    ).use { statement ->
        statement.executeQuery().use { rows ->
            buildList {
                while (rows.next()) add(rows.getString("word"))
            }
        }
    }
}

fun Connection.readAudioCacheMigrationWordsByLanguage(): Map<LearningLanguage, List<String>> {
    return prepareStatement(
        """
        SELECT language, word
        FROM spelling_words
        UNION
        SELECT language, word
        FROM flipcard_translations
        ORDER BY language, word
        """.trimIndent(),
    ).use { statement ->
        statement.executeQuery().use { rows ->
            val words = linkedMapOf<LearningLanguage, MutableList<String>>()
            while (rows.next()) {
                val language = rows.getString("language").toLearningLanguage()
                words.getOrPut(language) { mutableListOf() }.add(rows.getString("word"))
            }
            words
        }
    }
}

data class FlipcardConceptTranslationSource(
    val conceptId: Long,
    val conceptKey: String,
    val englishWord: String,
)

data class GeneratedFlipcardTranslation(
    val conceptId: Long,
    val displayWord: String,
)

data class FlipcardTranslationBackfillProgress(
    val readyCount: Int,
    val totalCount: Int,
    val updatedAt: String?,
)

fun Connection.readFlipcardSession(limit: Int, language: LearningLanguage = LearningLanguage.en): FlipcardSession {
    val safeLimit = limit.coerceAtLeast(1)
    return prepareStatement(
        """
        SELECT flipcard_translations.word, flipcard_translations.normalized_word, flipcard_concepts.concept_key
        FROM flipcard_translations
        INNER JOIN flipcard_concepts ON flipcard_concepts.id = flipcard_translations.concept_id
        WHERE flipcard_translations.language = ?
        ORDER BY RANDOM()
        LIMIT ?
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, language.name)
        statement.setInt(2, safeLimit)
        statement.executeQuery().use { rows ->
            FlipcardSession(
                language = language,
                words = buildList {
                    while (rows.next()) {
                        add(
                            FlipcardWord(
                                text = rows.getString("word"),
                                normalized = rows.getString("normalized_word"),
                                conceptKey = rows.getString("concept_key"),
                            ),
                        )
                    }
                },
            )
        }
    }
}

fun Connection.readFlipcardStats(language: LearningLanguage = LearningLanguage.en): Map<String, QuestionStats> {
    return prepareStatement(
        """
        SELECT normalized_word, correct, wrong, timeout
        FROM flipcard_word_stats
        WHERE language = ?
        ORDER BY normalized_word
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, language.name)
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

fun Connection.recordFlipcardStats(
    word: String,
    correct: Boolean,
    timedOut: Boolean,
    language: LearningLanguage = LearningLanguage.en,
): Pair<String, QuestionStats>? {
    val normalized = normalizeFlipcardWord(word)
    if (normalized.isBlank() || !flipcardWordExists(normalized, language)) {
        return null
    }
    prepareStatement(
        """
        INSERT INTO flipcard_word_stats(language, normalized_word, correct, wrong, timeout, updated_at)
        VALUES(?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(language, normalized_word) DO UPDATE SET
            correct = flipcard_word_stats.correct + excluded.correct,
            wrong = flipcard_word_stats.wrong + excluded.wrong,
            timeout = flipcard_word_stats.timeout + excluded.timeout,
            updated_at = CURRENT_TIMESTAMP
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, language.name)
        statement.setString(2, normalized)
        statement.setInt(3, if (correct) 1 else 0)
        statement.setInt(4, if (!correct && !timedOut) 1 else 0)
        statement.setInt(5, if (timedOut) 1 else 0)
        statement.executeUpdate()
    }
    return normalized to readFlipcardStat(normalized, language)
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

private fun Connection.lastInsertRowId(): Long {
    return createStatement().use { statement ->
        statement.executeQuery("SELECT last_insert_rowid()").use { rows ->
            require(rows.next()) { "Missing SQLite last_insert_rowid()." }
            rows.getLong(1)
        }
    }
}

private fun Connection.requireFlipcardConceptId(conceptKey: String): Long {
    return prepareStatement("SELECT id FROM flipcard_concepts WHERE concept_key = ?").use { statement ->
        statement.setString(1, conceptKey)
        statement.executeQuery().use { rows ->
            require(rows.next()) { "Missing flipcard concept: $conceptKey" }
            rows.getLong("id")
        }
    }
}

private fun Connection.readFlipcardConceptKeys(): List<String> {
    return prepareStatement("SELECT concept_key FROM flipcard_concepts ORDER BY sort_order, id").use { statement ->
        statement.executeQuery().use { rows ->
            buildList {
                while (rows.next()) add(rows.getString("concept_key"))
            }
        }
    }
}

private fun Connection.ensureAppSettingsRow() {
    prepareStatement(
        """
        INSERT INTO app_settings(id, seconds_limit, target_score, celebration_tap_limit, audio_source, flipcard_source, updated_at)
        VALUES(1, $defaultSecondsLimit, $defaultTargetScore, $defaultCelebrationTapLimit, '${defaultAudioSource.name}', '${defaultFlipcardSource.name}', CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO NOTHING
        """.trimIndent(),
    ).use { it.executeUpdate() }
}

private fun Connection.spellingWordExists(normalizedWord: String, language: LearningLanguage): Boolean {
    return prepareStatement("SELECT 1 FROM spelling_words WHERE language = ? AND normalized_word = ? LIMIT 1").use { statement ->
        statement.setString(1, language.name)
        statement.setString(2, normalizedWord)
        statement.executeQuery().use { rows -> rows.next() }
    }
}

private fun Connection.readSpellingStat(normalizedWord: String, language: LearningLanguage): QuestionStats {
    return prepareStatement(
        """
        SELECT correct, wrong, timeout
        FROM spelling_word_stats
        WHERE language = ? AND normalized_word = ?
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, language.name)
        statement.setString(2, normalizedWord)
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

fun Connection.readFlipcardWords(language: LearningLanguage = LearningLanguage.en): List<FlipcardWord> {
    return prepareStatement(
        """
        SELECT flipcard_translations.word, flipcard_translations.normalized_word, flipcard_concepts.concept_key
        FROM flipcard_translations
        INNER JOIN flipcard_concepts ON flipcard_concepts.id = flipcard_translations.concept_id
        WHERE flipcard_translations.language = ?
        ORDER BY flipcard_translations.sort_order, flipcard_translations.id
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, language.name)
        statement.executeQuery().use { rows ->
            buildList {
                while (rows.next()) {
                    add(
                        FlipcardWord(
                            text = rows.getString("word"),
                            normalized = rows.getString("normalized_word"),
                            conceptKey = rows.getString("concept_key"),
                        ),
                    )
                }
            }
        }
    }
}

private fun Connection.flipcardWordExists(normalizedWord: String, language: LearningLanguage): Boolean {
    return prepareStatement("SELECT 1 FROM flipcard_translations WHERE language = ? AND normalized_word = ? LIMIT 1").use { statement ->
        statement.setString(1, language.name)
        statement.setString(2, normalizedWord)
        statement.executeQuery().use { rows -> rows.next() }
    }
}

private fun Connection.readFlipcardStat(normalizedWord: String, language: LearningLanguage): QuestionStats {
    return prepareStatement(
        """
        SELECT correct, wrong, timeout
        FROM flipcard_word_stats
        WHERE language = ? AND normalized_word = ?
        """.trimIndent(),
    ).use { statement ->
        statement.setString(1, language.name)
        statement.setString(2, normalizedWord)
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

private fun parseFlipcardWords(rawWords: String): List<String> {
    return rawWords.split(',')
        .map { it.trim() }
        .filter { it.isNotBlank() }
}

fun normalizeFlipcardWord(word: String): String = word.trim().lowercase()

private val defaultFlipcardWords = listOf(
    "apple", "banana", "orange", "pear", "grape", "lemon", "strawberry", "watermelon", "pineapple", "peach",
    "cherry", "blueberry", "raspberry", "mango", "kiwi", "plum", "melon", "coconut", "carrot", "potato",
    "tomato", "corn", "peas", "onion", "pumpkin", "cucumber", "pepper", "lettuce", "broccoli", "mushroom",
    "cat", "dog", "bird", "fish", "horse", "cow", "pig", "sheep", "goat", "duck",
    "chicken", "rabbit", "mouse", "bear", "lion", "tiger", "elephant", "giraffe", "zebra", "monkey",
    "panda", "koala", "kangaroo", "frog", "snake", "turtle", "whale", "dolphin", "shark", "octopus",
    "house", "school", "park", "garden", "kitchen", "bedroom", "bathroom", "window", "door", "table",
    "chair", "bed", "sofa", "lamp", "clock", "book", "pencil", "pen", "paper", "bag",
    "ball", "doll", "kite", "train", "car", "bus", "bike", "boat", "plane", "truck",
    "sun", "moon", "star", "cloud", "rain", "snow", "wind", "rainbow", "tree", "flower",
    "grass", "leaf", "rock", "river", "lake", "sea", "beach", "mountain", "road", "bridge",
    "shirt", "pants", "dress", "skirt", "shoe", "sock", "hat", "coat", "glove", "scarf",
    "eye", "ear", "nose", "mouth", "hand", "foot", "leg", "arm", "head", "hair",
    "baby", "boy", "girl", "mother", "father", "family", "friend", "teacher", "doctor", "farmer",
    "happy", "sad", "big", "small", "hot", "cold", "fast", "slow", "red", "blue",
    "green", "yellow", "black", "white", "pink", "purple", "brown", "gray", "circle", "square",
    "triangle", "heart", "number", "letter", "music", "song", "drum", "guitar", "piano", "bell",
    "cake", "bread", "milk", "water", "juice", "egg", "cheese", "rice", "soup", "cookie",
    "spoon", "fork", "cup", "plate", "bowl", "toothbrush", "soap", "towel", "brush", "comb",
    "fire", "waterfall", "castle", "robot", "rocket", "crown", "flag", "map", "key", "box",
    "toy", "game", "slide", "swing", "pool", "farm", "forest", "zoo", "shop", "library",
)

private val defaultGermanSpellingWords = listOf(
    "die Katze", "der Hund", "der Apfel", "die Sonne", "der Mond", "das Haus", "das Buch", "der Ball", "das Auto", "der Baum",
)

private val defaultSpanishSpellingWords = listOf(
    "gato", "perro", "manzana", "sol", "luna", "casa", "libro", "pelota", "coche", "arbol",
)

private val defaultGermanFlipcardTranslations = mapOf(
    "apple" to "Apfel", "banana" to "Banane", "orange" to "Orange", "pear" to "Birne", "grape" to "Traube",
    "lemon" to "Zitrone", "strawberry" to "Erdbeere", "watermelon" to "Wassermelone", "pineapple" to "Ananas", "peach" to "Pfirsich",
    "cherry" to "Kirsche", "blueberry" to "Blaubeere", "raspberry" to "Himbeere", "mango" to "Mango", "kiwi" to "Kiwi",
    "plum" to "Pflaume", "melon" to "Melone", "coconut" to "Kokosnuss", "carrot" to "Karotte", "potato" to "Kartoffel",
    "tomato" to "Tomate", "corn" to "Mais", "peas" to "Erbsen", "onion" to "Zwiebel", "pumpkin" to "Kuerbis",
    "cucumber" to "Gurke", "pepper" to "Paprika", "lettuce" to "Salat", "broccoli" to "Brokkoli", "mushroom" to "Pilz",
    "cat" to "Katze", "dog" to "Hund", "bird" to "Vogel", "fish" to "Fisch", "horse" to "Pferd",
    "cow" to "Kuh", "pig" to "Schwein", "sheep" to "Schaf", "goat" to "Ziege", "duck" to "Ente",
    "chicken" to "Huhn", "rabbit" to "Kaninchen", "mouse" to "Maus", "bear" to "Baer", "lion" to "Loewe",
    "tiger" to "Tiger", "elephant" to "Elefant", "giraffe" to "Giraffe", "zebra" to "Zebra", "monkey" to "Affe",
    "panda" to "Panda", "koala" to "Koala", "kangaroo" to "Kaenguru", "frog" to "Frosch", "snake" to "Schlange",
    "turtle" to "Schildkroete", "whale" to "Wal", "dolphin" to "Delfin", "shark" to "Hai", "octopus" to "Oktopus",
    "house" to "Haus", "school" to "Schule", "park" to "Park", "garden" to "Garten", "kitchen" to "Kueche",
    "bedroom" to "Schlafzimmer", "bathroom" to "Badezimmer", "window" to "Fenster", "door" to "Tuer", "table" to "Tisch",
    "chair" to "Stuhl", "bed" to "Bett", "sofa" to "Sofa", "lamp" to "Lampe", "clock" to "Uhr",
    "book" to "Buch", "pencil" to "Bleistift", "pen" to "Stift", "paper" to "Papier", "bag" to "Tasche",
    "ball" to "Ball", "doll" to "Puppe", "kite" to "Drachen", "train" to "Zug", "car" to "Auto",
    "bus" to "Bus", "bike" to "Fahrrad", "boat" to "Boot", "plane" to "Flugzeug", "truck" to "Lastwagen",
    "sun" to "Sonne", "moon" to "Mond", "star" to "Stern", "cloud" to "Wolke", "rain" to "Regen",
    "snow" to "Schnee", "wind" to "Wind", "rainbow" to "Regenbogen", "tree" to "Baum", "flower" to "Blume",
    "grass" to "Gras", "leaf" to "Blatt", "rock" to "Stein", "river" to "Fluss", "lake" to "See",
    "sea" to "Meer", "beach" to "Strand", "mountain" to "Berg", "road" to "Strasse", "bridge" to "Bruecke",
    "shirt" to "Hemd", "pants" to "Hose", "dress" to "Kleid", "skirt" to "Rock", "shoe" to "Schuh",
    "sock" to "Socke", "hat" to "Hut", "coat" to "Mantel", "glove" to "Handschuh", "scarf" to "Schal",
    "eye" to "Auge", "ear" to "Ohr", "nose" to "Nase", "mouth" to "Mund", "hand" to "Hand",
    "foot" to "Fuss", "leg" to "Bein", "arm" to "Arm", "head" to "Kopf", "hair" to "Haar",
    "baby" to "Baby", "boy" to "Junge", "girl" to "Maedchen", "mother" to "Mutter", "father" to "Vater",
    "family" to "Familie", "friend" to "Freund", "teacher" to "Lehrer", "doctor" to "Arzt", "farmer" to "Bauer",
    "happy" to "gluecklich", "sad" to "traurig", "big" to "gross", "small" to "klein", "hot" to "heiss",
    "cold" to "kalt", "fast" to "schnell", "slow" to "langsam", "red" to "rot", "blue" to "blau",
    "green" to "gruen", "yellow" to "gelb", "black" to "schwarz", "white" to "weiss", "pink" to "rosa",
    "purple" to "lila", "brown" to "braun", "gray" to "grau", "circle" to "Kreis", "square" to "Quadrat",
    "triangle" to "Dreieck", "heart" to "Herz", "number" to "Zahl", "letter" to "Buchstabe", "music" to "Musik",
    "song" to "Lied", "drum" to "Trommel", "guitar" to "Gitarre", "piano" to "Klavier", "bell" to "Glocke",
    "cake" to "Kuchen", "bread" to "Brot", "milk" to "Milch", "water" to "Wasser", "juice" to "Saft",
    "egg" to "Ei", "cheese" to "Kaese", "rice" to "Reis", "soup" to "Suppe", "cookie" to "Keks",
    "spoon" to "Loeffel", "fork" to "Gabel", "cup" to "Tasse", "plate" to "Teller", "bowl" to "Schuessel",
    "toothbrush" to "Zahnbuerste", "soap" to "Seife", "towel" to "Handtuch", "brush" to "Buerste", "comb" to "Kamm",
    "fire" to "Feuer", "waterfall" to "Wasserfall", "castle" to "Schloss", "robot" to "Roboter", "rocket" to "Rakete",
    "crown" to "Krone", "flag" to "Flagge", "map" to "Karte", "key" to "Schluessel", "box" to "Kiste",
    "toy" to "Spielzeug", "game" to "Spiel", "slide" to "Rutsche", "swing" to "Schaukel", "pool" to "Schwimmbecken",
    "farm" to "Bauernhof", "forest" to "Wald", "zoo" to "Zoo", "shop" to "Laden", "library" to "Bibliothek",
)

private val defaultSpanishFlipcardTranslations = mapOf(
    "apple" to "manzana", "banana" to "platano", "orange" to "naranja", "pear" to "pera", "grape" to "uva",
    "lemon" to "limon", "strawberry" to "fresa", "watermelon" to "sandia", "pineapple" to "pina", "peach" to "durazno",
    "cherry" to "cereza", "blueberry" to "arandano", "raspberry" to "frambuesa", "mango" to "mango", "kiwi" to "kiwi",
    "plum" to "ciruela", "melon" to "melon", "coconut" to "coco", "carrot" to "zanahoria", "potato" to "patata",
    "tomato" to "tomate", "corn" to "maiz", "peas" to "guisantes", "onion" to "cebolla", "pumpkin" to "calabaza",
    "cucumber" to "pepino", "pepper" to "pimiento", "lettuce" to "lechuga", "broccoli" to "brocoli", "mushroom" to "seta",
    "cat" to "gato", "dog" to "perro", "bird" to "pajaro", "fish" to "pez", "horse" to "caballo",
    "cow" to "vaca", "pig" to "cerdo", "sheep" to "oveja", "goat" to "cabra", "duck" to "pato",
    "chicken" to "pollo", "rabbit" to "conejo", "mouse" to "raton", "bear" to "oso", "lion" to "leon",
    "tiger" to "tigre", "elephant" to "elefante", "giraffe" to "jirafa", "zebra" to "cebra", "monkey" to "mono",
    "panda" to "panda", "koala" to "koala", "kangaroo" to "canguro", "frog" to "rana", "snake" to "serpiente",
    "turtle" to "tortuga", "whale" to "ballena", "dolphin" to "delfin", "shark" to "tiburon", "octopus" to "pulpo",
    "house" to "casa", "school" to "escuela", "park" to "parque", "garden" to "jardin", "kitchen" to "cocina",
    "bedroom" to "dormitorio", "bathroom" to "bano", "window" to "ventana", "door" to "puerta", "table" to "mesa",
    "chair" to "silla", "bed" to "cama", "sofa" to "sofa", "lamp" to "lampara", "clock" to "reloj",
    "book" to "libro", "pencil" to "lapiz", "pen" to "boligrafo", "paper" to "papel", "bag" to "bolsa",
    "ball" to "pelota", "doll" to "muneca", "kite" to "cometa", "train" to "tren", "car" to "coche",
    "bus" to "autobus", "bike" to "bicicleta", "boat" to "barco", "plane" to "avion", "truck" to "camion",
    "sun" to "sol", "moon" to "luna", "star" to "estrella", "cloud" to "nube", "rain" to "lluvia",
    "snow" to "nieve", "wind" to "viento", "rainbow" to "arcoiris", "tree" to "arbol", "flower" to "flor",
    "grass" to "hierba", "leaf" to "hoja", "rock" to "roca", "river" to "rio", "lake" to "lago",
    "sea" to "mar", "beach" to "playa", "mountain" to "montana", "road" to "camino", "bridge" to "puente",
    "shirt" to "camisa", "pants" to "pantalones", "dress" to "vestido", "skirt" to "falda", "shoe" to "zapato",
    "sock" to "calcetin", "hat" to "sombrero", "coat" to "abrigo", "glove" to "guante", "scarf" to "bufanda",
    "eye" to "ojo", "ear" to "oreja", "nose" to "nariz", "mouth" to "boca", "hand" to "mano",
    "foot" to "pie", "leg" to "pierna", "arm" to "brazo", "head" to "cabeza", "hair" to "pelo",
    "baby" to "bebe", "boy" to "nino", "girl" to "nina", "mother" to "madre", "father" to "padre",
    "family" to "familia", "friend" to "amigo", "teacher" to "maestro", "doctor" to "doctor", "farmer" to "granjero",
    "happy" to "feliz", "sad" to "triste", "big" to "grande", "small" to "pequeno", "hot" to "caliente",
    "cold" to "frio", "fast" to "rapido", "slow" to "lento", "red" to "rojo", "blue" to "azul",
    "green" to "verde", "yellow" to "amarillo", "black" to "negro", "white" to "blanco", "pink" to "rosa",
    "purple" to "morado", "brown" to "marron", "gray" to "gris", "circle" to "circulo", "square" to "cuadrado",
    "triangle" to "triangulo", "heart" to "corazon", "number" to "numero", "letter" to "letra", "music" to "musica",
    "song" to "cancion", "drum" to "tambor", "guitar" to "guitarra", "piano" to "piano", "bell" to "campana",
    "cake" to "pastel", "bread" to "pan", "milk" to "leche", "water" to "agua", "juice" to "zumo",
    "egg" to "huevo", "cheese" to "queso", "rice" to "arroz", "soup" to "sopa", "cookie" to "galleta",
    "spoon" to "cuchara", "fork" to "tenedor", "cup" to "taza", "plate" to "plato", "bowl" to "cuenco",
    "toothbrush" to "cepillo dental", "soap" to "jabon", "towel" to "toalla", "brush" to "cepillo", "comb" to "peine",
    "fire" to "fuego", "waterfall" to "cascada", "castle" to "castillo", "robot" to "robot", "rocket" to "cohete",
    "crown" to "corona", "flag" to "bandera", "map" to "mapa", "key" to "llave", "box" to "caja",
    "toy" to "juguete", "game" to "juego", "slide" to "tobogan", "swing" to "columpio", "pool" to "piscina",
    "farm" to "granja", "forest" to "bosque", "zoo" to "zoo", "shop" to "tienda", "library" to "biblioteca",
)

private fun String?.toAudioSource(): AudioSource {
    return AudioSource.entries.firstOrNull { it.name == this } ?: defaultAudioSource
}

private fun String?.toFlipcardSource(): FlipcardSource {
    return FlipcardSource.entries.firstOrNull { it.name == this } ?: defaultFlipcardSource
}

fun String?.toLearningLanguage(): LearningLanguage {
    return LearningLanguage.entries.firstOrNull { it.name == this } ?: LearningLanguage.en
}

private fun timestamp(): String = backupTimestampFormatter.format(Instant.now())
