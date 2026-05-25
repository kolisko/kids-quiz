package com.example.quiz

import io.ktor.http.Parameters
import kotlinx.serialization.Serializable
import kotlin.random.Random

enum class TrophyAnimalBody {
    round,
    pear,
    bean,
    square,
}

enum class TrophyAnimalEars {
    round,
    triangle,
    floppy,
    tiny,
}

enum class TrophyAnimalEyes {
    dot,
    oval,
    sleepy,
    sparkle,
}

enum class TrophyAnimalNose {
    oval,
    heart,
    button,
    triangle,
}

enum class TrophyAnimalMouth {
    smile,
    grin,
    open,
    shy,
}

enum class TrophyAnimalPalette {
    coral,
    mint,
    sky,
    lemon,
    violet,
    berry,
}

enum class TrophyAnimalBackground {
    plain,
    dots,
    waves,
    stars,
}

data class TrophyAnimalSpec(
    val body: TrophyAnimalBody,
    val ears: TrophyAnimalEars,
    val eyes: TrophyAnimalEyes,
    val nose: TrophyAnimalNose,
    val mouth: TrophyAnimalMouth,
    val palette: TrophyAnimalPalette,
    val background: TrophyAnimalBackground,
) {
    fun cacheKey(): String {
        return listOf(body, ears, eyes, nose, mouth, palette, background).joinToString("-") { it.name }
    }
}

