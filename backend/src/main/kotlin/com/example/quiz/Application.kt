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
import io.ktor.server.request.receive
import io.ktor.server.request.receiveText
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
            get("/questions") {
                if (!Auth.requireAuthenticated(call)) return@get
                call.respond(QuestionsStore.readQuestions())
            }
            post("/questions") {
                if (!Auth.requireAuthenticated(call)) return@post
                val body = call.receiveText()
                if (!QuestionsStore.replaceQuestions(body)) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("ok" to false))
                    return@post
                }
                call.respond(mapOf("ok" to true))
            }
            get("/stats") {
                if (!Auth.requireAuthenticated(call)) return@get
                call.respond(QuestionStatsSnapshot(statsByKey = StatsStore.snapshot()))
            }
            post("/stats/answer") {
                if (!Auth.requireAuthenticated(call)) return@post
                val request = runCatching { call.receive<AnswerResultRequest>() }.getOrNull()
                if (request == null || request.q.isBlank() || request.a.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("ok" to false))
                    return@post
                }
                val (key, stats) = StatsStore.record(request.q, request.a, request.correct, request.timedOut)
                call.respond(AnswerResultResponse(key = key, stats = stats))
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
