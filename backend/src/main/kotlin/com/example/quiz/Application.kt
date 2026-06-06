package com.example.quiz

import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.withCharset
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.receive
import io.ktor.server.request.path
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondFile
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import kotlinx.serialization.json.Json
import java.io.File

private val appJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    encodeDefaults = true
    prettyPrint = false
}

fun main() {
    val port = System.getenv("PORT")?.toIntOrNull() ?: 8080
    embeddedServer(Netty, port = port, host = "0.0.0.0") {
        module()
    }.start(wait = true)
}

fun Application.module() {
    val appLog = environment.log
    install(ContentNegotiation) {
        json(appJson)
    }
    install(CORS) {
        allowCredentials = true
        allowHost("beatka.eu", schemes = listOf("https"))
        allowHost("localhost:8080", schemes = listOf("http"))
        allowHost("127.0.0.1:8080", schemes = listOf("http"))
        allowHost("localhost:4200", schemes = listOf("http"))
        allowHost("127.0.0.1:4200", schemes = listOf("http"))
        allowHeader(HttpHeaders.ContentType)
        allowHeader(HttpHeaders.Authorization)
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Put)
    }
    install(StatusPages) {
        exception<Throwable> { call, cause ->
            appLog.error("Unhandled request failure", cause)
            call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "internal_error"))
        }
    }

    DatabaseMigrator.ensureMigrated()
    ArtifactGenerationQueue.initialize()
    if (FlipcardTranslationService.autoBackfillEnabled()) {
        FlipcardTranslationService.enqueueBackfillIfConfigured(LearningLanguage.de)
        FlipcardTranslationService.enqueueBackfillIfConfigured(LearningLanguage.es)
    }

    val staticDir = runtimeStaticDir().toFile()
    routing {
        route("/api") {
            get("/health") {
                call.respond(mapOf("ok" to true))
            }
            get("/trophy-animals/generated.svg") {
                if (!Auth.requireAuthenticated(call)) return@get
                when (val result = TrophyAnimalService.parse(call.request.queryParameters)) {
                    is TrophyAnimalSpecResult.Valid -> {
                        call.response.headers.append(
                            HttpHeaders.CacheControl,
                            if (result.random) "no-store" else "public, max-age=31536000, immutable",
                        )
                        call.respondBytes(
                            bytes = TrophyAnimalService.renderSvg(result.spec).toByteArray(Charsets.UTF_8),
                            contentType = ContentType.Image.SVG.withCharset(Charsets.UTF_8),
                        )
                    }
                    is TrophyAnimalSpecResult.Invalid -> {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            TrophyAnimalErrorResponse(error = result.code, fields = result.fields),
                        )
                    }
                }
            }
            get("/auth/status") {
                val user = Auth.currentUser(call)
                call.respond(AuthStatusResponse(authenticated = user != null, user = user))
            }
            get("/auth/providers") {
                call.respond(AuthProvidersResponse(googleConfigured = Auth.googleConfigured, passwordLoginConfigured = Auth.passwordLoginConfigured))
            }
            get("/auth/google/start") {
                Auth.startGoogleLogin(call)
            }
            get("/auth/google/callback") {
                Auth.completeGoogleLogin(call)
            }
            post("/auth/logout") {
                Auth.logout(call)
                call.respond(AuthStatusResponse(authenticated = false))
            }
            post("/auth/login") {
                val request = runCatching { call.receive<LoginRequest>() }.getOrNull()
                if (request == null || !Auth.passwordMatches(request.password)) {
                    call.respond(HttpStatusCode.Unauthorized, AuthStatusResponse(authenticated = false))
                    return@post
                }
                val user = Auth.setPasswordSessionCookie(call)
                call.respond(AuthStatusResponse(authenticated = user != null, user = user))
            }
            route("/admin") {
                get("/users") {
                    if (Auth.requireAdmin(call) == null) return@get
                    call.respond(UserAdminStore.readUsers())
                }
                put("/users/{userId}/status") {
                    val admin = Auth.requireAdmin(call) ?: return@put
                    val userId = call.parameters["userId"]?.toLongOrNull()
                    val request = runCatching { call.receive<UserStatusRequest>() }.getOrNull()
                    if (userId == null || request == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_user_status_request"))
                        return@put
                    }
                    if (userId == admin.id && request.status == UserStatus.suspended) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "cannot_suspend_self"))
                        return@put
                    }
                    val user = UserAdminStore.updateStatus(userId, request.status)
                    if (user == null) {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "user_not_found"))
                        return@put
                    }
                    call.respond(user)
                }
            }
            get("/tests") {
                if (!Auth.requireAuthenticated(call)) return@get
                call.respond(TestsStore.readTests())
            }
            route("/settings") {
                get {
                    val user = Auth.requireUser(call) ?: return@get
                    call.respond(SettingsStore.read(user.id))
                }
                put {
                    val user = Auth.requireUser(call) ?: return@put
                    val request = runCatching { call.receive<AppSettings>() }.getOrNull()
                    if (request == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("ok" to false))
                        return@put
                    }
                    call.respond(SettingsStore.replace(user.id, request))
                }
            }
            route("/trophies") {
                get {
                    val user = Auth.requireUser(call) ?: return@get
                    call.respond(TrophyStore.readAll(user.id))
                }
                post("/award-next") {
                    val user = Auth.requireUser(call) ?: return@post
                    val response = runCatching { TrophyStore.awardNext(user.id) }.getOrElse { error ->
                        val status = if (error.message == "trophy_pool_exhausted") {
                            HttpStatusCode.Conflict
                        } else {
                            HttpStatusCode.InternalServerError
                        }
                        call.respond(status, mapOf("error" to (error.message ?: "trophy_award_failed")))
                        return@post
                    }
                    call.respond(response)
                }
            }
            route("/spelling") {
                get("/sets") {
                    if (!Auth.requireAuthenticated(call)) return@get
                    val language = call.requireLearningLanguage() ?: return@get
                    call.respond(SpellingStore.readSets(language))
                }
                put("/sets") {
                    if (Auth.requireAdmin(call) == null) return@put
                    val language = call.requireLearningLanguage() ?: return@put
                    val request = runCatching { call.receive<SpellingSetsRequest>() }.getOrNull()
                    if (request == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("ok" to false))
                        return@put
                    }
                    call.respond(SpellingStore.replaceSets(request.sets, request.latestSetIndex, language))
                }
                get("/session") {
                    if (!Auth.requireAuthenticated(call)) return@get
                    val language = call.requireLearningLanguage() ?: return@get
                    val mode = call.requireSpellingSessionMode() ?: return@get
                    val session = SpellingStore.readSession(mode, language)
                    if (session == null) {
                        val error = if (mode == SpellingSessionMode.older) "no_older_spelling_sets" else "no_spelling_sets"
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to error))
                        return@get
                    }
                    call.respond(session)
                }
                get("/stats") {
                    val user = Auth.requireUser(call) ?: return@get
                    val language = call.requireLearningLanguage() ?: return@get
                    call.respond(SpellingStatsSnapshot(statsByWord = SpellingStore.snapshot(user.id, language)))
                }
                post("/stats/answer") {
                    val user = Auth.requireUser(call) ?: return@post
                    val language = call.requireLearningLanguage() ?: return@post
                    val request = runCatching { call.receive<SpellingAnswerResultRequest>() }.getOrNull()
                    if (request == null || request.word.isBlank()) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("ok" to false))
                        return@post
                    }
                    val (word, stats) = SpellingStore.record(user.id, request.word, request.correct, request.timedOut, language)
                        ?: run {
                            call.respond(HttpStatusCode.NotFound, mapOf("error" to "word_not_found"))
                            return@post
                    }
                    call.respond(SpellingAnswerResultResponse(word = word, stats = stats))
                }
                post("/stats/session") {
                    val user = Auth.requireUser(call) ?: return@post
                    val language = call.requireLearningLanguage() ?: return@post
                    val request = runCatching { call.receive<WordSessionRequest>() }.getOrNull()
                    if (request == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("ok" to false))
                        return@post
                    }
                    call.respond(SpellingStore.recordSession(user.id, request.results, language))
                }
                get("/audio/words/{word}.mp3") {
                    if (!Auth.requireAuthenticated(call)) return@get
                    val word = call.requireSpellingAudioWord() ?: return@get
                    val language = call.requireLearningLanguage() ?: return@get
                    val kind = call.requireSpellingAudioKind() ?: return@get
                    val audioFile = SpellingAudioService.audioFile(word, kind, language)
                    if (audioFile == null) {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "audio_not_found"))
                        return@get
                    }
                    call.response.headers.append(HttpHeaders.CacheControl, "no-store")
                    call.respondBytes(
                        bytes = java.nio.file.Files.readAllBytes(audioFile),
                        contentType = ContentType.Audio.MPEG,
                    )
                }
                get("/audio/words/{word}") {
                    if (!Auth.requireAuthenticated(call)) return@get
                    val word = call.requireSpellingAudioWord() ?: return@get
                    val language = call.requireLearningLanguage() ?: return@get
                    val kind = call.requireSpellingAudioKind() ?: return@get
                    val response = SpellingAudioService.status(word, kind, language)
                        ?: run {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_word"))
                            return@get
                    }
                    call.respond(response)
                }
                get("/audio/sets") {
                    if (Auth.requireAdmin(call) == null) return@get
                    val language = call.requireLearningLanguage() ?: return@get
                    call.respond(SpellingAudioService.setStatuses(SpellingStore.readSets(language)))
                }
                post("/audio/sets/{setId}/missing") {
                    if (Auth.requireAdmin(call) == null) return@post
                    val language = call.requireLearningLanguage() ?: return@post
                    val setId = call.parameters["setId"]?.toLongOrNull()
                    if (setId == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_spelling_set"))
                        return@post
                    }
                    val set = SpellingStore.readSets(language).firstOrNull { it.id == setId }
                    if (set == null) {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "spelling_set_not_found"))
                        return@post
                    }
                    call.respond(SpellingAudioService.enqueueMissingForSet(set))
                }
                post("/audio/words/{word}") {
                    if (Auth.requireAdmin(call) == null) return@post
                    val word = call.requireSpellingAudioWord() ?: return@post
                    val language = call.requireLearningLanguage() ?: return@post
                    val kind = call.requireSpellingAudioKind() ?: return@post
                    try {
                        val response = SpellingAudioService.enqueueGeneration(word, kind, language)
                            ?: run {
                                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_word"))
                                return@post
                            }
                        call.respond(response)
                    } catch (error: SpellingAudioException) {
                        val status = if (error.message == "tts_not_configured") {
                            HttpStatusCode.ServiceUnavailable
                        } else {
                            HttpStatusCode.BadGateway
                        }
                        call.respond(status, mapOf("error" to (error.message ?: "tts_generation_failed")))
                    }
                }
            }
            route("/flipcards") {
                get("/words") {
                    if (!Auth.requireAuthenticated(call)) return@get
                    val language = call.requireLearningLanguage() ?: return@get
                    call.respond(FlipcardStore.readWords(language))
                }
                put("/words") {
                    if (Auth.requireAdmin(call) == null) return@put
                    val language = call.requireLearningLanguage() ?: return@put
                    val request = runCatching { call.receive<FlipcardWordsRequest>() }.getOrNull()
                    if (request == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("ok" to false))
                        return@put
                    }
                    try {
                        call.respond(FlipcardStore.replaceWords(request, language))
                    } catch (error: IllegalArgumentException) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to (error.message ?: "invalid_flipcard_words")))
                    }
                }
                post("/words/sync-from-spelling") {
                    if (Auth.requireAdmin(call) == null) return@post
                    val language = call.requireLearningLanguage() ?: return@post
                    call.respond(FlipcardStore.syncFromSpelling(language))
                }
                get("/session") {
                    val user = Auth.requireUser(call) ?: return@get
                    val language = call.requireLearningLanguage() ?: return@get
                    val limit = call.request.queryParameters["limit"]?.toIntOrNull()?.coerceAtLeast(1) ?: 10
                    call.respond(FlipcardStore.readSession(user.id, limit, language))
                }
                get("/assets") {
                    if (!Auth.requireAuthenticated(call)) return@get
                    val language = call.requireLearningLanguage() ?: return@get
                    call.respond(FlipcardStore.readAssets(language))
                }
                put("/images/{word}/reported") {
                    if (!Auth.requireAuthenticated(call)) return@put
                    val conceptKey = call.requireFlipcardImageWord() ?: return@put
                    val request = runCatching { call.receive<FlipcardImageReportRequest>() }.getOrNull()
                    if (request == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_report_request"))
                        return@put
                    }
                    val response = FlipcardStore.setImageReported(conceptKey, request.reported)
                    if (response == null) {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "flipcard_concept_not_found"))
                        return@put
                    }
                    call.respond(response)
                }
                post("/images/missing") {
                    if (Auth.requireAdmin(call) == null) return@post
                    val language = call.requireLearningLanguage() ?: return@post
                    try {
                        call.respond(FlipcardStore.enqueueMissingImages(language))
                    } catch (error: FlipcardImageException) {
                        val status = if (error.message == "image_generation_not_configured") {
                            HttpStatusCode.ServiceUnavailable
                        } else {
                            HttpStatusCode.BadGateway
                        }
                        call.respond(status, mapOf("error" to (error.message ?: "image_generation_failed")))
                    }
                }
                post("/audio/missing") {
                    if (Auth.requireAdmin(call) == null) return@post
                    val language = call.requireLearningLanguage() ?: return@post
                    try {
                        call.respond(FlipcardStore.enqueueMissingAudio(language))
                    } catch (error: SpellingAudioException) {
                        val status = if (error.message == "tts_not_configured") {
                            HttpStatusCode.ServiceUnavailable
                        } else {
                            HttpStatusCode.BadGateway
                        }
                        call.respond(status, mapOf("error" to (error.message ?: "tts_generation_failed")))
                    }
                }
                get("/audio-settings") {
                    if (Auth.requireAdmin(call) == null) return@get
                    val language = call.requireLearningLanguage() ?: return@get
                    call.respond(FlipcardStore.readAudioTtsSettings(language))
                }
                put("/audio-settings") {
                    if (Auth.requireAdmin(call) == null) return@put
                    val language = call.requireLearningLanguage() ?: return@put
                    val request = runCatching { call.receive<AudioTtsSettingsRequest>() }.getOrNull()
                    if (request == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_audio_tts_settings"))
                        return@put
                    }
                    try {
                        call.respond(FlipcardStore.replaceAudioTtsSettings(language, request))
                    } catch (error: IllegalArgumentException) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to (error.message ?: "invalid_audio_tts_settings")))
                    }
                }
                post("/audio-settings/test") {
                    if (Auth.requireAdmin(call) == null) return@post
                    val language = call.requireLearningLanguage() ?: return@post
                    val request = runCatching { call.receive<AudioTtsPreviewRequest>() }.getOrNull()
                    if (request == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_audio_tts_preview"))
                        return@post
                    }
                    try {
                        val bytes = SpellingAudioService.generatePreview(
                            rawWord = request.testWord,
                            language = language,
                            voice = request.voice,
                            instructions = request.instructions,
                        )
                        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
                        call.respondBytes(bytes = bytes, contentType = ContentType.Audio.MPEG)
                    } catch (error: IllegalArgumentException) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to (error.message ?: "invalid_audio_tts_preview")))
                    } catch (error: SpellingAudioException) {
                        val status = if (error.message == "tts_not_configured") {
                            HttpStatusCode.ServiceUnavailable
                        } else {
                            HttpStatusCode.BadGateway
                        }
                        call.respond(status, mapOf("error" to (error.message ?: "tts_generation_failed")))
                    }
                }
                get("/translations/status") {
                    if (!Auth.requireAuthenticated(call)) return@get
                    val language = call.requireLearningLanguage() ?: return@get
                    call.respond(FlipcardStore.translationBackfillStatus(language))
                }
                post("/translations/backfill") {
                    if (Auth.requireAdmin(call) == null) return@post
                    val language = call.requireLearningLanguage() ?: return@post
                    try {
                        call.respond(FlipcardStore.enqueueTranslationBackfill(language))
                    } catch (error: FlipcardTranslationException) {
                        val status = if (error.message == "translation_not_configured") {
                            HttpStatusCode.ServiceUnavailable
                        } else {
                            HttpStatusCode.BadGateway
                        }
                        call.respond(status, mapOf("error" to (error.message ?: "translation_backfill_failed")))
                    }
                }
                get("/stats") {
                    val user = Auth.requireUser(call) ?: return@get
                    val language = call.requireLearningLanguage() ?: return@get
                    call.respond(FlipcardStatsSnapshot(statsByWord = FlipcardStore.snapshot(user.id, language)))
                }
                post("/stats/answer") {
                    val user = Auth.requireUser(call) ?: return@post
                    val language = call.requireLearningLanguage() ?: return@post
                    val request = runCatching { call.receive<FlipcardAnswerResultRequest>() }.getOrNull()
                    if (request == null || request.word.isBlank()) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("ok" to false))
                        return@post
                    }
                    val (word, stats) = FlipcardStore.record(user.id, request.word, request.correct, request.timedOut, language)
                        ?: run {
                            call.respond(HttpStatusCode.NotFound, mapOf("error" to "word_not_found"))
                            return@post
                    }
                    call.respond(FlipcardAnswerResultResponse(word = word, stats = stats))
                }
                post("/stats/session") {
                    val user = Auth.requireUser(call) ?: return@post
                    val language = call.requireLearningLanguage() ?: return@post
                    val request = runCatching { call.receive<WordSessionRequest>() }.getOrNull()
                    if (request == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("ok" to false))
                        return@post
                    }
                    call.respond(FlipcardStore.recordSession(user.id, request.results, language))
                }
                get("/images/{word}") {
                    if (!Auth.requireAuthenticated(call)) return@get
                    val rawWord = call.requireFlipcardImageWord() ?: return@get
                    val assetWord = rawWord.flipcardAssetWordOrNull()
                    if (assetWord != null) {
                        val imageFile = FlipcardImageService.imageFile(assetWord)
                        if (imageFile == null) {
                            call.respond(HttpStatusCode.NotFound, mapOf("error" to "image_not_found"))
                            return@get
                        }
                        call.response.headers.append(HttpHeaders.CacheControl, "public, max-age=31536000, immutable")
                        call.respondBytes(
                            bytes = java.nio.file.Files.readAllBytes(imageFile),
                            contentType = ContentType.parse(FlipcardImageService.imageContentType()),
                        )
                        return@get
                    }
                    val word = rawWord
                    val response = FlipcardImageService.status(word)
                        ?: run {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_word"))
                            return@get
                        }
                    call.respond(response)
                }
                post("/images/{word}") {
                    if (Auth.requireAdmin(call) == null) return@post
                    val word = call.requireFlipcardImageWord() ?: return@post
                    val force = call.request.queryParameters["force"] == "true"
                    try {
                        val response = FlipcardImageService.enqueueGeneration(word, force)
                            ?: run {
                                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_word"))
                                return@post
                            }
                        call.respond(response)
                    } catch (error: FlipcardImageException) {
                        val status = if (error.message == "image_generation_not_configured") {
                            HttpStatusCode.ServiceUnavailable
                        } else {
                            HttpStatusCode.BadGateway
                        }
                        call.respond(status, mapOf("error" to (error.message ?: "image_generation_failed")))
                    }
                }
                get("/audio/{language}/{word}.mp3") {
                    if (!Auth.requireAuthenticated(call)) return@get
                    val language = call.requirePathLearningLanguage() ?: return@get
                    val word = call.requireSpellingAudioWord() ?: return@get
                    val audioFile = SpellingAudioService.audioFile(
                        rawWord = word,
                        kind = SpellingAudioKind.word,
                        language = language,
                        useFlipcardSettings = true,
                    )
                    if (audioFile == null) {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "audio_not_found"))
                        return@get
                    }
                    call.response.headers.append(HttpHeaders.CacheControl, "no-store")
                    call.respondBytes(
                        bytes = java.nio.file.Files.readAllBytes(audioFile),
                        contentType = ContentType.Audio.MPEG,
                    )
                }
                get("/audio/{language}/{word}") {
                    if (!Auth.requireAuthenticated(call)) return@get
                    val language = call.requirePathLearningLanguage() ?: return@get
                    val word = call.requireSpellingAudioWord() ?: return@get
                    val response = SpellingAudioService.status(
                        rawWord = word,
                        kind = SpellingAudioKind.word,
                        language = language,
                        useFlipcardSettings = true,
                    )
                        ?: run {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_word"))
                            return@get
                        }
                    call.respond(response)
                }
                post("/audio/{language}/{word}") {
                    if (Auth.requireAdmin(call) == null) return@post
                    val language = call.requirePathLearningLanguage() ?: return@post
                    val word = call.requireSpellingAudioWord() ?: return@post
                    val force = call.request.queryParameters["force"] == "true"
                    try {
                        val response = SpellingAudioService.enqueueGeneration(
                            rawWord = word,
                            kind = SpellingAudioKind.word,
                            language = language,
                            jobKind = ArtifactJobKind.flipcard_audio_word,
                            force = force,
                        )
                            ?: run {
                                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_word"))
                                return@post
                            }
                        call.respond(response)
                    } catch (error: SpellingAudioException) {
                        val status = if (error.message == "tts_not_configured") {
                            HttpStatusCode.ServiceUnavailable
                        } else {
                            HttpStatusCode.BadGateway
                        }
                        call.respond(status, mapOf("error" to (error.message ?: "tts_generation_failed")))
                    }
                }
            }
            route("/tests/{testId}") {
                get("/questions") {
                    if (!Auth.requireAuthenticated(call)) return@get
                    val testId = call.requireQuizTestId() ?: return@get
                    call.respond(QuestionsStore.readQuestions(testId))
                }
                get("/stats") {
                    val user = Auth.requireUser(call) ?: return@get
                    val testId = call.requireQuizTestId() ?: return@get
                    val direction = call.requirePracticeDirection() ?: return@get
                    call.respond(QuestionStatsSnapshot(statsByQuestionId = StatsStore.snapshot(user.id, testId, direction)))
                }
                post("/stats/answer") {
                    val user = Auth.requireUser(call) ?: return@post
                    val testId = call.requireQuizTestId() ?: return@post
                    val request = runCatching { call.receive<AnswerResultRequest>() }.getOrNull()
                    if (request == null || request.questionId <= 0) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("ok" to false))
                        return@post
                    }
                    val (questionId, stats) = StatsStore.record(
                        user.id,
                        testId,
                        request.questionId,
                        request.correct,
                        request.timedOut,
                        request.direction,
                    )
                        ?: run {
                            call.respond(HttpStatusCode.NotFound, mapOf("error" to "question_not_found"))
                            return@post
                    }
                    call.respond(AnswerResultResponse(questionId = questionId, stats = stats))
                }
                post("/stats/session") {
                    val user = Auth.requireUser(call) ?: return@post
                    val testId = call.requireQuizTestId() ?: return@post
                    val request = runCatching { call.receive<AnswerSessionRequest>() }.getOrNull()
                    if (request == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("ok" to false))
                        return@post
                    }
                    call.respond(StatsStore.recordSession(user.id, testId, request.results))
                }
            }
        }

        get("/") {
            call.respondStaticOrIndex(staticDir)
        }
        get("{...}") {
            call.respondStaticOrIndex(staticDir)
        }
    }
}

