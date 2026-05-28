package com.example.quiz

import io.ktor.http.Cookie
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.host
import io.ktor.server.response.respond
import io.ktor.server.response.respondRedirect
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.MessageDigest
import java.security.SecureRandom

private const val PasswordHashEnv = "KIDS_QUIZ_PASSWORD_HASH"
private const val SecureCookieEnv = "KIDS_QUIZ_AUTH_COOKIE_SECURE"
private const val GoogleClientIdEnv = "KIDS_QUIZ_GOOGLE_CLIENT_ID"
private const val GoogleClientSecretEnv = "KIDS_QUIZ_GOOGLE_CLIENT_SECRET"
private const val PublicBaseUrlEnv = "KIDS_QUIZ_PUBLIC_BASE_URL"
private const val SessionCookieName = "kids_quiz_session"
private const val OAuthStateCookieName = "kids_quiz_oauth_state"
private const val SessionMaxAgeSeconds = 60 * 60 * 24 * 30
private const val OAuthStateMaxAgeSeconds = 60 * 10

data class OAuthProfile(
    val provider: String,
    val subject: String,
    val email: String,
    val emailVerified: Boolean,
    val displayName: String? = null,
    val givenName: String? = null,
    val familyName: String? = null,
    val pictureUrl: String? = null,
    val locale: String? = null,
    val rawProfileJson: String,
)

object Auth {
    private val configuredPasswordHash = System.getenv(PasswordHashEnv)
        ?.removePrefix("sha256:")
        ?.trim()
        ?.lowercase()
        .orEmpty()
    private val googleClientId = System.getenv(GoogleClientIdEnv).orEmpty()
    private val googleClientSecret = System.getenv(GoogleClientSecretEnv).orEmpty()
    private val secureCookie = System.getenv(SecureCookieEnv)
        ?.lowercase()
        ?.let { it == "true" || it == "1" || it == "yes" }
        ?: false
    private val random = SecureRandom()
    private val httpClient = HttpClient.newHttpClient()
    private val json = Json { ignoreUnknownKeys = true }

    val googleConfigured: Boolean get() = googleClientId.isNotBlank() && googleClientSecret.isNotBlank()
    val passwordLoginConfigured: Boolean get() = configuredPasswordHash.isNotBlank()

    fun currentUser(call: ApplicationCall): AuthUser? {
        val token = requestCookie(call, SessionCookieName)?.takeIf { it.isNotBlank() } ?: return null
        return Database.useConnection { connection -> connection.readUserBySessionToken(token) }
            ?.takeIf { it.status == UserStatus.active }
    }

    fun isAuthenticated(call: ApplicationCall): Boolean = currentUser(call) != null

    suspend fun requireUser(call: ApplicationCall): AuthUser? {
        val user = currentUser(call)
        if (user != null) return user
        call.respond(HttpStatusCode.Unauthorized, AuthStatusResponse(authenticated = false))
        return null
    }

    suspend fun requireAdmin(call: ApplicationCall): AuthUser? {
        val user = requireUser(call) ?: return null
        if (user.role == UserRole.admin) return user
        call.respond(HttpStatusCode.Forbidden, mapOf("error" to "admin_required"))
        return null
    }

    suspend fun requireAuthenticated(call: ApplicationCall): Boolean = requireUser(call) != null

    fun passwordMatches(password: String): Boolean {
        if (!passwordLoginConfigured) return false
        val submittedHash = sha256(password)
        return MessageDigest.isEqual(
            configuredPasswordHash.toByteArray(Charsets.UTF_8),
            submittedHash.toByteArray(Charsets.UTF_8),
        )
    }

    fun setPasswordSessionCookie(call: ApplicationCall): AuthUser? {
        val user = Database.useConnection { connection ->
            connection.upsertPasswordFallbackUser()
        }
        setSessionCookie(call, user.id)
        return user
    }

    suspend fun startGoogleLogin(call: ApplicationCall) {
        if (!googleConfigured) {
            call.respond(HttpStatusCode.ServiceUnavailable, mapOf("error" to "google_oauth_not_configured"))
            return
        }
        val state = randomToken()
        call.response.cookies.append(sessionCookie(OAuthStateCookieName, state, OAuthStateMaxAgeSeconds))
        val redirectUri = googleCallbackUrl(call)
        val params = listOf(
            "client_id" to googleClientId,
            "redirect_uri" to redirectUri,
            "response_type" to "code",
            "scope" to "openid email profile",
            "state" to state,
            "include_granted_scopes" to "true",
            "prompt" to "select_account",
        )
        val url = "https://accounts.google.com/o/oauth2/v2/auth?" +
            params.joinToString("&") { (key, value) -> "${urlEncode(key)}=${urlEncode(value)}" }
        call.respondRedirect(url)
    }

