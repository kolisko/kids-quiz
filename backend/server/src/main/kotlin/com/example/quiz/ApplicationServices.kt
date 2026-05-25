package com.example.quiz

data class ApplicationServices(
    val settings: SettingsUseCase,
    val activities: ActivityCatalogUseCase,
    val practice: PracticeUseCase,
    val content: ContentUseCase,
    val assets: AssetUseCase,
    val trophies: TrophyUseCase,
)

fun buildApplicationServices(): ApplicationServices {
    val sqlite = SqliteKidsQuizAdapter()
    return ApplicationServices(
        settings = SettingsUseCase(sqlite),
        activities = ActivityCatalogUseCase(sqlite),
        practice = PracticeUseCase(sqlite, sqlite, sqlite, sqlite),
        content = ContentUseCase(sqlite),
        assets = AssetUseCase(sqlite),
        trophies = TrophyUseCase(sqlite),
    )
}
