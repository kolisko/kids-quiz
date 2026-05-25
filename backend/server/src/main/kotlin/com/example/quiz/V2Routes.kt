package com.example.quiz

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.v2Routes(services: ApplicationServices) {
    get("/health") {
        call.respond(mapOf("ok" to true))
    }.document(
        tag = ApiTags.Session,
        operationId = "getHealth",
        summary = "Health check",
        description = "Returns a small readiness signal for the running Kids Quiz server.",
    ) {
        ok<Map<String, Boolean>>("The server is running and can serve API requests.")
    }

    route("/session") {
        get {
            call.respond(AuthStatusResponse(authenticated = Auth.isAuthenticated(call)))
        }.document(
            tag = ApiTags.Session,
            operationId = "getSession",
            summary = "Read session status",
            description = "Returns whether the current request has a valid Kids Quiz session cookie. If app authentication is disabled, this is always authenticated.",
        ) {
            ok<AuthStatusResponse>("Current authentication state.")
        }
        post("/login") {
            val request = call.receiveOrNull<LoginRequest>()
            if (request == null || !Auth.passwordMatches(request.password)) {
                call.respond(HttpStatusCode.Unauthorized, AuthStatusResponse(authenticated = false))
                return@post
            }
            Auth.setSessionCookie(call)
            call.respond(AuthStatusResponse(authenticated = true))
        }.document(
            tag = ApiTags.Session,
            operationId = "login",
            summary = "Create session",
            description = "Validates the shared password and sets the `kids_quiz_session` HTTP-only cookie on success.",
            requestBody = { jsonBody<LoginRequest>("Password submitted from the login screen.") },
        ) {
            ok<AuthStatusResponse>("Session cookie was issued.")
            unauthorized("Password is missing or invalid.")
        }
    }

    route("/settings") {
        get {
            if (!Auth.requireAuthenticated(call)) return@get
            call.respond(services.settings.read())
        }.document(
            tag = ApiTags.Settings,
            operationId = "getSettings",
            summary = "Read global settings",
            description = "Reads game timing, target score, celebration and audio preferences shared by the frontend.",
        ) {
            ok<AppSettings>("Persisted application settings.")
            unauthorized()
        }
        put {
            if (!Auth.requireAuthenticated(call)) return@put
            val request = call.receiveOrNull<AppSettings>()
            if (request == null) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_settings"))
                return@put
            }
            call.respond(services.settings.replace(request))
        }.document(
            tag = ApiTags.Settings,
            operationId = "updateSettings",
            summary = "Update global settings",
            description = "Replaces application settings. Numeric values are normalized by application use cases before persistence.",
            requestBody = { jsonBody<AppSettings>("Complete settings payload to persist.") },
        ) {
            ok<AppSettings>("Saved settings after normalization.")
            badRequest("The settings payload is missing or invalid.")
            unauthorized()
        }
    }

    get("/activities") {
        if (!Auth.requireAuthenticated(call)) return@get
        call.respond(services.activities.catalog())
    }.document(
        tag = ApiTags.Activities,
        operationId = "listActivities",
        summary = "List activities",
        description = "Returns all activities the home screen can offer, including multiplication tests and language-based spelling or flipcards modes.",
    ) {
        ok<ActivityCatalog>("Activity catalog grouped by domain data.")
        unauthorized()
    }

    route("/practice") {
        post("/deck") {
            if (!Auth.requireAuthenticated(call)) return@post
            val request = call.receiveOrNull<PracticeDeckRequest>()
            if (request == null || request.activityId.isBlank()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_practice_deck_request"))
                return@post
            }
            val deck = services.practice.deck(request)
            if (deck == null) {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "practice_deck_not_found"))
                return@post
            }
            call.respond(deck)
        }.document(
            tag = ApiTags.Practice,
            operationId = "createPracticeDeck",
            summary = "Load practice deck",
            description = "Builds a practice deck for a selected activity and mode. The response includes questions or words, settings, current stats and flipcard asset metadata when applicable.",
            requestBody = { jsonBody<PracticeDeckRequest>("Activity id, mode and optional limit for the practice session.") },
        ) {
            ok<PracticeDeck>("Practice deck ready for the frontend practice engine.")
            badRequest("The activity id or deck request is invalid.")
            unauthorized()
            notFound("No deck can be created for the requested activity or mode.")
        }
        post("/answers") {
            if (!Auth.requireAuthenticated(call)) return@post
            val request = call.receiveOrNull<PracticeAnswerRequestV2>()
            if (request == null || request.activityId.isBlank() || request.itemId.isBlank()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_practice_answer"))
                return@post
            }
            val response = services.practice.record(request)
            if (response == null) {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "practice_item_not_found"))
                return@post
            }
            call.respond(response)
        }.document(
            tag = ApiTags.Practice,
            operationId = "recordPracticeAnswer",
            summary = "Record practice answer",
            description = "Records a correct, wrong or timeout result for multiplication, spelling or flipcards and returns the updated adaptive stats for that item.",
            requestBody = { jsonBody<PracticeAnswerRequestV2>("Answer result emitted by the practice screen.") },
        ) {
            ok<PracticeAnswerResponseV2>("Updated stats for the answered item.")
            badRequest("The answer payload is missing an activity id, item id or valid result.")
            unauthorized()
            notFound("The referenced practice item does not exist.")
        }
    }

    route("/content") {
        route("/spelling/sets") {
            get {
                if (!Auth.requireAuthenticated(call)) return@get
                val language = call.queryLearningLanguage() ?: return@get
                call.respond(services.content.spellingSets(language))
            }.document(
                tag = ApiTags.Content,
                operationId = "listSpellingSets",
                summary = "List spelling sets",
                description = "Reads all spelling sets for a language, including parsed words and which set is marked as latest.",
                parameters = { languageQuery() },
            ) {
                ok<List<SpellingSet>>("Spelling sets for the requested language.")
                badRequest("The language query value is unsupported.")
                unauthorized()
            }
            put {
                if (!Auth.requireAuthenticated(call)) return@put
                val language = call.queryLearningLanguage() ?: return@put
                val request = call.receiveOrNull<SpellingSetsRequest>()
                if (request == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_spelling_sets"))
                    return@put
                }
                call.respond(services.content.replaceSpellingSets(language, request))
            }.document(
                tag = ApiTags.Content,
                operationId = "replaceSpellingSets",
                summary = "Replace spelling sets",
                description = "Replaces the spelling content for one language while preserving additive database migrations and existing unrelated data.",
                parameters = { languageQuery() },
                requestBody = { jsonBody<SpellingSetsRequest>("New spelling sets and the optional latest-set index.") },
            ) {
                ok<List<SpellingSet>>("Saved spelling sets after normalization.")
                badRequest("The language or spelling set payload is invalid.")
                unauthorized()
            }
        }
        route("/flipcards/words") {
            get {
                if (!Auth.requireAuthenticated(call)) return@get
                val language = call.queryLearningLanguage() ?: return@get
                call.respond(services.content.flipcardWords(language))
            }.document(
                tag = ApiTags.Content,
                operationId = "listFlipcardWords",
                summary = "List flipcard words",
                description = "Reads flipcard vocabulary for a language, including normalized keys used by stats and asset lookup.",
                parameters = { languageQuery() },
            ) {
                ok<FlipcardWordsResponse>("Flipcard vocabulary for the requested language.")
                badRequest("The language query value is unsupported.")
                unauthorized()
            }
            put {
                if (!Auth.requireAuthenticated(call)) return@put
                val language = call.queryLearningLanguage() ?: return@put
                val request = call.receiveOrNull<FlipcardWordsRequest>()
                if (request == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_flipcard_words"))
                    return@put
                }
                call.respond(services.content.replaceFlipcardWords(language, request))
            }.document(
                tag = ApiTags.Content,
                operationId = "replaceFlipcardWords",
                summary = "Replace flipcard words",
                description = "Replaces flipcard vocabulary for one language. Words are parsed, normalized and de-duplicated by the persistence adapter.",
                parameters = { languageQuery() },
                requestBody = { jsonBody<FlipcardWordsRequest>("Raw newline-separated flipcard words.") },
            ) {
                ok<FlipcardWordsResponse>("Saved flipcard vocabulary after normalization.")
                badRequest("The language or flipcard word payload is invalid.")
                unauthorized()
            }
        }
    }

    route("/assets") {
        get("/flipcards") {
            if (!Auth.requireAuthenticated(call)) return@get
            val language = call.queryLearningLanguage() ?: return@get
            call.respond(services.assets.flipcardAssets(language))
        }.document(
            tag = ApiTags.Assets,
            operationId = "listFlipcardAssets",
            summary = "List flipcard assets",
            description = "Returns image, audio and translation readiness for flipcard words. Ready assets include cache URLs served by the backend.",
            parameters = { languageQuery() },
        ) {
            ok<FlipcardAssetsResponse>("Flipcard asset state for the requested language.")
            badRequest("The language query value is unsupported.")
            unauthorized()
        }
        post("/flipcards/images/missing") {
            if (!Auth.requireAuthenticated(call)) return@post
            val language = call.queryLearningLanguage() ?: return@post
            call.respondHandlingArtifactErrors {
                services.assets.enqueueMissingImages(language)
            }
        }.document(
            tag = ApiTags.Assets,
            operationId = "enqueueMissingFlipcardImages",
            summary = "Queue missing flipcard images",
            description = "Queues image generation jobs only for flipcard words whose image cache entry is not ready.",
            parameters = { languageQuery() },
        ) {
            ok<FlipcardAssetBulkEnqueueResponse>("Queue result with ready, active and newly queued counts.")
            badRequest("The language query value is unsupported.")
            unauthorized()
            assetGenerationErrors()
        }
        post("/flipcards/audio/missing") {
            if (!Auth.requireAuthenticated(call)) return@post
            val language = call.queryLearningLanguage() ?: return@post
            call.respondHandlingArtifactErrors {
                services.assets.enqueueMissingAudio(language)
            }
        }.document(
            tag = ApiTags.Assets,
            operationId = "enqueueMissingFlipcardAudio",
            summary = "Queue missing flipcard audio",
            description = "Queues backend MP3 generation jobs only for flipcard words whose word-audio cache entry is not ready.",
            parameters = { languageQuery() },
        ) {
            ok<FlipcardAssetBulkEnqueueResponse>("Queue result with ready, active and newly queued counts.")
            badRequest("The language query value is unsupported.")
            unauthorized()
            assetGenerationErrors()
        }
        get("/images/{word}") {
            if (!Auth.requireAuthenticated(call)) return@get
            val word = call.pathWord() ?: return@get
            val response = services.assets.flipcardImageStatus(word)
            if (response == null) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_word"))
                return@get
            }
            call.respond(response)
        }.document(
            tag = ApiTags.Assets,
            operationId = "getFlipcardImageStatus",
            summary = "Read image status",
            description = "Reads the image generation/cache state for one flipcard concept.",
            parameters = { wordPath() },
        ) {
            ok<FlipcardImageResponse>("Image status and URL when the image is ready.")
            badRequest("The word path parameter is blank or unknown.")
            unauthorized()
        }
        post("/images/{word}") {
            if (!Auth.requireAuthenticated(call)) return@post
            val word = call.pathWord() ?: return@post
            val force = call.request.queryParameters["force"] == "true"
            call.respondHandlingArtifactErrors {
                services.assets.enqueueFlipcardImage(word, force)
                    ?: throw InvalidAssetRequestException("invalid_word")
            }
        }.document(
            tag = ApiTags.Assets,
            operationId = "enqueueFlipcardImage",
            summary = "Queue image generation",
            description = "Queues or re-queues image generation for one flipcard concept.",
            parameters = {
                wordPath()
                forceQuery()
            },
        ) {
            ok<FlipcardImageResponse>("Image status after queueing or skipping generation.")
            badRequest("The word path parameter is blank or unknown.")
            unauthorized()
            assetGenerationErrors()
        }
        get("/audio/{word}") {
            if (!Auth.requireAuthenticated(call)) return@get
            val word = call.pathWord() ?: return@get
            val language = call.queryLearningLanguage() ?: return@get
            val kind = call.queryAudioKind() ?: return@get
            val response = services.assets.audioStatus(AssetStatusRequest(word = word, language = language, kind = kind))
            if (response == null) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_word"))
                return@get
            }
            call.respond(response)
        }.document(
            tag = ApiTags.Assets,
            operationId = "getAudioStatus",
            summary = "Read audio status",
            description = "Reads backend MP3 generation/cache state for one word and audio kind.",
            parameters = {
                wordPath()
                languageQuery()
                audioKindQuery()
            },
        ) {
            ok<SpellingAudioWordResponse>("Audio status and URL when MP3 is ready.")
            badRequest("The word, language or audio kind is invalid.")
            unauthorized()
        }
        post("/audio/{word}") {
            if (!Auth.requireAuthenticated(call)) return@post
            val word = call.pathWord() ?: return@post
            val language = call.queryLearningLanguage() ?: return@post
            val kind = call.queryAudioKind() ?: return@post
            val force = call.request.queryParameters["force"] == "true"
            val forFlipcard = call.request.queryParameters["forFlipcard"] == "true"
            call.respondHandlingArtifactErrors {
                services.assets.enqueueAudio(
                    AssetStatusRequest(word = word, language = language, kind = kind),
                    force = force,
                    forFlipcard = forFlipcard,
                ) ?: throw InvalidAssetRequestException("invalid_word")
            }
        }.document(
            tag = ApiTags.Assets,
            operationId = "enqueueAudio",
            summary = "Queue audio generation",
            description = "Queues or re-queues backend MP3 generation for one word and audio kind.",
            parameters = {
                wordPath()
                languageQuery()
                audioKindQuery()
                forceQuery()
                forFlipcardQuery()
            },
        ) {
            ok<SpellingAudioWordResponse>("Audio status after queueing or skipping generation.")
            badRequest("The word, language or audio kind is invalid.")
            unauthorized()
            assetGenerationErrors()
        }
        get("/translations") {
            if (!Auth.requireAuthenticated(call)) return@get
            val language = call.queryLearningLanguage() ?: return@get
            call.respond(services.assets.translationStatus(language))
        }.document(
            tag = ApiTags.Assets,
            operationId = "getTranslationStatus",
            summary = "Read translation status",
            description = "Reads translation backfill progress for flipcard vocabulary in one language.",
            parameters = { languageQuery() },
        ) {
            ok<FlipcardTranslationBackfillStatusResponse>("Translation readiness for the requested language.")
            badRequest("The language query value is unsupported.")
            unauthorized()
        }
        post("/translations") {
            if (!Auth.requireAuthenticated(call)) return@post
            val language = call.queryLearningLanguage() ?: return@post
            call.respondHandlingArtifactErrors {
                services.assets.enqueueTranslations(language)
            }
        }.document(
            tag = ApiTags.Assets,
            operationId = "enqueueTranslationBackfill",
            summary = "Queue translation backfill",
            description = "Queues translation generation for missing flipcard translations in one language.",
            parameters = { languageQuery() },
        ) {
            ok<FlipcardTranslationBackfillStatusResponse>("Translation backfill state after queueing.")
            badRequest("The language query value is unsupported.")
            unauthorized()
            assetGenerationErrors()
        }
    }

    route("/trophies") {
        get {
            if (!Auth.requireAuthenticated(call)) return@get
            call.respond(services.trophies.read())
        }.document(
            tag = ApiTags.Trophies,
            operationId = "listTrophies",
            summary = "List trophies",
            description = "Returns all awarded trophies with animal image paths and win counters.",
        ) {
            ok<List<TrophyItem>>("Awarded trophies ordered by persistence adapter.")
            unauthorized()
        }
        post {
            if (!Auth.requireAuthenticated(call)) return@post
            val request = call.receiveOrNull<TrophyAwardRequest>()
            if (request == null) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_trophy"))
                return@post
            }
            val trophies = services.trophies.award(request)
            if (trophies == null) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_trophy"))
                return@post
            }
            call.respond(trophies)
        }.document(
            tag = ApiTags.Trophies,
            operationId = "awardTrophy",
            summary = "Award trophy",
            description = "Awards an animal trophy after a celebration-worthy practice session and returns the updated trophy list.",
            requestBody = { jsonBody<TrophyAwardRequest>("Animal trophy key such as `animal-01`.") },
        ) {
            ok<List<TrophyItem>>("Updated trophy list after awarding the requested animal.")
            badRequest("The trophy payload is missing or the animal key is unsupported.")
            unauthorized()
        }
    }
}

