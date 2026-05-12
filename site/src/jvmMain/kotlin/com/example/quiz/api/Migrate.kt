package com.example.quiz.api

fun main() {
    DatabaseMigrator.migrate(backupExistingDatabase = true)
    println("Kids Quiz database is migrated at ${runtimeDatabaseFile().toAbsolutePath()}")
}