    suspend fun completeGoogleLogin(call: ApplicationCall) {
        val expectedState = requestCookie(call, OAuthStateCookieName)
        val state = call.request.queryParameters["state"]
        val code = call.request.queryParameters["code"]
        val error = call.request.queryParameters["error"]
        if (expectedState.isNullOrBlank() || state.isNullOrBlank() || expectedState != state) {
            clearCookie(call, OAuthStateCookieName)
            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_oauth_state"))
            return
        }
        if (error != null) {
            clearCookie(call, OAuthStateCookieName)
            call.respond(HttpStatusCode.BadRequest, mapOf("error" to error))
            return
        }
        if (code.isNullOrBlank()) {
            clearCookie(call, OAuthStateCookieName)
            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_oauth_code"))
            return
        }
        clearCookie(call, OAuthStateCookieName)
        val profile = runCatching { fetchGoogleProfile(call, code) }.getOrElse {
            call.respond(HttpStatusCode.BadGateway, mapOf("error" to "google_oauth_failed"))
            return
        }
        val user = Database.useConnection { connection -> connection.upsertOAuthUser(profile) }
        if (user.status == UserStatus.suspended) {
            call.respond(HttpStatusCode.Forbidden, mapOf("error" to "user_suspended"))
            return
        }
        setSessionCookie(call, user.id)
        call.respondRedirect("/")
    }

    fun logout(call: ApplicationCall) {
        requestCookie(call, SessionCookieName)?.let { token ->
            Database.useConnection { connection -> connection.deleteUserSession(token) }
        }
        clearCookie(call, SessionCookieName)
    }

    private fun setSessionCookie(call: ApplicationCall, userId: Long) {
        val token = randomToken()
        Database.useConnection { connection -> connection.insertUserSession(userId, token) }
        call.response.cookies.append(sessionCookie(SessionCookieName, token, SessionMaxAgeSeconds))
    }

    private fun fetchGoogleProfile(call: ApplicationCall, code: String): OAuthProfile {
        val redirectUri = googleCallbackUrl(call)
        val body = listOf(
            "code" to code,
            "client_id" to googleClientId,
            "client_secret" to googleClientSecret,
            "redirect_uri" to redirectUri,
            "grant_type" to "authorization_code",
        ).joinToString("&") { (key, value) -> "${urlEncode(key)}=${urlEncode(value)}" }
        val tokenRequest = HttpRequest.newBuilder(URI.create("https://oauth2.googleapis.com/token"))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build()
        val tokenResponse = httpClient.send(tokenRequest, HttpResponse.BodyHandlers.ofString())
        require(tokenResponse.statusCode() in 200..299) { "google_token_failed" }
        val accessToken = json.parseToJsonElement(tokenResponse.body())
            .jsonObject["access_token"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("google_access_token_missing")
        val profileRequest = HttpRequest.newBuilder(URI.create("https://www.googleapis.com/oauth2/v3/userinfo"))
            .header("Authorization", "Bearer $accessToken")
            .GET()
            .build()
        val profileResponse = httpClient.send(profileRequest, HttpResponse.BodyHandlers.ofString())
        require(profileResponse.statusCode() in 200..299) { "google_profile_failed" }
        val profile = json.parseToJsonElement(profileResponse.body()).jsonObject
        return profile.toGoogleOAuthProfile(profileResponse.body())
    }

    private fun JsonObject.toGoogleOAuthProfile(raw: String): OAuthProfile {
        val subject = stringValue("sub") ?: throw IllegalStateException("google_subject_missing")
        val email = stringValue("email") ?: throw IllegalStateException("google_email_missing")
        return OAuthProfile(
            provider = "google",
            subject = subject,
            email = email,
            emailVerified = this["email_verified"]?.jsonPrimitive?.booleanOrNull ?: false,
            displayName = stringValue("name"),
            givenName = stringValue("given_name"),
            familyName = stringValue("family_name"),
            pictureUrl = stringValue("picture"),
            locale = stringValue("locale"),
            rawProfileJson = raw,
        )
    }

    private fun JsonObject.stringValue(name: String): String? = this[name]?.jsonPrimitive?.contentOrNull

    private fun googleCallbackUrl(call: ApplicationCall): String = publicBaseUrl(call).trimEnd('/') + "/api/auth/google/callback"

    private fun publicBaseUrl(call: ApplicationCall): String {
        val configured = System.getenv(PublicBaseUrlEnv)?.trim().orEmpty()
        if (configured.isNotBlank()) return configured
        val proto = call.request.headers["X-Forwarded-Proto"] ?: if (secureCookie) "https" else "http"
        val host = call.request.headers["X-Forwarded-Host"] ?: call.request.host()
        return "$proto://$host"
    }

    private fun sessionCookie(name: String, value: String, maxAge: Int): Cookie = Cookie(
        name = name,
        value = value,
        path = "/",
        maxAge = maxAge,
        httpOnly = true,
        secure = secureCookie,
        extensions = mapOf("SameSite" to "Lax"),
    )

    private fun clearCookie(call: ApplicationCall, name: String) {
        call.response.cookies.append(sessionCookie(name, "", 0))
    }

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

    private fun randomToken(): String {
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return bytes.joinToString("") { byte -> "%02x".format(byte) }
    }

    private fun sha256(value: String): String {
        val bytes = MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { byte -> "%02x".format(byte) }
    }

    private fun urlEncode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8)
}
