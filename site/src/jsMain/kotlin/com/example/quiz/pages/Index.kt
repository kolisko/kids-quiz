package com.example.quiz.pages

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.example.quiz.shared.AnswerResultRequest
import com.example.quiz.shared.AnswerResultResponse
import com.example.quiz.shared.AuthStatusResponse
import com.example.quiz.shared.LoginRequest
import com.example.quiz.shared.Question
import com.example.quiz.shared.QuestionStats
import com.example.quiz.shared.QuestionStatsSnapshot
import com.example.quiz.shared.questionKey
import com.varabyte.kobweb.browser.api
import com.varabyte.kobweb.core.Page
import kotlinx.browser.window
import kotlinx.coroutines.await
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import org.jetbrains.compose.web.attributes.*
import org.jetbrains.compose.web.dom.Button
import org.jetbrains.compose.web.dom.Div
import org.jetbrains.compose.web.dom.H1
import org.jetbrains.compose.web.dom.Img
import org.jetbrains.compose.web.dom.Input
import org.jetbrains.compose.web.dom.Label
import org.jetbrains.compose.web.dom.P
import org.jetbrains.compose.web.dom.Span
import org.jetbrains.compose.web.dom.Text
import org.jetbrains.compose.web.dom.TextArea
import kotlin.math.max

private const val SecondsStorageKey = "kids-quiz.seconds-limit"
private const val TargetStorageKey = "kids-quiz.target-score"
private const val LegacyQuestionsStorageKey = "kids-quiz.questions-json"

data class GameSettings(val secondsLimit: Int = 10, val targetScore: Int = 10)

data class AnimalSurprise(
    val imagePath: String,
    val animationClass: String,
)

private enum class Screen {
    Login,
    Start,
    Play,
    Settings,
    Finished,
}

private val json = Json {
    ignoreUnknownKeys = true
    isLenient = true
}

private val surprises = listOf(
    AnimalSurprise("/assets/animals/animal-01.svg", "pop"),
    AnimalSurprise("/assets/animals/animal-02.svg", "floaty"),
    AnimalSurprise("/assets/animals/animal-03.svg", "wiggle"),
    AnimalSurprise("/assets/animals/animal-04.svg", "spinny"),
    AnimalSurprise("/assets/animals/animal-05.svg", "bounce"),
    AnimalSurprise("/assets/animals/animal-06.svg", "pop"),
    AnimalSurprise("/assets/animals/animal-07.svg", "floaty"),
    AnimalSurprise("/assets/animals/animal-08.svg", "wiggle"),
    AnimalSurprise("/assets/animals/animal-09.svg", "spinny"),
    AnimalSurprise("/assets/animals/animal-10.svg", "bounce"),
    AnimalSurprise("/assets/animals/animal-11.svg", "pop"),
    AnimalSurprise("/assets/animals/animal-12.svg", "floaty"),
    AnimalSurprise("/assets/animals/animal-13.svg", "wiggle"),
    AnimalSurprise("/assets/animals/animal-14.svg", "spinny"),
    AnimalSurprise("/assets/animals/animal-15.svg", "bounce"),
    AnimalSurprise("/assets/animals/animal-16.svg", "pop"),
    AnimalSurprise("/assets/animals/animal-17.svg", "floaty"),
    AnimalSurprise("/assets/animals/animal-18.svg", "wiggle"),
    AnimalSurprise("/assets/animals/animal-19.svg", "spinny"),
    AnimalSurprise("/assets/animals/animal-20.svg", "bounce"),
    AnimalSurprise("/assets/animals/animal-21.svg", "pop"),
    AnimalSurprise("/assets/animals/animal-22.svg", "floaty"),
    AnimalSurprise("/assets/animals/animal-23.svg", "wiggle"),
    AnimalSurprise("/assets/animals/animal-24.svg", "spinny"),
    AnimalSurprise("/assets/animals/animal-25.svg", "bounce"),
    AnimalSurprise("/assets/animals/animal-26.svg", "pop"),
    AnimalSurprise("/assets/animals/animal-27.svg", "floaty"),
    AnimalSurprise("/assets/animals/animal-28.svg", "wiggle"),
    AnimalSurprise("/assets/animals/animal-29.svg", "spinny"),
    AnimalSurprise("/assets/animals/animal-30.svg", "bounce"),
    AnimalSurprise("/assets/animals/animal-31.svg", "pop"),
    AnimalSurprise("/assets/animals/animal-32.svg", "floaty"),
    AnimalSurprise("/assets/animals/animal-33.svg", "wiggle"),
    AnimalSurprise("/assets/animals/animal-34.svg", "spinny"),
    AnimalSurprise("/assets/animals/animal-35.svg", "bounce"),
    AnimalSurprise("/assets/animals/animal-36.svg", "pop"),
    AnimalSurprise("/assets/animals/animal-37.svg", "floaty"),
    AnimalSurprise("/assets/animals/animal-38.svg", "wiggle"),
    AnimalSurprise("/assets/animals/animal-39.svg", "spinny"),
    AnimalSurprise("/assets/animals/animal-40.svg", "bounce"),
)

