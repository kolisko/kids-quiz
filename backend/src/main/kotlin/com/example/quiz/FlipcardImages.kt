package com.example.quiz

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.time.Duration
import java.util.Base64

private val imageJson = Json {
    encodeDefaults = false
    ignoreUnknownKeys = true
}

private const val defaultOpenAiImageModel = "gpt-image-1-mini"
private const val defaultOpenAiImageSize = "1024x1024"
private const val defaultOpenAiImageQuality = "low"
private const val defaultOpenAiImageFormat = "jpeg"
private const val defaultFlipcardImagePrompt =
    "Create a bright, friendly, child-safe flashcard picture for the English word %s. Show one clear object or simple scene, no text, no letters, no watermark, centered subject, colorful educational style."

@Serializable
private data class OpenAiImageRequest(
    val model: String,
    val prompt: String,
    val size: String,
    val quality: String,
    val output_format: String,
    val n: Int = 1,
)

class FlipcardImageException(message: String) : RuntimeException(message)

object FlipcardImageService {
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(20))
        .build()

    fun status(rawWord: String, knownImageVersion: Long? = null): FlipcardImageResponse? {
        val word = flipcardImageWord(rawWord) ?: return null
        val ready = Files.isRegularFile(imagePath(word))
        val job = ArtifactGenerationQueue.snapshot(imageJobKey(word))
        val activeJobStatus = job?.status?.takeIf { it == ArtifactJobStatus.queued || it == ArtifactJobStatus.generating }
        return FlipcardImageResponse(
            word = word.text,
            normalized = word.normalized,
            status = when {
                activeJobStatus != null -> activeJobStatus.toFlipcardImageStatus()
                ready -> FlipcardImageStatus.ready
                job?.status == ArtifactJobStatus.ready -> FlipcardImageStatus.missing
                job != null -> job.status.toFlipcardImageStatus()
                else -> FlipcardImageStatus.missing
            },
            imageUrl = if (ready) imageUrl(word, knownImageVersion) else null,
            error = if (ready) null else job?.error,
        )
    }

    fun enqueueGeneration(rawWord: String, force: Boolean = false): FlipcardImageResponse? {
        val word = flipcardImageWord(rawWord) ?: return null
        val outputPath = imagePath(word)
        if (!force && Files.isRegularFile(outputPath)) {
            ArtifactGenerationQueue.markReady(imageJobKey(word))
            return FlipcardImageResponse(
                word = word.text,
                normalized = word.normalized,
                status = FlipcardImageStatus.ready,
                imageUrl = imageUrl(word),
            )
        }
        val job = ArtifactGenerationQueue.enqueueFlipcardImage(imageJobKey(word), word.text, force)
        return FlipcardImageResponse(
            word = word.text,
            normalized = word.normalized,
            status = job.status.toFlipcardImageStatus(),
            imageUrl = null,
            error = job.error,
        )
    }

    fun imageFile(rawWord: String): Path? {
        val word = flipcardImageWord(rawWord) ?: return null
        val path = imagePath(word)
        return path.takeIf { Files.isRegularFile(it) }
    }

    fun runQueuedGeneration(rawWord: String, force: Boolean = false) {
        val word = flipcardImageWord(rawWord) ?: throw FlipcardImageException("invalid_word")
        val outputPath = imagePath(word)
        if (force || !Files.isRegularFile(outputPath)) {
            generateToFile(word, outputPath)
        }
    }

    private fun generateToFile(word: FlipcardWord, outputPath: Path) {
        val apiKey = System.getenv("OPENAI_API_KEY")?.takeIf { it.isNotBlank() }
            ?: throw FlipcardImageException("image_generation_not_configured")
        Files.createDirectories(outputPath.parent)
        val tempPath = outputPath.resolveSibling("${outputPath.fileName}.tmp")
        val body = imageJson.encodeToString(
            OpenAiImageRequest(
                model = imageModel(),
                prompt = imagePrompt(word),
                size = imageSize(),
                quality = imageQuality(),
                output_format = imageFormat(),
            ),
        )
        val request = HttpRequest.newBuilder(URI.create("https://api.openai.com/v1/images/generations"))
            .timeout(Duration.ofSeconds(120))
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() !in 200..299) {
            throw FlipcardImageException("image_generation_failed:${response.statusCode()}:${response.body().take(500)}")
        }
        val encoded = imageJson.parseToJsonElement(response.body())
            .jsonObject["data"]
            ?.jsonArray
            ?.firstOrNull()
            ?.jsonObject
            ?.get("b64_json")
            ?.jsonPrimitive
            ?.content
            ?: throw FlipcardImageException("image_generation_failed:missing_image")
        Files.write(tempPath, Base64.getDecoder().decode(encoded))
        Files.move(tempPath, outputPath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        Database.useConnection { it.incrementFlipcardImageVersion(word.normalized) }
    }

    private fun imagePath(word: FlipcardWord): Path {
        return runtimeDataPath("images", "flipcards").resolve("${imageCacheKey(word)}.${imageFormat()}")
    }

    private fun imageCacheKey(word: FlipcardWord): String {
        return sha256Hex(
            listOf(word.normalized, imageModel(), imageSize(), imageQuality(), imageFormat(), imagePromptTemplate())
                .joinToString("\u001f"),
        )
    }

    private fun imageJobKey(word: FlipcardWord): String {
        return "flipcard_image:${imageCacheKey(word)}"
    }

    private fun imageUrl(word: FlipcardWord, knownImageVersion: Long? = null): String {
        return "/api/flipcards/images/${urlEncodePathSegment(word.text)}.${imageFormat()}?v=${imageCacheKey(word)}-${imageVersion(word, knownImageVersion)}"
    }

    private fun imageVersion(word: FlipcardWord, knownImageVersion: Long? = null): Long {
        return knownImageVersion ?: Database.useConnection { it.readFlipcardImageVersion(word.normalized) } ?: 1L
    }

    private fun imageModel(): String = System.getenv("OPENAI_IMAGE_MODEL")?.takeIf { it.isNotBlank() }
        ?: defaultOpenAiImageModel

    private fun imageSize(): String = System.getenv("OPENAI_IMAGE_SIZE")?.takeIf { it.isNotBlank() }
        ?: defaultOpenAiImageSize

    fun imageContentType(): String {
        return when (imageFormat()) {
            "jpeg", "jpg" -> "image/jpeg"
            "png" -> "image/png"
            else -> "image/webp"
        }
    }

    private fun imageQuality(): String = System.getenv("OPENAI_IMAGE_QUALITY")?.takeIf { it.isNotBlank() }
        ?: defaultOpenAiImageQuality

    private fun imageFormat(): String {
        return when (System.getenv("OPENAI_IMAGE_FORMAT")?.trim()?.lowercase()) {
            "png" -> "png"
            "jpeg", "jpg" -> "jpeg"
            else -> defaultOpenAiImageFormat
        }
    }

    private fun imagePromptTemplate(): String = System.getenv("OPENAI_FLIPCARD_IMAGE_PROMPT")?.takeIf { it.isNotBlank() }
        ?: defaultFlipcardImagePrompt

    private fun imagePrompt(word: FlipcardWord): String {
        val template = imagePromptTemplate()
        return if ("%s" in template) template.format(word.text) else "$template\nWord: ${word.text}"
    }

    private fun flipcardImageWord(rawWord: String): FlipcardWord? {
        val text = rawWord.trim()
        if (text.isBlank()) return null
        return FlipcardWord(text = text, normalized = normalizeFlipcardWord(text))
    }

    private fun urlEncodePathSegment(value: String): String {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20")
    }

    private fun sha256Hex(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun ArtifactJobStatus.toFlipcardImageStatus(): FlipcardImageStatus {
        return when (this) {
            ArtifactJobStatus.queued -> FlipcardImageStatus.queued
            ArtifactJobStatus.generating -> FlipcardImageStatus.generating
            ArtifactJobStatus.ready -> FlipcardImageStatus.ready
            ArtifactJobStatus.error -> FlipcardImageStatus.error
        }
    }
}
