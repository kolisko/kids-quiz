package com.example.quiz.api

import java.nio.file.Path

private const val DataDirEnv = "KIDS_QUIZ_DATA_DIR"

internal fun runtimeDataFile(fileName: String): Path {
    val dataDir = System.getenv(DataDirEnv)?.takeIf { it.isNotBlank() }
        ?: System.getProperty("user.dir")
    return Path.of(dataDir, fileName)
}
