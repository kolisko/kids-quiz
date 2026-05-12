package com.example.quiz

import io.ktor.http.Cookie
import io.ktor.http.HttpHeaders
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import java.security.MessageDigest

private const val PasswordHashEnv = "KIDS_QUIZ_PASSWORD_HASH"
private const val SecureCookieEnv = "KIDS_QUIZ_AUTH_COOKIE_SECURE"
private const val SessionCookieName = "kids_quiz_session"
private const val SessionMaxAgeSeconds = 60 * 60 * 24 * 30

object Auth {
    private val configuredPasswordHash = System.getenv(PasswordHashEnv)
        ?.removePrefix("sha256:")
        ?.trim()
        ?.lowercase()
        .orEmpty()
    private val secureCookie = System.getenv(SecureCookieEnv)
        ?.lowercase()
        ?.let { it == "true" || it == "1" || it == "yes" }
        ?: false

    val required: Boolean get() = configuredPasswordHash.isNotBlank()

    fun isAuthenticated(call: ApplicationCall): Boolean {
        if (!required) return true
        return requestCookie(call, SessionCookieName) == sessionToken()
    }

    fun passwordMatches(password: String): Boolean {
        if (!required) return true
        val submittedHash = sha256(password)
        return MessageDigest.isEqual(
            configuredPasswordHash.toByteArray(Charsets.UTF_8),
            submittedHash.toByteArray(Charsets.UTF_8),
        )
    }

    fun setSessionCookie(call: ApplicationCall) {
        call.response.cookies.append(
            Cookie(
                name = SessionCookieName,
                value = sessionToken(),
                path = "/",
                maxAge = SessionMaxAgeSeconds,
                httpOnly = true,
                secure = secureCookie,
                extensions = mapOf("SameSite" to "Lax"),
            ),
        )
    }

    suspend fun requireAuthenticated(call: ApplicationCall): Boolean {
        if (isAuthenticated(call)) return true
        call.respond(io.ktor.http.HttpStatusCode.Unauthorized, AuthStatusResponse(authenticated = false))
        return false
    }

    private fun sessionToken(): String = sha256("kids-quiz-session:$configuredPasswordHash")

    private fun requestCookie(call: ApplicationCall, name: String): String? {
        return call.request.headers[HttpHeaders.Cookie]
            ?.split(';')
            ?.map { it.trim() }
            ?.firstNotNullOfOrNull { cookie ->
                val separator = cookie.indexOf('=')
                if (separator <= 0) return@firstNotNullOfOrNull null
                val cookieName = cookie.substring(0, separator)
                val cookieValue = cookie.substring(separator + 1)
                cookieValue.takeIf { cookieName == name }
            }
    }

    private fun sha256(value: String): String {
        val bytes = MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { byte -> "%02x".format(byte) }
    }
}
