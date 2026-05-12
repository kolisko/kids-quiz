package com.example.quiz

import java.nio.file.Path
import kotlin.io.path.Path

private const val DataDirEnv = "KIDS_QUIZ_DATA_DIR"
private const val DatabasePathEnv = "KIDS_QUIZ_DB_PATH"
private const val StaticDirEnv = "KIDS_QUIZ_STATIC_DIR"

fun runtimeDataDir(): Path = System.getenv(DataDirEnv)
    ?.takeIf { it.isNotBlank() }
    ?.let { Path(it) }
    ?: Path(".")

fun runtimeDataFile(name: String): Path = runtimeDataDir().resolve(name)

fun runtimeDatabaseFile(): Path = System.getenv(DatabasePathEnv)
    ?.takeIf { it.isNotBlank() }
    ?.let { Path(it) }
    ?: runtimeDataFile("kids-quiz.sqlite")

fun runtimeStaticDir(): Path = System.getenv(StaticDirEnv)
    ?.takeIf { it.isNotBlank() }
    ?.let { Path(it) }
    ?: Path("public")