private suspend fun ApplicationCall.requireQuizTestId(): Long? {
    val testId = parameters["testId"]?.toLongOrNull()
    if (testId == null || !TestsStore.exists(testId)) {
        respond(HttpStatusCode.NotFound, mapOf("error" to "test_not_found"))
        return null
    }
    return testId
}

private suspend fun ApplicationCall.requireSpellingSessionMode(): SpellingSessionMode? {
    val rawMode = request.queryParameters["mode"] ?: SpellingSessionMode.latest.name
    val mode = SpellingSessionMode.entries.firstOrNull { it.name == rawMode }
    if (mode == null) {
        respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_spelling_session_mode"))
        return null
    }
    return mode
}

private suspend fun ApplicationCall.requireLearningLanguage(): LearningLanguage? {
    val rawLanguage = request.queryParameters["language"] ?: LearningLanguage.en.name
    val language = LearningLanguage.entries.firstOrNull { it.name == rawLanguage }
    if (language == null) {
        respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_language"))
        return null
    }
    return language
}

private suspend fun ApplicationCall.requirePathLearningLanguage(): LearningLanguage? {
    val rawLanguage = parameters["language"] ?: LearningLanguage.en.name
    val language = LearningLanguage.entries.firstOrNull { it.name == rawLanguage }
    if (language == null) {
        respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_language"))
        return null
    }
    return language
}