object TrophyAnimalService {
    private const val generatedAnimalKeyPrefix = "generated:"
    private const val generatedAnimalImagePath = "/api/trophy-animals/generated.svg"
    val staticAnimalKeys: Set<String> = (1..40).map { "animal-${it.toString().padStart(2, '0')}" }.toSet()
    private val requiredParams = listOf("body", "ears", "eyes", "nose", "mouth", "palette", "background")
    private val requiredParamSet = requiredParams.toSet()
    private val allGeneratedSpecs: List<TrophyAnimalSpec> by lazy {
        buildList {
            for (body in enumValues<TrophyAnimalBody>()) {
                for (ears in enumValues<TrophyAnimalEars>()) {
                    for (eyes in enumValues<TrophyAnimalEyes>()) {
                        for (nose in enumValues<TrophyAnimalNose>()) {
                            for (mouth in enumValues<TrophyAnimalMouth>()) {
                                for (palette in enumValues<TrophyAnimalPalette>()) {
                                    for (background in enumValues<TrophyAnimalBackground>()) {
                                        add(TrophyAnimalSpec(body, ears, eyes, nose, mouth, palette, background))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    fun parse(params: Parameters): TrophyAnimalSpecResult {
        val names = params.names()
        if (names.isEmpty()) return TrophyAnimalSpecResult.Valid(randomSpec(), random = true)
        val invalidParams = names - requiredParamSet
        if (invalidParams.isNotEmpty()) {
            return TrophyAnimalSpecResult.Invalid("unknown_parameters", invalidParams.sorted())
        }
        val missingParams = requiredParamSet - names
        if (missingParams.isNotEmpty()) {
            return TrophyAnimalSpecResult.Invalid("missing_parameters", missingParams.sorted())
        }
        return try {
            val duplicateParams = requiredParams.filter { (params.getAll(it)?.size ?: 0) != 1 }
            if (duplicateParams.isNotEmpty()) {
                return TrophyAnimalSpecResult.Invalid("invalid_parameter_count", duplicateParams.sorted())
            }
            TrophyAnimalSpecResult.Valid(
                TrophyAnimalSpec(
                    body = enumValue(params, "body"),
                    ears = enumValue(params, "ears"),
                    eyes = enumValue(params, "eyes"),
                    nose = enumValue(params, "nose"),
                    mouth = enumValue(params, "mouth"),
                    palette = enumValue(params, "palette"),
                    background = enumValue(params, "background"),
                ),
                random = false,
            )
        } catch (error: IllegalArgumentException) {
            TrophyAnimalSpecResult.Invalid("invalid_parameter_value", emptyList())
        }
    }

    fun nextUnwonAnimalKey(wonKeys: Set<String>): String? {
        val normalizedWonKeys = wonKeys.mapNotNull { normalizedAnimalKey(it) }.toSet()
        val availableStaticKeys = staticAnimalKeys.filterNot { it in normalizedWonKeys }
        if (availableStaticKeys.isNotEmpty()) return randomItem(availableStaticKeys)

        val availableGeneratedSpecs = allGeneratedSpecs.filter { generatedAnimalKey(it) !in normalizedWonKeys }
        return randomItem(availableGeneratedSpecs)?.let { generatedAnimalKey(it) }
    }

    fun imagePathForAnimalKey(animalKey: String): String? {
        if (animalKey in staticAnimalKeys) return "/assets/animals/$animalKey.svg"
        val spec = parseGeneratedAnimalKey(animalKey) ?: return null
        return "$generatedAnimalImagePath?${canonicalQuery(spec)}"
    }

    fun normalizedAnimalKey(animalKey: String): String? {
        if (animalKey in staticAnimalKeys) return animalKey
        return parseGeneratedAnimalKey(animalKey)?.let { generatedAnimalKey(it) }
    }

    fun generatedAnimalKey(spec: TrophyAnimalSpec): String {
        return "$generatedAnimalKeyPrefix${canonicalQuery(spec)}"
    }

    fun parseGeneratedAnimalKey(animalKey: String): TrophyAnimalSpec? {
        if (!animalKey.startsWith(generatedAnimalKeyPrefix)) return null
        val query = animalKey.removePrefix(generatedAnimalKeyPrefix)
        if (query.isBlank()) return null
        val values = mutableMapOf<String, String>()
        for (part in query.split("&")) {
            val pieces = part.split("=", limit = 2)
            if (pieces.size != 2) return null
            val name = pieces[0]
            val value = pieces[1]
            if (name !in requiredParamSet || value.isBlank() || values.put(name, value) != null) return null
        }
        if (values.keys != requiredParamSet) return null
        return runCatching { specFromValues(values) }.getOrNull()
    }

    fun renderSvg(spec: TrophyAnimalSpec): String {
        val colors = paletteColors(spec.palette)
        return """
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="Generated trophy animal">
              <rect width="400" height="400" rx="64" fill="${colors.background}"/>
              ${backgroundSvg(spec.background, colors)}
              ${earsSvg(spec.ears, colors)}
              ${bodySvg(spec.body, colors)}
              ${eyesSvg(spec.eyes)}
              ${noseSvg(spec.nose, colors)}
              ${mouthSvg(spec.mouth)}
            </svg>
        """.trimIndent()
    }

    private fun canonicalQuery(spec: TrophyAnimalSpec): String {
        return listOf(
            "body=${spec.body.name}",
            "ears=${spec.ears.name}",
            "eyes=${spec.eyes.name}",
            "nose=${spec.nose.name}",
            "mouth=${spec.mouth.name}",
            "palette=${spec.palette.name}",
            "background=${spec.background.name}",
        ).joinToString("&")
    }

    private inline fun <reified T : Enum<T>> enumValue(params: Parameters, name: String): T {
        val value = params[name] ?: throw IllegalArgumentException("Missing $name")
        return enumValues<T>().firstOrNull { it.name == value }
            ?: throw IllegalArgumentException("Invalid $name")
    }

    private fun specFromValues(values: Map<String, String>): TrophyAnimalSpec {
        return TrophyAnimalSpec(
            body = enumValue(values, "body"),
            ears = enumValue(values, "ears"),
            eyes = enumValue(values, "eyes"),
            nose = enumValue(values, "nose"),
            mouth = enumValue(values, "mouth"),
            palette = enumValue(values, "palette"),
            background = enumValue(values, "background"),
        )
    }

    private inline fun <reified T : Enum<T>> enumValue(values: Map<String, String>, name: String): T {
        val value = values[name] ?: throw IllegalArgumentException("Missing $name")
        return enumValues<T>().firstOrNull { it.name == value }
            ?: throw IllegalArgumentException("Invalid $name")
    }

    private fun randomSpec(): TrophyAnimalSpec {
        return TrophyAnimalSpec(
            body = randomEnum(),
            ears = randomEnum(),
            eyes = randomEnum(),
            nose = randomEnum(),
            mouth = randomEnum(),
            palette = randomEnum(),
            background = randomEnum(),
        )
    }

    private inline fun <reified T : Enum<T>> randomEnum(): T {
        val values = enumValues<T>()
        return values[Random.nextInt(values.size)]
    }

    private fun <T> randomItem(items: List<T>): T? {
        if (items.isEmpty()) return null
        return items[Random.nextInt(items.size)]
    }

    private fun paletteColors(palette: TrophyAnimalPalette): TrophyAnimalColors {
        return when (palette) {
            TrophyAnimalPalette.coral -> TrophyAnimalColors("#fff7ed", "#fb7185", "#f472b6", "#fed7aa")
            TrophyAnimalPalette.mint -> TrophyAnimalColors("#ecfdf5", "#34d399", "#2dd4bf", "#bbf7d0")
            TrophyAnimalPalette.sky -> TrophyAnimalColors("#eff6ff", "#60a5fa", "#38bdf8", "#bfdbfe")
            TrophyAnimalPalette.lemon -> TrophyAnimalColors("#fefce8", "#facc15", "#fb923c", "#fde68a")
            TrophyAnimalPalette.violet -> TrophyAnimalColors("#f5f3ff", "#a78bfa", "#c084fc", "#ddd6fe")
            TrophyAnimalPalette.berry -> TrophyAnimalColors("#fdf2f8", "#ec4899", "#f43f5e", "#fbcfe8")
        }
    }

    private fun backgroundSvg(background: TrophyAnimalBackground, colors: TrophyAnimalColors): String {
        return when (background) {
            TrophyAnimalBackground.plain -> ""
            TrophyAnimalBackground.dots -> """
              <circle cx="66" cy="68" r="20" fill="${colors.accent}" opacity="0.45"/>
              <circle cx="335" cy="78" r="26" fill="${colors.secondary}" opacity="0.42"/>
              <circle cx="322" cy="322" r="17" fill="${colors.accent}" opacity="0.35"/>
            """.trimIndent()
            TrophyAnimalBackground.waves -> """
              <path d="M46 318 C96 282 119 352 168 318 C216 285 242 352 293 316 C322 296 344 300 363 318" stroke="${colors.accent}" stroke-width="14" fill="none" stroke-linecap="round" opacity="0.62"/>
            """.trimIndent()
            TrophyAnimalBackground.stars -> """
              <path d="M76 72 l8 16 18 3 -13 12 3 18 -16 -9 -16 9 3 -18 -13 -12 18 -3z" fill="${colors.accent}" opacity="0.5"/>
              <path d="M318 74 l7 13 15 2 -11 10 3 15 -14 -7 -13 7 2 -15 -11 -10 16 -2z" fill="${colors.secondary}" opacity="0.5"/>
              <path d="M332 300 l6 12 14 2 -10 9 2 14 -12 -7 -12 7 2 -14 -10 -9 14 -2z" fill="${colors.accent}" opacity="0.42"/>
            """.trimIndent()
        }
    }

    private fun earsSvg(ears: TrophyAnimalEars, colors: TrophyAnimalColors): String {
        return when (ears) {
            TrophyAnimalEars.round -> """
              <circle cx="120" cy="126" r="42" fill="${colors.secondary}"/>
              <circle cx="280" cy="126" r="42" fill="${colors.secondary}"/>
            """.trimIndent()
            TrophyAnimalEars.triangle -> """
              <path d="M105 126 L145 48 L174 132 Z" fill="${colors.secondary}"/>
              <path d="M226 132 L255 48 L295 126 Z" fill="${colors.secondary}"/>
            """.trimIndent()
            TrophyAnimalEars.floppy -> """
              <path d="M116 108 C64 122 66 202 124 214 C148 176 148 132 116 108 Z" fill="${colors.secondary}"/>
              <path d="M284 108 C336 122 334 202 276 214 C252 176 252 132 284 108 Z" fill="${colors.secondary}"/>
            """.trimIndent()
            TrophyAnimalEars.tiny -> """
              <circle cx="136" cy="112" r="25" fill="${colors.secondary}"/>
              <circle cx="264" cy="112" r="25" fill="${colors.secondary}"/>
            """.trimIndent()
        }
    }

    private fun bodySvg(body: TrophyAnimalBody, colors: TrophyAnimalColors): String {
        return when (body) {
            TrophyAnimalBody.round -> """<circle cx="200" cy="196" r="118" fill="${colors.primary}"/>"""
            TrophyAnimalBody.pear -> """<path d="M200 74 C270 74 318 132 306 210 C294 292 252 336 200 336 C148 336 106 292 94 210 C82 132 130 74 200 74 Z" fill="${colors.primary}"/>"""
            TrophyAnimalBody.bean -> """<path d="M112 214 C68 132 138 68 224 82 C313 96 332 180 286 260 C240 340 154 294 112 214 Z" fill="${colors.primary}"/>"""
            TrophyAnimalBody.square -> """<rect x="92" y="92" width="216" height="216" rx="70" fill="${colors.primary}"/>"""
        }
    }

    private fun eyesSvg(eyes: TrophyAnimalEyes): String {
        return when (eyes) {
            TrophyAnimalEyes.dot -> """
              <circle cx="158" cy="178" r="18" fill="#111827"/>
              <circle cx="242" cy="178" r="18" fill="#111827"/>
              <circle cx="164" cy="171" r="6" fill="#ffffff"/>
              <circle cx="248" cy="171" r="6" fill="#ffffff"/>
            """.trimIndent()
            TrophyAnimalEyes.oval -> """
              <ellipse cx="157" cy="178" rx="20" ry="25" fill="#111827"/>
              <ellipse cx="243" cy="178" rx="20" ry="25" fill="#111827"/>
              <circle cx="164" cy="168" r="7" fill="#ffffff"/>
              <circle cx="250" cy="168" r="7" fill="#ffffff"/>
            """.trimIndent()
            TrophyAnimalEyes.sleepy -> """
              <path d="M136 178 C148 166 166 166 178 178" stroke="#111827" stroke-width="12" fill="none" stroke-linecap="round"/>
              <path d="M222 178 C234 166 252 166 264 178" stroke="#111827" stroke-width="12" fill="none" stroke-linecap="round"/>
            """.trimIndent()
            TrophyAnimalEyes.sparkle -> """
              <path d="M158 150 l9 18 20 4 -15 14 4 20 -18 -10 -18 10 4 -20 -15 -14 20 -4z" fill="#111827"/>
              <path d="M242 150 l9 18 20 4 -15 14 4 20 -18 -10 -18 10 4 -20 -15 -14 20 -4z" fill="#111827"/>
              <circle cx="163" cy="170" r="5" fill="#ffffff"/>
              <circle cx="247" cy="170" r="5" fill="#ffffff"/>
            """.trimIndent()
        }
    }

    private fun noseSvg(nose: TrophyAnimalNose, colors: TrophyAnimalColors): String {
        return when (nose) {
            TrophyAnimalNose.oval -> """<ellipse cx="200" cy="214" rx="25" ry="20" fill="#111827" opacity="0.86"/>"""
            TrophyAnimalNose.heart -> """<path d="M200 234 C168 214 174 184 194 190 C198 191 200 195 200 195 C200 195 202 191 206 190 C226 184 232 214 200 234 Z" fill="#111827" opacity="0.86"/>"""
            TrophyAnimalNose.button -> """<circle cx="200" cy="214" r="20" fill="#111827" opacity="0.86"/><circle cx="193" cy="207" r="5" fill="${colors.highlight}" opacity="0.85"/>"""
            TrophyAnimalNose.triangle -> """<path d="M200 234 L174 198 L226 198 Z" fill="#111827" opacity="0.86"/>"""
        }
    }

    private fun mouthSvg(mouth: TrophyAnimalMouth): String {
        return when (mouth) {
            TrophyAnimalMouth.smile -> """<path d="M154 248 C178 280 222 280 246 248" stroke="#7f1d1d" stroke-width="13" fill="none" stroke-linecap="round"/>"""
            TrophyAnimalMouth.grin -> """
              <path d="M148 248 C164 296 236 296 252 248 C232 270 168 270 148 248 Z" fill="#7f1d1d" opacity="0.92"/>
              <path d="M166 256 C180 267 220 267 234 256" stroke="#ffffff" stroke-width="8" fill="none" stroke-linecap="round"/>
            """.trimIndent()
            TrophyAnimalMouth.open -> """<ellipse cx="200" cy="262" rx="35" ry="29" fill="#7f1d1d" opacity="0.92"/><ellipse cx="200" cy="274" rx="19" ry="10" fill="#fb7185" opacity="0.8"/>"""
            TrophyAnimalMouth.shy -> """<path d="M178 252 C190 262 210 262 222 252" stroke="#7f1d1d" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="145" cy="242" r="11" fill="#ffffff" opacity="0.45"/><circle cx="255" cy="242" r="11" fill="#ffffff" opacity="0.45"/>"""
        }
    }
}

sealed class TrophyAnimalSpecResult {
    data class Valid(val spec: TrophyAnimalSpec, val random: Boolean) : TrophyAnimalSpecResult()
    data class Invalid(val code: String, val fields: List<String>) : TrophyAnimalSpecResult()
}

@Serializable
data class TrophyAnimalErrorResponse(
    val error: String,
    val fields: List<String> = emptyList(),
)

private data class TrophyAnimalColors(
    val background: String,
    val primary: String,
    val secondary: String,
    val accent: String,
) {
    val highlight: String = "#ffffff"
}
