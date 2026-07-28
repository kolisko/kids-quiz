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
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.Base64

private val imageJson = Json {
    encodeDefaults = false
    ignoreUnknownKeys = true
}

private const val defaultOpenAiImageModel = "gpt-image-2"
private const val defaultOpenAiImageSize = "1024x1024"
private const val defaultOpenAiImageQuality = "low"
private const val defaultOpenAiImageFormat = "jpeg"
private const val legacyOpenAiImageModel = "gpt-image-1-mini"
private const val defaultFlipcardImagePrompt =
    "Create a bright, friendly, child-safe flashcard picture for the English word %s. Show one clear object or simple scene, no text, no letters, no watermark, centered subject, colorful educational style."
private const val originalFlipcardImagePrompt =
    "Create a bright, friendly, child-safe flashcard picture for the English word: %s. Show one clear object or simple scene, no text, no letters, no watermark, centered subject, colorful educational style."

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

data class FlipcardImageMetadata(
    val conceptKey: String,
    val imageVersion: Long,
    val format: String,
    val model: String?,
    val size: String?,
    val quality: String?,
    val promptHash: String?,
    val generatedAt: String?,
)

data class FlipcardImageMigrationCandidate(
    val conceptKey: String,
    val imageVersion: Long,
)

data class MigratedFlipcardImage(
    val conceptKey: String,
    val format: String,
    val model: String?,
    val size: String?,
    val quality: String?,
    val promptHash: String?,
    val generatedAt: String?,
)

data class FlipcardImageAsset(
    val path: Path,
    val contentType: String,
)

private data class ImageGenerationSettings(
    val model: String,
    val size: String,
    val quality: String,
    val format: String,
    val promptTemplate: String,
)

private data class LegacyImageLocation(
    val path: Path,
    val settings: ImageGenerationSettings,
)