@Page
@Composable
fun HomePage() {
    val coroutineScope = rememberCoroutineScope()
    var screen by remember { mutableStateOf(Screen.Start) }
    var loading by remember { mutableStateOf(true) }
    var authLoading by remember { mutableStateOf(false) }
    var authError by remember { mutableStateOf<String?>(null) }
    var settings by remember { mutableStateOf(GameSettings()) }
    var questions by remember { mutableStateOf<List<Question>>(emptyList()) }
    var serverStats by remember { mutableStateOf<Map<String, QuestionStats>>(emptyMap()) }
    var questionJson by remember { mutableStateOf("") }
    var jsonError by remember { mutableStateOf<String?>(null) }
    var score by remember { mutableStateOf(0) }
    var currentIndex by remember { mutableStateOf<Int?>(null) }
    var answerVisible by remember { mutableStateOf(false) }
    var timedOut by remember { mutableStateOf(false) }
    var secondsLeft by remember { mutableStateOf(settings.secondsLimit) }
    var flash by remember { mutableStateOf<String?>(null) }
    var roundId by remember { mutableStateOf(0) }
    var surprise by remember { mutableStateOf(surprises.random()) }
    val mistakeWeights = remember { mutableStateMapOf<Int, Int>() }

    fun parseQuestions(source: String): Pair<List<Question>, String?> {
        val parsed = runCatching { json.decodeFromString<List<Question>>(source) }
            .getOrElse { return emptyList<Question>() to "JSON musi byt seznam objektu s atributy q a a." }
        val invalidIndex = parsed.indexOfFirst { it.q.isBlank() || it.a.isBlank() }
        if (invalidIndex >= 0) {
            return emptyList<Question>() to "Otazka cislo ${invalidIndex + 1} nema vyplnene q nebo a."
        }
        return parsed to null
    }

    fun pickQuestion() {
        if (questions.isEmpty()) {
            currentIndex = null
            return
        }
        val weighted = questions.indices.flatMap { index ->
            val question = questions[index]
            val stats = serverStats[questionKey(question.q, question.a)]
            val longTermDifficulty = stats?.let { max(0, (it.mistakes * 2) - it.correct) } ?: 0
            val sessionDifficulty = mistakeWeights[index] ?: 0
            List(1 + (longTermDifficulty * 2) + (sessionDifficulty * 3)) { index }
        }
        currentIndex = weighted.random()
        answerVisible = false
        timedOut = false
        secondsLeft = settings.secondsLimit
        roundId += 1
    }

    fun restartGame() {
        score = 0
        mistakeWeights.clear()
        screen = Screen.Play
        pickQuestion()
    }

    fun saveSettings(next: GameSettings) {
        settings = next
        window.localStorage.setItem(SecondsStorageKey, next.secondsLimit.toString())
        window.localStorage.setItem(TargetStorageKey, next.targetScore.toString())
    }

    fun showPenalty() {
        flash = "-1"
    }

    fun finishIfNeeded(nextScore: Int): Boolean {
        if (nextScore >= settings.targetScore) {
            surprise = surprises.random()
            screen = Screen.Finished
            return true
        }
        return false
    }

    suspend fun loadServerStats() {
        val bytes = window.api.tryGetBytes("stats") ?: return
        serverStats = json.decodeFromString<QuestionStatsSnapshot>(bytes.decodeToString()).statsByKey
    }

    suspend fun checkAuth(): Boolean {
        val bytes = window.api.tryGetBytes("auth/status") ?: return false
        return json.decodeFromString<AuthStatusResponse>(bytes.decodeToString()).authenticated
    }

    suspend fun login(password: String): Boolean {
        val bytes = window.api.tryPostBytes(
            apiPath = "auth/login",
            headers = mapOf("Content-Type" to "application/json"),
            body = json.encodeToString(LoginRequest(password)).encodeToByteArray(),
        ) ?: return false
        return json.decodeFromString<AuthStatusResponse>(bytes.decodeToString()).authenticated
    }

    suspend fun loadQuestionsJsonFromServer(): String {
        val bytes = window.api.tryGetBytes("questions")
        return bytes?.decodeToString() ?: window.fetch("/data/questions.json").await().text().await()
    }

    suspend fun saveQuestionsJsonToServer(source: String): Boolean {
        return window.api.tryPostBytes(
            apiPath = "questions",
            headers = mapOf("Content-Type" to "application/json"),
            body = source.encodeToByteArray(),
        ) != null
    }

    suspend fun recordAnswer(index: Int, correct: Boolean, timedOut: Boolean = false) {
        val question = questions.getOrNull(index) ?: return
        val request = AnswerResultRequest(
            q = question.q,
            a = question.a,
            correct = correct,
            timedOut = timedOut,
        )
        val bytes = window.api.tryPostBytes(
            apiPath = "stats/answer",
            headers = mapOf("Content-Type" to "application/json"),
            body = json.encodeToString(request).encodeToByteArray(),
        ) ?: return
        val response = json.decodeFromString<AnswerResultResponse>(bytes.decodeToString())
        serverStats = serverStats + (response.key to response.stats)
    }

    suspend fun loadGameData() {
        loading = true
        window.localStorage.removeItem(LegacyQuestionsStorageKey)
        loadServerStats()

        val savedSeconds = window.localStorage.getItem(SecondsStorageKey)?.toIntOrNull()
        val savedTarget = window.localStorage.getItem(TargetStorageKey)?.toIntOrNull()
        val savedSettings = GameSettings(
            secondsLimit = savedSeconds?.coerceAtLeast(1) ?: 10,
            targetScore = savedTarget?.coerceAtLeast(1) ?: 10,
        )
        settings = savedSettings
        secondsLeft = savedSettings.secondsLimit

        val loadedJson = loadQuestionsJsonFromServer()
        questionJson = loadedJson
        val (loadedQuestions, error) = parseQuestions(loadedJson)
        jsonError = error
        questions = loadedQuestions
        if (loadedQuestions.isNotEmpty()) {
            screen = Screen.Start
        } else {
            screen = Screen.Settings
        }
        loading = false
    }

    LaunchedEffect(Unit) {
        if (checkAuth()) {
            loadGameData()
        } else {
            screen = Screen.Login
            loading = false
        }
    }

    LaunchedEffect(roundId, answerVisible, screen) {
        if (screen != Screen.Play || answerVisible || currentIndex == null) return@LaunchedEffect
        while (secondsLeft > 0 && !answerVisible && screen == Screen.Play) {
            delay(1_000)
            secondsLeft = max(0, secondsLeft - 1)
        }
        if (secondsLeft == 0 && !answerVisible && screen == Screen.Play) {
            timedOut = true
            answerVisible = true
            score -= 1
            currentIndex?.let {
                mistakeWeights[it] = (mistakeWeights[it] ?: 0) + 1
                recordAnswer(it, correct = false, timedOut = true)
            }
            showPenalty()
        }
    }

    LaunchedEffect(flash) {
        if (flash != null) {
            delay(900)
            flash = null
        }
    }

    Div(attrs = { classes("app") }) {
        if (screen == Screen.Play || screen == Screen.Settings) {
            TopBar(
                score = score,
                secondsLeft = secondsLeft,
                targetScore = settings.targetScore,
                flash = flash,
                onSettings = { screen = Screen.Settings },
                onRestart = { restartGame() },
            )
        }

        when (screen) {
            Screen.Login -> LoginView(
                loading = authLoading,
                error = authError,
                onSubmit = { password ->
                    coroutineScope.launch {
                        authLoading = true
                        authError = null
                        if (login(password)) {
                            authLoading = false
                            loadGameData()
                        } else {
                            authLoading = false
                            authError = "Heslo nesedi."
                        }
                    }
                },
            )

            Screen.Start -> StartView(
                questionCount = questions.size,
                loading = loading,
                onStartSmallMultiplication = { restartGame() },
                onSettings = { screen = Screen.Settings },
            )

            Screen.Settings -> SettingsView(
                settings = settings,
                questionJson = questionJson,
                jsonError = jsonError,
                questionCount = questions.size,
                onJsonChange = { questionJson = it },
                onSecondsChange = { settings = settings.copy(secondsLimit = it.coerceAtLeast(1)) },
                onTargetChange = { settings = settings.copy(targetScore = it.coerceAtLeast(1)) },
                onSave = {
                    val (parsed, error) = parseQuestions(questionJson)
                    jsonError = error
                    if (error == null) {
                        coroutineScope.launch {
                            val saved = saveQuestionsJsonToServer(questionJson)
                            if (saved) {
                                questions = parsed
                                loadServerStats()
                                saveSettings(settings)
                                restartGame()
                            } else {
                                jsonError = "Otazky se nepodarilo ulozit na server."
                            }
                        }
                    }
                },
            )

            Screen.Play -> PlayView(
                question = currentIndex?.let { questions.getOrNull(it) },
                answerVisible = answerVisible,
                timedOut = timedOut,
                onShowAnswer = { answerVisible = true },
                onWrong = {
                    val nextScore = score - 1
                    score = nextScore
                    currentIndex?.let {
                        mistakeWeights[it] = (mistakeWeights[it] ?: 0) + 1
                        coroutineScope.launch { recordAnswer(it, correct = false) }
                    }
                    showPenalty()
                    pickQuestion()
                },
                onNext = {
                    val nextScore = score + 1
                    score = nextScore
                    currentIndex?.let {
                        mistakeWeights[it] = max(0, (mistakeWeights[it] ?: 0) - 1)
                        coroutineScope.launch { recordAnswer(it, correct = true) }
                    }
                    if (!finishIfNeeded(nextScore)) pickQuestion()
                },
                onNextAfterTimeout = { pickQuestion() },
            )

            Screen.Finished -> FinishedView(
                score = score,
                targetScore = settings.targetScore,
                surprise = surprise,
                onPlayAgain = { restartGame() },
            )
        }
    }
}

