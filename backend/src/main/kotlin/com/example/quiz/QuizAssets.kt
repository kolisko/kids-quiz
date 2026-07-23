package com.example.quiz

import java.util.ArrayDeque

class QuizAssetPreparationException(val code: String) : RuntimeException(code)

object QuizAssetPreparationService {
    private const val maxQuestionCount = 100
    private const val rateLimitCount = 12
    private const val rateLimitWindowMillis = 5 * 60 * 1000L
    private val rateLimitLock = Any()
    private val attemptsByUser = mutableMapOf<Long, ArrayDeque<Long>>()

    fun prepare(userId: Long, request: QuizAssetPrepareRequest): QuizAssetPrepareResponse {
        checkRateLimit(userId)
        val statuses = when (request.game) {
            QuizAssetGame.spelling -> prepareSpelling(userId, request)
            QuizAssetGame.flipcards -> prepareFlipcards(userId, request)
        }
        return QuizAssetPrepareResponse(
            questionCount = when (request.game) {
                QuizAssetGame.spelling -> request.spellingWordIds.size
                QuizAssetGame.flipcards -> request.conceptKeys.size
            },
            assetCount = statuses.size,
            readyCount = statuses.count { it == PreparedAssetStatus.ready },
            queuedCount = statuses.count { it == PreparedAssetStatus.queued },
            generatingCount = statuses.count { it == PreparedAssetStatus.generating },
            errorCount = statuses.count { it == PreparedAssetStatus.error },
        )
    }

    private fun prepareSpelling(userId: Long, request: QuizAssetPrepareRequest): List<PreparedAssetStatus> {
        if (request.conceptKeys.isNotEmpty()) invalidRequest()
        val setId = request.spellingSetId ?: invalidRequest()
        val wordIds = validatedSelection(request.spellingWordIds)
        val allowedWords = if (setId == 0L) {
            SpellingStore.readSets(request.language).flatMap { it.words }
        } else {
            SpellingStore.readSets(request.language)
                .firstOrNull { it.id == setId }
                ?.words
                ?: throw QuizAssetPreparationException("spelling_set_not_found")
        }
        val wordsById = allowedWords.associateBy { it.id }
        val selectedWords = wordIds.map { id ->
            wordsById[id] ?: throw QuizAssetPreparationException("word_not_in_spelling_test")
        }
        val settings = SettingsStore.read(userId)
        return buildList {
            selectedWords.mapNotNull { it.conceptKey }.distinct().forEach { conceptKey ->
                add(enqueueImage(conceptKey))
            }
            if (settings.audioSource == AudioSource.backend_mp3) {
                selectedWords.forEach { word ->
                    add(enqueueAudio(word.text, SpellingAudioKind.word, request.language))
                    add(enqueueAudio(word.text, SpellingAudioKind.spelling, request.language))
                }
            }
        }
    }

    private fun prepareFlipcards(userId: Long, request: QuizAssetPrepareRequest): List<PreparedAssetStatus> {
        if (request.spellingSetId != null || request.spellingWordIds.isNotEmpty()) invalidRequest()
        val conceptKeys = validatedSelection(request.conceptKeys)
        val answerWordsByConcept = FlipcardStore.readWords(request.language).items.associateBy { it.conceptKey }
        val selectedWords = conceptKeys.map { conceptKey ->
            answerWordsByConcept[conceptKey] ?: throw QuizAssetPreparationException("concept_not_in_flipcard_test")
        }
        val settings = SettingsStore.read(userId)
        val promptWordsByConcept = if (settings.audioSource == AudioSource.backend_mp3) {
            FlipcardStore.readWords(settings.flipcardPromptLanguage).items.associateBy { it.conceptKey }
        } else {
            emptyMap()
        }
        if (settings.audioSource == AudioSource.backend_mp3) {
            selectedWords.forEach { word ->
                if (promptWordsByConcept[word.conceptKey] == null) {
                    throw QuizAssetPreparationException("prompt_translation_missing")
                }
            }
        }
        return buildList {
            selectedWords.forEach { word ->
                add(enqueueImage(word.conceptKey))
            }
            if (settings.audioSource == AudioSource.backend_mp3) {
                selectedWords.forEach { word ->
                    add(
                        enqueueAudio(
                            rawWord = word.text,
                            kind = SpellingAudioKind.word,
                            language = request.language,
                            jobKind = ArtifactJobKind.flipcard_audio_word,
                        ),
                    )
                    val promptWord = requireNotNull(promptWordsByConcept[word.conceptKey])
                    add(
                        enqueueAudio(
                            rawWord = promptWord.text,
                            kind = SpellingAudioKind.word,
                            language = settings.flipcardPromptLanguage,
                            jobKind = ArtifactJobKind.flipcard_audio_word,
                        ),
                    )
                }
            }
        }
    }