private suspend fun ApplicationCall.requireSpellingAudioWord(): String? {
    val word = parameters["word"]?.removeSuffix(".mp3")?.trim()
    if (word.isNullOrBlank()) {
        respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_word"))
        return null
    }
    return word
}

private suspend fun ApplicationCall.requireSpellingAudioKind(): SpellingAudioKind? {
    val rawKind = request.queryParameters["kind"] ?: SpellingAudioKind.word.name
    val kind = SpellingAudioKind.entries.firstOrNull { it.name == rawKind }
    if (kind == null) {
        respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_audio_kind"))
        return null
    }
    return kind
}

private suspend fun ApplicationCall.requireFlipcardImageWord(): String? {
    val word = parameters["word"]?.trim()
    if (word.isNullOrBlank()) {
        respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_word"))
        return null
    }
    return word
}

private suspend fun ApplicationCall.requirePracticeDirection(): PracticeDirection? {
    val rawDirection = parameters["direction"] ?: return PracticeDirection.product_to_factors
    return runCatching { PracticeDirection.valueOf(rawDirection) }.getOrNull()
        ?: run {
            respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_direction"))
            null
        }
}

private fun String.flipcardAssetWordOrNull(): String? {
    val extension = substringAfterLast('.', missingDelimiterValue = "").lowercase()
    if (extension !in setOf("webp", "png", "jpeg", "jpg")) return null
    return substringBeforeLast('.').takeIf { it.isNotBlank() }
}

private suspend fun io.ktor.server.application.ApplicationCall.respondStaticOrIndex(staticDir: File) {
    val root = staticDir.canonicalFile
    val requestedPath = request.path().trimStart('/').ifBlank { "index.html" }
    val requestedFile = root.resolve(requestedPath).canonicalFile
    if (requestedFile.isFile && requestedFile.toPath().startsWith(root.toPath())) {
        respondFile(requestedFile)
        return
    }

    val indexFile = root.resolve("index.html")
    if (indexFile.isFile) {
        respondFile(indexFile)
    } else {
        respond(HttpStatusCode.NotFound)
    }
}
