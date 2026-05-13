package com.example.quiz

fun main() {
    DatabaseMigrator.migrate(backupExistingDatabase = true)
    println("KitQuiz database is migrated at ${runtimeDatabaseFile().toAbsolutePath()}")
}