    private fun enqueueImage(conceptKey: String): PreparedAssetStatus {
        val response = FlipcardImageService.enqueueGeneration(conceptKey, force = false)
            ?: throw QuizAssetPreparationException("invalid_concept")
        return response.status.toPreparedAssetStatus()
    }

    private fun enqueueAudio(
        rawWord: String,
        kind: SpellingAudioKind,
        language: LearningLanguage,
        jobKind: ArtifactJobKind = when (kind) {
            SpellingAudioKind.word -> ArtifactJobKind.spelling_audio_word
            SpellingAudioKind.spelling -> ArtifactJobKind.spelling_audio_spelling
        },
    ): PreparedAssetStatus {
        val response = SpellingAudioService.enqueueGeneration(
            rawWord = rawWord,
            kind = kind,
            language = language,
            jobKind = jobKind,
            force = false,
        ) ?: throw QuizAssetPreparationException("invalid_word")
        return response.status.toPreparedAssetStatus()
    }

    private fun <T> validatedSelection(items: List<T>): List<T> {
        if (items.isEmpty()) invalidRequest()
        if (items.size > maxQuestionCount) {
            throw QuizAssetPreparationException("too_many_quiz_items")
        }
        if (items.distinct().size != items.size) {
            throw QuizAssetPreparationException("duplicate_quiz_items")
        }
        return items
    }

    private fun checkRateLimit(userId: Long) {
        val now = System.currentTimeMillis()
        synchronized(rateLimitLock) {
            val attempts = attemptsByUser.getOrPut(userId) { ArrayDeque() }
            while (attempts.isNotEmpty() && now - attempts.peekFirst() > rateLimitWindowMillis) {
                attempts.removeFirst()
            }
            if (attempts.size >= rateLimitCount) {
                throw QuizAssetPreparationException("quiz_asset_rate_limited")
            }
            attempts.addLast(now)
        }
    }

    private fun invalidRequest(): Nothing = throw QuizAssetPreparationException("invalid_quiz_asset_request")
}

private enum class PreparedAssetStatus {
    ready,
    queued,
    generating,
    error,
}

private fun FlipcardImageStatus.toPreparedAssetStatus(): PreparedAssetStatus = when (this) {
    FlipcardImageStatus.ready -> PreparedAssetStatus.ready
    FlipcardImageStatus.missing,
    FlipcardImageStatus.queued,
    -> PreparedAssetStatus.queued
    FlipcardImageStatus.generating -> PreparedAssetStatus.generating
    FlipcardImageStatus.error -> PreparedAssetStatus.error
}

private fun SpellingAudioStatus.toPreparedAssetStatus(): PreparedAssetStatus = when (this) {
    SpellingAudioStatus.ready -> PreparedAssetStatus.ready
    SpellingAudioStatus.missing,
    SpellingAudioStatus.queued,
    -> PreparedAssetStatus.queued
    SpellingAudioStatus.generating -> PreparedAssetStatus.generating
    SpellingAudioStatus.error -> PreparedAssetStatus.error
}