@Composable
private fun LoginView(
    loading: Boolean,
    error: String?,
    onSubmit: (String) -> Unit,
) {
    var password by remember { mutableStateOf("") }

    Div(attrs = { classes("login-screen") }) {
        Span(attrs = { classes("label") }) { Text("Kids Quiz") }
        H1 { Text("Heslo") }
        Label(attrs = { classes("password-label") }) {
            Input(type = InputType.Password) {
                attr("autocomplete", "current-password")
                attr("autofocus", "true")
                value(password)
                onInput { password = it.value }
            }
        }
        error?.let {
            P(attrs = { classes("error", "login-error") }) { Text(it) }
        }
        Button(attrs = {
            classes("primary-button", "login-button")
            if (loading || password.isBlank()) disabled()
            onClick { onSubmit(password) }
        }) {
            Text(if (loading) "Overuju..." else "Vstoupit")
        }
    }
}

@Composable
private fun StartView(
    questionCount: Int,
    loading: Boolean,
    onStartSmallMultiplication: () -> Unit,
    onSettings: () -> Unit,
) {
    Div(attrs = { classes("start-screen") }) {
        Span(attrs = { classes("label") }) { Text("Kids Quiz") }
        H1 { Text("Vyber test") }
        Div(attrs = { classes("test-list") }) {
            Button(attrs = {
                classes("primary-button", "test-button")
                if (loading || questionCount == 0) disabled()
                onClick { onStartSmallMultiplication() }
            }) {
                Text(if (loading) "Nacitam testy..." else "Mala nasobilka")
            }
        }
        Span(attrs = { classes("start-meta") }) {
            Text(if (loading) "Pripravuju otazky" else "$questionCount otazek")
        }
        Button(attrs = { classes("ghost-button", "dark"); onClick { onSettings() } }) {
            Text("Settings")
        }
    }
}