private suspend inline fun <reified T : Any> ApplicationCall.receiveOrNull(): T? =
    runCatching { receive<T>() }.getOrNull()

private suspend fun ApplicationCall.queryLearningLanguage(): LearningLanguage? {
    val raw = request.queryParameters["language"] ?: LearningLanguage.en.name
    val language = raw.toLearningLanguageOrNull()
    if (language == null) {
        respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_language"))
        return null
    }
    return language
}

private suspend fun ApplicationCall.queryAudioKind(): SpellingAudioKind? {
    val raw = request.queryParameters["kind"] ?: SpellingAudioKind.word.name
    val kind = SpellingAudioKind.entries.firstOrNull { it.name == raw }
    if (kind == null) {
        respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_audio_kind"))
        return null
    }
    return kind
}

private suspend fun ApplicationCall.pathWord(): String? {
    val word = parameters["word"]?.removeSuffix(".mp3")?.trim()
    if (word.isNullOrBlank()) {
        respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_word"))
        return null
    }
    return word
}

private suspend fun ApplicationCall.respondHandlingArtifactErrors(block: () -> Any) {
    try {
        respond(block())
    } catch (error: InvalidAssetRequestException) {
        respond(HttpStatusCode.BadRequest, mapOf("error" to error.code))
    } catch (error: SpellingAudioException) {
        respond(artifactStatus(error.message), mapOf("error" to (error.message ?: "tts_generation_failed")))
    } catch (error: FlipcardImageException) {
        respond(artifactStatus(error.message), mapOf("error" to (error.message ?: "image_generation_failed")))
    } catch (error: FlipcardTranslationException) {
        respond(artifactStatus(error.message), mapOf("error" to (error.message ?: "translation_backfill_failed")))
    }
}

private fun artifactStatus(message: String?): HttpStatusCode =
    if (message?.endsWith("_not_configured") == true) HttpStatusCode.ServiceUnavailable else HttpStatusCode.BadGateway

private class InvalidAssetRequestException(val code: String) : RuntimeException(code)
