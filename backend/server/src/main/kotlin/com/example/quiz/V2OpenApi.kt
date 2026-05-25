@file:Suppress("OPT_IN_USAGE")

package com.example.quiz

import io.ktor.http.HttpStatusCode
import io.ktor.openapi.Operation
import io.ktor.openapi.Parameter
import io.ktor.openapi.Parameters
import io.ktor.openapi.RequestBody
import io.ktor.openapi.Responses
import io.ktor.openapi.jsonSchema
import io.ktor.server.routing.Route
import io.ktor.server.routing.openapi.describe

internal object ApiTags {
    const val Session = "Session"
    const val Settings = "Settings"
    const val Activities = "Activities"
    const val Practice = "Practice"
    const val Content = "Content"
    const val Assets = "Assets"
    const val Trophies = "Trophies"
}

internal fun Route.document(
    tag: String,
    operationId: String,
    summary: String,
    description: String,
    parameters: Parameters.Builder.() -> Unit = {},
    requestBody: (RequestBody.Builder.() -> Unit)? = null,
    responses: Responses.Builder.() -> Unit,
): Route = describe {
    tag(tag)
    this.operationId = operationId
    this.summary = summary
    this.description = description
    parameters(parameters)
    if (requestBody != null) requestBody(requestBody)
    responses(responses)
}

internal inline fun <reified T : Any> RequestBody.Builder.jsonBody(descriptionText: String) {
    description = descriptionText
    required = true
    schema = jsonSchema<T>()
}

internal inline fun <reified T : Any> Responses.Builder.ok(descriptionText: String) {
    response(HttpStatusCode.OK.value) {
        description = descriptionText
        schema = jsonSchema<T>()
    }
}

internal inline fun <reified T : Any> Responses.Builder.created(descriptionText: String) {
    response(HttpStatusCode.Created.value) {
        description = descriptionText
        schema = jsonSchema<T>()
    }
}

internal fun Responses.Builder.badRequest(descriptionText: String = "The request is malformed or contains an unsupported value.") {
    response(HttpStatusCode.BadRequest.value) {
        description = descriptionText
        schema = jsonSchema<Map<String, String>>()
    }
}

internal fun Responses.Builder.unauthorized(descriptionText: String = "Authentication is required or the submitted credentials are invalid.") {
    response(HttpStatusCode.Unauthorized.value) {
        description = descriptionText
        schema = jsonSchema<AuthStatusResponse>()
    }
}

internal fun Responses.Builder.notFound(descriptionText: String = "The requested entity does not exist.") {
    response(HttpStatusCode.NotFound.value) {
        description = descriptionText
        schema = jsonSchema<Map<String, String>>()
    }
}

internal fun Responses.Builder.assetGenerationErrors() {
    response(HttpStatusCode.ServiceUnavailable.value) {
        description = "The requested generator is not configured on this deployment."
        schema = jsonSchema<Map<String, String>>()
    }
    response(HttpStatusCode.BadGateway.value) {
        description = "The upstream generation provider failed while creating the artifact."
        schema = jsonSchema<Map<String, String>>()
    }
}

internal fun Parameters.Builder.languageQuery() {
    query("language") {
        description = "Learning language. Defaults to `en` when omitted."
        required = false
        schema = jsonSchema<LearningLanguage>()
    }
}

internal fun Parameters.Builder.audioKindQuery() {
    query("kind") {
        description = "Audio variant to read or generate. `word` is used by flipcards; `spelling` is used for spelling prompts."
        required = false
        schema = jsonSchema<SpellingAudioKind>()
    }
}

internal fun Parameters.Builder.forceQuery() {
    query("force") {
        description = "When `true`, enqueue generation even if a ready artifact already exists."
        required = false
        schema = jsonSchema<Boolean>()
    }
}

internal fun Parameters.Builder.forFlipcardQuery() {
    query("forFlipcard") {
        description = "When `true`, the audio job is tracked as flipcard word audio."
        required = false
        schema = jsonSchema<Boolean>()
    }
}

internal fun Parameters.Builder.wordPath() {
    path("word") {
        description = "Word or concept key. Path segments should be URL encoded."
        schema = jsonSchema<String>()
    }
}
