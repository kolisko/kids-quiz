package com.example.quiz.api

import com.varabyte.kobweb.api.Api
import com.varabyte.kobweb.api.ApiContext
import com.varabyte.kobweb.api.http.Body
import com.varabyte.kobweb.api.http.HttpMethod
import com.varabyte.kobweb.api.http.json
import com.varabyte.kobweb.api.http.text

@Api
suspend fun questions(ctx: ApiContext) {
    if (!Auth.requireAuthenticated(ctx)) return

    when (ctx.req.method) {
        HttpMethod.GET -> {
            ctx.res.headers["Content-Type"] = "application/json"
            ctx.res.body = Body.json(QuestionsStore.readQuestionsJson())
            ctx.res.status = 200
        }

        HttpMethod.POST -> {
            val body = runCatching { ctx.req.body?.text() }.getOrNull()
            if (body == null || !QuestionsStore.saveQuestionsJson(body)) {
                ctx.res.status = 400
                return
            }
            ctx.res.headers["Content-Type"] = "application/json"
            ctx.res.body = Body.json("""{"ok":true}""")
            ctx.res.status = 200
        }

        else -> {
            ctx.res.status = 405
        }
    }
}
