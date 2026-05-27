package com.example.quiz

import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

private val artifactJobJson = Json {
    encodeDefaults = true
    ignoreUnknownKeys = true
}

enum class ArtifactJobPool {
    image,
    audio,
    translation,
}

enum class ArtifactJobKind {
    flipcard_image,
    flipcard_audio_word,
    spelling_audio_word,
    spelling_audio_spelling,
    flipcard_translation,
}

enum class ArtifactJobStatus {
    queued,
    generating,
    ready,
    error,
}

data class ArtifactJobSnapshot(
    val status: ArtifactJobStatus,
    val error: String? = null,
)

@Serializable
data class FlipcardImageJobPayload(
    val word: String,
    val force: Boolean = false,
)

@Serializable
data class AudioJobPayload(
    val word: String,
    val language: LearningLanguage,
    val kind: SpellingAudioKind,
    val force: Boolean = false,
)

@Serializable
data class TranslationJobPayload(
    val language: LearningLanguage,
)

object ArtifactGenerationQueue {
    private val imageStarted = AtomicBoolean(false)
    private val audioStarted = AtomicBoolean(false)
    private val translationStarted = AtomicBoolean(false)
    private val claimLock = Any()

    fun initialize() {
        Database.useConnection { it.resetInterruptedArtifactJobs() }
        ArtifactJobPool.entries.forEach(::startWorkers)
    }

    fun snapshot(key: String): ArtifactJobSnapshot? {
        return Database.useConnection { it.readArtifactJob(key) }
    }

    fun clear(key: String) {
        markReady(key)
    }

    fun markReady(key: String) {
        Database.useConnection { it.markArtifactJobReady(key) }
    }

    fun enqueue(
        key: String,
        pool: ArtifactJobPool,
        kind: ArtifactJobKind,
        payloadJson: String,
    ): ArtifactJobSnapshot {
        val snapshot = Database.useConnection { it.upsertArtifactJob(key, pool, kind, payloadJson) }
        startWorkers(pool)
        return snapshot
    }

    fun enqueueFlipcardImage(key: String, word: String, force: Boolean): ArtifactJobSnapshot {
        return enqueue(
            key = key,
            pool = ArtifactJobPool.image,
            kind = ArtifactJobKind.flipcard_image,
            payloadJson = artifactJobJson.encodeToString(FlipcardImageJobPayload(word = word, force = force)),
        )
    }

    fun enqueueAudio(
        key: String,
        word: String,
        language: LearningLanguage,
        kind: SpellingAudioKind,
        jobKind: ArtifactJobKind,
        force: Boolean = false,
    ): ArtifactJobSnapshot {
        return enqueue(
            key = key,
            pool = ArtifactJobPool.audio,
            kind = jobKind,
            payloadJson = artifactJobJson.encodeToString(AudioJobPayload(word = word, language = language, kind = kind, force = force)),
        )
    }

    fun enqueueTranslation(key: String, language: LearningLanguage): ArtifactJobSnapshot {
        return enqueue(
            key = key,
            pool = ArtifactJobPool.translation,
            kind = ArtifactJobKind.flipcard_translation,
            payloadJson = artifactJobJson.encodeToString(TranslationJobPayload(language = language)),
        )
    }

    private fun startWorkers(pool: ArtifactJobPool) {
        val started = when (pool) {
            ArtifactJobPool.image -> imageStarted
            ArtifactJobPool.audio -> audioStarted
            ArtifactJobPool.translation -> translationStarted
        }
        if (!started.compareAndSet(false, true)) return

        val workerCount = when (pool) {
            ArtifactJobPool.image -> workerCount("FLIPCARD_IMAGE_WORKERS", 1)
            ArtifactJobPool.audio -> workerCount("SPELLING_AUDIO_WORKERS", 2)
            ArtifactJobPool.translation -> workerCount("FLIPCARD_TRANSLATION_WORKERS", 1)
        }
        repeat(workerCount) { index ->
            thread(
                name = "artifact-${pool.name}-worker-${index + 1}",
                isDaemon = true,
            ) {
                workerLoop(pool)
            }
        }
    }

    private fun workerLoop(pool: ArtifactJobPool) {
        while (true) {
            val job = try {
                claimNext(pool)
            } catch (_: Throwable) {
                Thread.sleep(1000)
                continue
            }
            if (job == null) {
                Thread.sleep(1000)
                continue
            }
            try {
                ArtifactJobRunner.run(job)
                Database.useConnection { it.markArtifactJobReady(job.jobKey) }
            } catch (error: Throwable) {
                Database.useConnection {
                    it.markArtifactJobError(job.jobKey, error.message ?: "generation_failed")
                }
            }
        }
    }

    private fun claimNext(pool: ArtifactJobPool): ArtifactQueuedJob? {
        return synchronized(claimLock) {
            Database.useConnection { it.claimNextArtifactJob(pool) }
        }
    }

    private fun workerCount(envName: String, default: Int): Int {
        return System.getenv(envName)?.toIntOrNull()?.coerceIn(1, 8) ?: default
    }
}

object ArtifactJobRunner {
    fun run(job: ArtifactQueuedJob) {
        when (job.kind) {
            ArtifactJobKind.flipcard_image -> {
                val payload = artifactJobJson.decodeFromString<FlipcardImageJobPayload>(job.payloadJson)
                FlipcardImageService.runQueuedGeneration(payload.word, payload.force)
            }
            ArtifactJobKind.flipcard_audio_word,
            ArtifactJobKind.spelling_audio_word,
            ArtifactJobKind.spelling_audio_spelling -> {
                val payload = artifactJobJson.decodeFromString<AudioJobPayload>(job.payloadJson)
                SpellingAudioService.runQueuedGeneration(payload.word, payload.kind, payload.language, job.kind, payload.force)
            }
            ArtifactJobKind.flipcard_translation -> {
                val payload = artifactJobJson.decodeFromString<TranslationJobPayload>(job.payloadJson)
                FlipcardTranslationService.runQueuedBackfill(payload.language)
            }
        }
    }
}
