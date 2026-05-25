package com.example.quiz

fun main() {
    DatabaseMigrator.migrate(backupExistingDatabase = true)
    println("Kids Quiz database is migrated at ${runtimeDatabaseFile().toAbsolutePath()}")
}