@Composable
private fun TopBar(
    score: Int,
    secondsLeft: Int,
    targetScore: Int,
    flash: String?,
    onSettings: () -> Unit,
    onRestart: () -> Unit,
) {
    Div(attrs = { classes("top-bar") }) {
        Div(attrs = { classes("score-pill") }) {
            Text("Score $score / $targetScore")
            flash?.let {
                Span(attrs = { classes("flash") }) { Text(it) }
            }
        }
        Div(attrs = { classes("timer-pill") }) { Text("${secondsLeft}s") }
        Div(attrs = { classes("top-actions") }) {
            Button(attrs = { classes("ghost-button"); onClick { onRestart() } }) { Text("Restart") }
            Button(attrs = { classes("ghost-button"); onClick { onSettings() } }) { Text("Settings") }
        }
    }
}

@Composable
private fun PlayView(
    question: Question?,
    answerVisible: Boolean,
    timedOut: Boolean,
    onShowAnswer: () -> Unit,
    onWrong: () -> Unit,
    onNext: () -> Unit,
    onNextAfterTimeout: () -> Unit,
) {
    Div(attrs = { classes("play-surface") }) {
        if (question == null) {
            H1 { Text("Vloz prvni otazky v nastaveni.") }
            P { Text("Format je seznam objektu: [{\"q\":\"2 + 2?\",\"a\":\"4\"}]") }
            return@Div
        }

        Div(attrs = { classes("question-card") }) {
            Span(attrs = { classes("label") }) { Text(if (answerVisible) "Answer" else "Question") }
            H1 { Text(if (answerVisible) question.a else question.q) }
            if (timedOut) {
                P(attrs = { classes("timeout-note") }) { Text("Cas vyprsel, bod uz je odecteny.") }
            }
        }

        Div(attrs = { classes("main-actions", "answer-actions") }) {
            if (!answerVisible) {
                Button(attrs = { classes("primary-button", "answer-button"); onClick { onShowAnswer() } }) {
                    Text("Show answer")
                }
            } else if (timedOut) {
                Button(attrs = { classes("primary-button", "answer-button"); onClick { onNextAfterTimeout() } }) {
                    Text("Next")
                }
            } else {
                Button(attrs = { classes("danger-button", "answer-button"); onClick { onWrong() } }) { Text("Wrong") }
                Button(attrs = { classes("primary-button", "answer-button"); onClick { onNext() } }) { Text("Next") }
            }
        }
    }
}

