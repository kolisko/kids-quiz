package com.example.quiz.api

import java.nio.file.Path

private const val DataDirEnv = "KIDS_QUIZ_DATA_DIR"
private const val DbPathEnv = "KIDS_QUIZ_DB_PATH"

internal fun runtimeDataDir(): Path {
    return System.getenv(DataDirEnv)?.takeIf { it.isNotBlank() }?.let { Path.of(it) }
        ?: System.getProperty("user.dir")
            .let { Path.of(it) }
}

internal fun runtimeDataFile(fileName: String): Path = runtimeDataDir().resolve(fileName)

internal fun runtimeDatabaseFile(): Path {
    return System.getenv(DbPathEnv)?.takeIf { it.isNotBlank() }?.let { Path.of(it) }
        ?: runtimeDataFile("kids-quiz.sqlite")
}
