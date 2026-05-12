package com.example.quiz.api.stats

import com.example.quiz.api.StatsStore
import com.example.quiz.api.Auth
import com.example.quiz.api.readJsonBoolean
import com.example.quiz.api.readJsonString
import com.example.quiz.api.answerResultJson
import com.varabyte.kobweb.api.Api
import com.varabyte.kobweb.api.ApiContext
import com.varabyte.kobweb.api.http.Body
import com.varabyte.kobweb.api.http.HttpMethod
import com.varabyte.kobweb.api.http.json
import com.varabyte.kobweb.api.http.text

@Api
suspend fun answer(ctx: ApiContext) {
    if (ctx.req.method != HttpMethod.POST) return
    if (!Auth.requireAuthenticated(ctx)) return
    val body = runCatching { ctx.req.body?.text() }.getOrElse {
        ctx.res.status = 400
        return
    } ?: run {
        ctx.res.status = 400
        return
    }
    val q = readJsonString(body, "q")
    val a = readJsonString(body, "a")
    val correct = readJsonBoolean(body, "correct")
    val timedOut = readJsonBoolean(body, "timedOut") ?: false
    if (q == null || a == null || correct == null) {
        ctx.res.status = 400
        return
    }

    val (key, stats) = StatsStore.record(q, a, correct, timedOut)
    ctx.res.headers["Content-Type"] = "application/json"
    ctx.res.body = Body.json(answerResultJson(key, stats))
    ctx.res.status = 200
}