@Composable
private fun SettingsView(
    settings: GameSettings,
    questionJson: String,
    jsonError: String?,
    questionCount: Int,
    onJsonChange: (String) -> Unit,
    onSecondsChange: (Int) -> Unit,
    onTargetChange: (Int) -> Unit,
    onSave: () -> Unit,
) {
    Div(attrs = { classes("settings-panel") }) {
        H1 { Text("Settings") }
        P { Text("Questions loaded: $questionCount") }

        Div(attrs = { classes("settings-grid") }) {
            Label {
                Text("Seconds")
                Input(type = InputType.Text) {
                    attr("inputmode", "numeric")
                    value(settings.secondsLimit.toString())
                    onInput { onSecondsChange(it.value.toIntOrNull() ?: 10) }
                }
            }
            Label {
                Text("Target score")
                Input(type = InputType.Text) {
                    attr("inputmode", "numeric")
                    value(settings.targetScore.toString())
                    onInput { onTargetChange(it.value.toIntOrNull() ?: 10) }
                }
            }
        }

        Label(attrs = { classes("json-label") }) {
            Text("Questions JSON")
            TextArea(value = questionJson, attrs = {
                onInput { onJsonChange(it.value) }
            })
        }

        jsonError?.let {
            P(attrs = { classes("error") }) { Text(it) }
        }

        Button(attrs = { classes("primary-button"); onClick { onSave() } }) {
            Text("Save and play")
        }
    }
}

@Composable
private fun FinishedView(
    score: Int,
    targetScore: Int,
    surprise: AnimalSurprise,
    onPlayAgain: () -> Unit,
) {
    Div(attrs = { classes("finish-screen") }) {
        Div(attrs = { classes("confetti") }) { Text("★  ✦  ★  ✦  ★") }
        Div(attrs = { classes("animal-frame", surprise.animationClass) }) {
            Span(attrs = { classes("animal-fallback") }) { Text("★") }
            Img(src = surprise.imagePath, attrs = {
                classes("animal-image")
                attr("alt", "Gratulace")
            })
        }
        Span(attrs = { classes("label") }) { Text("Score $score / $targetScore") }
        H1 { Text("Gratulace!") }
        Div(attrs = { classes("main-actions") }) {
            Button(attrs = { classes("primary-button", "finish-play-button"); onClick { onPlayAgain() } }) {
                Text("Play again")
            }
        }
    }
}
