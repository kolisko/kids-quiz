package com.example.quiz

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

enum class ArtifactJobPool {
    image,
    audio,
}

enum class ArtifactJobStatus {
    queued,
    generating,
    error,
}

data class ArtifactJobSnapshot(
    val status: ArtifactJobStatus,
    val error: String? = null,
)

object ArtifactGenerationQueue {
    private data class Job(
        val key: String,
        val pool: ArtifactJobPool,
        val task: () -> Unit,
    )

    private data class MutableJobState(
        @Volatile var status: ArtifactJobStatus,
        @Volatile var error: String? = null,
    )

    private val jobs = ConcurrentHashMap<String, MutableJobState>()
    private val imageQueue = LinkedBlockingQueue<Job>()
    private val audioQueue = LinkedBlockingQueue<Job>()
    private val imageStarted = AtomicBoolean(false)
    private val audioStarted = AtomicBoolean(false)

    fun snapshot(key: String): ArtifactJobSnapshot? {
        return jobs[key]?.let { ArtifactJobSnapshot(status = it.status, error = it.error) }
    }

    fun clear(key: String) {
        jobs.remove(key)
    }

    fun enqueue(key: String, pool: ArtifactJobPool, task: () -> Unit): ArtifactJobSnapshot {
        val existing = jobs[key]
        if (existing != null && existing.status != ArtifactJobStatus.error) {
            return ArtifactJobSnapshot(status = existing.status, error = existing.error)
        }

        val state = MutableJobState(status = ArtifactJobStatus.queued)
        jobs[key] = state
        startWorkers(pool)
        queue(pool).offer(Job(key = key, pool = pool, task = task))
        return ArtifactJobSnapshot(status = ArtifactJobStatus.queued)
    }

    private fun startWorkers(pool: ArtifactJobPool) {
        val started = when (pool) {
            ArtifactJobPool.image -> imageStarted
            ArtifactJobPool.audio -> audioStarted
        }
        if (!started.compareAndSet(false, true)) return

        val workerCount = when (pool) {
            ArtifactJobPool.image -> workerCount("FLIPCARD_IMAGE_WORKERS", 1)
            ArtifactJobPool.audio -> workerCount("SPELLING_AUDIO_WORKERS", 2)
        }
        repeat(workerCount) { index ->
            thread(
                name = "artifact-${pool.name}-worker-${index + 1}",
                isDaemon = true,
            ) {
                workerLoop(queue(pool))
            }
        }
    }

    private fun workerLoop(queue: LinkedBlockingQueue<Job>) {
        while (true) {
            val job = queue.take()
            val state = jobs[job.key] ?: continue
            state.status = ArtifactJobStatus.generating
            state.error = null
            try {
                job.task()
                jobs.remove(job.key)
            } catch (error: Throwable) {
                state.status = ArtifactJobStatus.error
                state.error = error.message ?: "generation_failed"
            }
        }
    }

    private fun queue(pool: ArtifactJobPool): LinkedBlockingQueue<Job> {
        return when (pool) {
            ArtifactJobPool.image -> imageQueue
            ArtifactJobPool.audio -> audioQueue
        }
    }

    private fun workerCount(envName: String, default: Int): Int {
        return System.getenv(envName)?.toIntOrNull()?.coerceIn(1, 8) ?: default
    }
}
