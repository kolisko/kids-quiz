package com.example.quiz.api

import com.varabyte.kobweb.api.ApiContext
import com.varabyte.kobweb.api.http.Body
import com.varabyte.kobweb.api.http.json
import java.security.MessageDigest

private const val PasswordHashEnv = "KIDS_QUIZ_PASSWORD_HASH"
private const val SecureCookieEnv = "KIDS_QUIZ_AUTH_COOKIE_SECURE"
private const val SessionCookieName = "kids_quiz_session"
private const val SessionMaxAgeSeconds = 60 * 60 * 24 * 30

internal object Auth {
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

    fun isAuthenticated(ctx: ApiContext): Boolean {
        if (!required) return true
        return cookieValue(ctx, SessionCookieName) == sessionToken()
    }

    fun passwordMatches(password: String): Boolean {
        if (!required) return true
        val submittedHash = sha256(password)
        return MessageDigest.isEqual(
            configuredPasswordHash.toByteArray(Charsets.UTF_8),
            submittedHash.toByteArray(Charsets.UTF_8),
        )
    }

    fun setSessionCookie(ctx: ApiContext) {
        ctx.res.headers["Set-Cookie"] = buildString {
            append(SessionCookieName)
            append('=')
            append(sessionToken())
            append("; Path=/; Max-Age=")
            append(SessionMaxAgeSeconds)
            append("; HttpOnly; SameSite=Lax")
            if (secureCookie) append("; Secure")
        }
    }

    fun requireAuthenticated(ctx: ApiContext): Boolean {
        if (isAuthenticated(ctx)) return true
        ctx.res.status = 401
        ctx.res.headers["Content-Type"] = "application/json"
        ctx.res.body = Body.json("""{"authenticated":false}""")
        return false
    }

    private fun sessionToken(): String = sha256("kids-quiz-session:$configuredPasswordHash")

    private fun cookieValue(ctx: ApiContext, name: String): String? {
        return ctx.req.cookies[name]?.takeIf { it.isNotBlank() }
    }

    private fun sha256(value: String): String {
        val bytes = MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { byte -> "%02x".format(byte) }
    }
}
