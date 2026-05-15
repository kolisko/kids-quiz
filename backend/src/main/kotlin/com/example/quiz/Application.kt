package com.example.quiz

import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
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
import io.ktor.server.response.respondFile
import io.ktor.server.routing.get
import io.ktor.server.routing.post
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
        allowHost("beatka.duckdns.org", schemes = listOf("https"))
        allowHost("localhost:8080", schemes = listOf("http"))
        allowHost("127.0.0.1:8080", schemes = listOf("http"))
        allowHost("localhost:4200", schemes = listOf("http"))
        allowHost("127.0.0.1:4200", schemes = listOf("http"))
        allowHeader(HttpHeaders.ContentType)
        allowHeader(HttpHeaders.Authorization)
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
    }
    install(StatusPages) {
        exception<Throwable> { call, cause ->
            appLog.error("Unhandled request failure", cause)
            call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "internal_error"))
        }
    }

    DatabaseMigrator.ensureMigrated()

    val staticDir = runtimeStaticDir().toFile()
    routing {
        route("/api") {
            get("/health") {
                call.respond(mapOf("ok" to true))
            }
            get("/auth/status") {
                call.respond(AuthStatusResponse(authenticated = Auth.isAuthenticated(call)))
            }
            post("/auth/login") {
                val request = runCatching { call.receive<LoginRequest>() }.getOrNull()
                if (request == null || !Auth.passwordMatches(request.password)) {
                    call.respond(HttpStatusCode.Unauthorized, AuthStatusResponse(authenticated = false))
                    return@post
                }
                Auth.setSessionCookie(call)
                call.respond(AuthStatusResponse(authenticated = true))
            }
            get("/tests") {
                if (!Auth.requireAuthenticated(call)) return@get
                call.respond(TestsStore.readTests())
            }
            route("/tests/{testId}") {
                get("/questions") {
                    if (!Auth.requireAuthenticated(call)) return@get
                    val testId = call.requireQuizTestId() ?: return@get
                    call.respond(QuestionsStore.readQuestions(testId))
                }
                get("/stats") {
                    if (!Auth.requireAuthenticated(call)) return@get
                    val testId = call.requireQuizTestId() ?: return@get
                    val direction = call.requirePracticeDirection() ?: return@get
                    call.respond(QuestionStatsSnapshot(statsByQuestionId = StatsStore.snapshot(testId, direction)))
                }
                post("/stats/answer") {
                    if (!Auth.requireAuthenticated(call)) return@post
                    val testId = call.requireQuizTestId() ?: return@post
                    val request = runCatching { call.receive<AnswerResultRequest>() }.getOrNull()
                    if (request == null || request.questionId <= 0) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("ok" to false))
                        return@post
                    }
                    val (questionId, stats) = StatsStore.record(
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

private suspend fun ApplicationCall.requirePracticeDirection(): PracticeDirection? {
    val rawDirection = parameters["direction"] ?: return PracticeDirection.product_to_factors
    return runCatching { PracticeDirection.valueOf(rawDirection) }.getOrNull()
        ?: run {
            respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_direction"))
            null
        }
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