object FlipcardImageService {
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(20))
        .build()

    fun status(rawWord: String, knownImageVersion: Long? = null): FlipcardImageResponse? {
        val word = flipcardImageWord(rawWord) ?: return null
        val metadata = Database.useConnection { it.readFlipcardImageMetadata(word.normalized) }
        val ready = metadata?.let { Files.isRegularFile(imagePath(it)) } == true
        val job = ArtifactGenerationQueue.snapshot(imageJobKey(word))
        val activeJobStatus = job?.status?.takeIf { it == ArtifactJobStatus.queued || it == ArtifactJobStatus.generating }
        return FlipcardImageResponse(
            word = word.text,
            normalized = word.normalized,
            status = when {
                activeJobStatus != null -> activeJobStatus.toFlipcardImageStatus()
                job?.status == ArtifactJobStatus.error -> FlipcardImageStatus.error
                ready -> FlipcardImageStatus.ready
                job?.status == ArtifactJobStatus.ready -> FlipcardImageStatus.missing
                job != null -> job.status.toFlipcardImageStatus()
                else -> FlipcardImageStatus.missing
            },
            imageUrl = if (ready) imageUrl(word, metadata, knownImageVersion) else null,
            error = job?.error?.takeIf { job.status == ArtifactJobStatus.error },
        )
    }

    fun enqueueGeneration(rawWord: String, force: Boolean = false): FlipcardImageResponse? {
        val word = flipcardImageWord(rawWord) ?: return null
        val metadata = Database.useConnection { it.readFlipcardImageMetadata(word.normalized) }
        val ready = metadata?.let { Files.isRegularFile(imagePath(it)) } == true
        if (!force && ready) {
            ArtifactGenerationQueue.markReady(imageJobKey(word))
            return FlipcardImageResponse(
                word = word.text,
                normalized = word.normalized,
                status = FlipcardImageStatus.ready,
                imageUrl = imageUrl(word, metadata),
            )
        }
        val job = ArtifactGenerationQueue.enqueueFlipcardImage(imageJobKey(word), word.text, force)
        return FlipcardImageResponse(
            word = word.text,
            normalized = word.normalized,
            status = job.status.toFlipcardImageStatus(),
            imageUrl = if (ready) imageUrl(word, metadata) else null,
            error = job.error,
        )
    }

    fun imageAsset(rawWord: String): FlipcardImageAsset? {
        val word = flipcardImageWord(rawWord) ?: return null
        val metadata = Database.useConnection { it.readFlipcardImageMetadata(word.normalized) } ?: return null
        val path = imagePath(metadata)
        return path.takeIf { Files.isRegularFile(it) }?.let {
            FlipcardImageAsset(path = it, contentType = imageContentType(metadata.format))
        }
    }

    fun runQueuedGeneration(rawWord: String, force: Boolean = false) {
        val word = flipcardImageWord(rawWord) ?: throw FlipcardImageException("invalid_word")
        val existing = Database.useConnection { it.readFlipcardImageMetadata(word.normalized) }
        if (!force && existing?.let { Files.isRegularFile(imagePath(it)) } == true) {
            return
        }
        generateToFile(word)
    }

    fun migrateLegacyCache(candidates: List<FlipcardImageMigrationCandidate>): List<MigratedFlipcardImage> {
        return candidates.mapNotNull { candidate ->
            val legacy = legacyImageLocations(candidate.conceptKey).firstOrNull { Files.isRegularFile(it.path) }
                ?: return@mapNotNull null
            val target = imagePath(candidate.conceptKey, candidate.imageVersion, legacy.settings.format)
            Files.createDirectories(target.parent)
            if (!Files.isRegularFile(target)) {
                val tempPath = target.resolveSibling("${target.fileName}.migration.tmp")
                Files.copy(legacy.path, tempPath, StandardCopyOption.REPLACE_EXISTING)
                moveAtomically(tempPath, target)
            }
            MigratedFlipcardImage(
                conceptKey = candidate.conceptKey,
                format = legacy.settings.format,
                model = legacy.settings.model,
                size = legacy.settings.size,
                quality = legacy.settings.quality,
                promptHash = promptHash(legacy.settings.promptTemplate, candidate.conceptKey),
                generatedAt = runCatching { Files.getLastModifiedTime(legacy.path).toInstant().toString() }
                    .getOrDefault(Instant.EPOCH.toString()),
            )
        }
    }

    private fun generateToFile(word: FlipcardWord) {
        val apiKey = System.getenv("OPENAI_API_KEY")?.takeIf { it.isNotBlank() }
            ?: throw FlipcardImageException("image_generation_not_configured")
        val currentVersion = Database.useConnection { it.readFlipcardImageVersion(word.normalized) }
            ?: throw FlipcardImageException("image_concept_not_found")
        val nextVersion = currentVersion + 1
        val settings = imageGenerationSettings()
        val outputPath = imagePath(word.normalized, nextVersion, settings.format)
        Files.createDirectories(outputPath.parent)
        val tempPath = outputPath.resolveSibling("${outputPath.fileName}.tmp")
        val body = imageJson.encodeToString(
            OpenAiImageRequest(
                model = settings.model,
                prompt = imagePrompt(word, settings.promptTemplate),
                size = settings.size,
                quality = settings.quality,
                output_format = settings.format,
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
        moveAtomically(tempPath, outputPath)
        val activated = Database.useConnection {
            it.activateFlipcardImage(
                conceptKey = word.normalized,
                expectedVersion = currentVersion,
                format = settings.format,
                model = settings.model,
                size = settings.size,
                quality = settings.quality,
                promptHash = promptHash(settings.promptTemplate, word.text),
            )
        }
        if (activated == null) {
            throw FlipcardImageException("image_version_conflict")
        }
    }

    private fun imagePath(metadata: FlipcardImageMetadata): Path {
        return imagePath(metadata.conceptKey, metadata.imageVersion, metadata.format)
    }

    private fun imagePath(conceptKey: String, version: Long, format: String): Path {
        return runtimeDataPath("images", "flipcards", "assets")
            .resolve(sha256Hex(normalizeFlipcardWord(conceptKey)))
            .resolve("$version.$format")
    }

    private fun imageJobKey(word: FlipcardWord): String {
        return "flipcard_image:${sha256Hex(word.normalized)}"
    }

    private fun imageUrl(
        word: FlipcardWord,
        metadata: FlipcardImageMetadata,
        knownImageVersion: Long? = null,
    ): String {
        val version = knownImageVersion?.takeIf { it == metadata.imageVersion } ?: metadata.imageVersion
        return "/api/flipcards/images/${urlEncodePathSegment(word.text)}.image?v=$version"
    }

    private fun imageGenerationSettings(): ImageGenerationSettings {
        return ImageGenerationSettings(
            model = imageModel(),
            size = imageSize(),
            quality = imageQuality(),
            format = imageFormat(),
            promptTemplate = imagePromptTemplate(),
        )
    }

    private fun imageModel(): String = System.getenv("OPENAI_IMAGE_MODEL")?.takeIf { it.isNotBlank() }
        ?: defaultOpenAiImageModel

    private fun imageSize(): String = System.getenv("OPENAI_IMAGE_SIZE")?.takeIf { it.isNotBlank() }
        ?: defaultOpenAiImageSize

    private fun imageContentType(format: String): String {
        return when (format) {
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

    private fun imagePrompt(word: FlipcardWord, template: String = imagePromptTemplate()): String {
        return if ("%s" in template) template.format(word.text) else "$template\nWord: ${word.text}"
    }

    private fun promptHash(template: String, word: String): String {
        val flipcardWord = flipcardImageWord(word) ?: return sha256Hex(template)
        return sha256Hex(imagePrompt(flipcardWord, template))
    }

    private fun legacyImageLocations(conceptKey: String): List<LegacyImageLocation> {
        val normalized = normalizeFlipcardWord(conceptKey)
        val models = listOfNotNull(
            legacyOpenAiImageModel,
            "gpt-image-1",
            System.getenv("OPENAI_IMAGE_MODEL")?.takeIf { it.isNotBlank() },
        ).distinct()
        val sizes = listOfNotNull(
            defaultOpenAiImageSize,
            "1024x1536",
            "1536x1024",
            "auto",
            System.getenv("OPENAI_IMAGE_SIZE")?.takeIf { it.isNotBlank() },
        ).distinct()
        val qualities = listOfNotNull(
            defaultOpenAiImageQuality,
            "medium",
            "high",
            "auto",
            System.getenv("OPENAI_IMAGE_QUALITY")?.takeIf { it.isNotBlank() },
        ).distinct()
        val formats = listOfNotNull(
            "jpeg",
            "webp",
            "png",
            System.getenv("OPENAI_IMAGE_FORMAT")?.trim()?.lowercase()?.takeIf { it in setOf("png", "jpeg", "jpg", "webp") },
        ).map { if (it == "jpg") "jpeg" else it }.distinct()
        val prompts = listOfNotNull(
            defaultFlipcardImagePrompt,
            originalFlipcardImagePrompt,
            System.getenv("OPENAI_FLIPCARD_IMAGE_PROMPT")?.takeIf { it.isNotBlank() },
        ).distinct()
        val legacySettings = buildList {
            models.forEach { model ->
                sizes.forEach { size ->
                    qualities.forEach { quality ->
                        formats.forEach { format ->
                            prompts.forEach { prompt ->
                                add(
                                    ImageGenerationSettings(
                                        model = model,
                                        size = size,
                                        quality = quality,
                                        format = format,
                                        promptTemplate = prompt,
                                    ),
                                )
                            }
                        }
                    }
                }
            }
        }
        val currentRoot = runtimeDataPath("images", "flipcards")
        val modernLocations = legacySettings.map { settings ->
            val cacheKey = sha256Hex(
                listOf(
                    normalized,
                    settings.model,
                    settings.size,
                    settings.quality,
                    settings.format,
                    settings.promptTemplate,
                ).joinToString("\u001f"),
            )
            LegacyImageLocation(currentRoot.resolve("$cacheKey.${settings.format}"), settings)
        }
        val originalSettings = buildList {
            models.forEach { model ->
                sizes.forEach { size ->
                    prompts.forEach { prompt ->
                        add(
                            ImageGenerationSettings(
                                model = model,
                                size = size,
                                quality = "standard",
                                format = "png",
                                promptTemplate = prompt,
                            ),
                        )
                    }
                }
            }
        }
        val originalLocations = originalSettings.map { settings ->
            val cacheKey = sha256Hex(
                listOf(normalized, settings.model, settings.size, settings.promptTemplate).joinToString("\u001f"),
            )
            LegacyImageLocation(currentRoot.resolve("$cacheKey.png"), settings)
        }
        return modernLocations + originalLocations
    }

    private fun moveAtomically(source: Path, target: Path) {
        try {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING)
        }
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
