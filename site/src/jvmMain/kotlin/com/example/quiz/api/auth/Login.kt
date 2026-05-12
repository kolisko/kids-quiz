package com.example.quiz.api.auth

import com.example.quiz.api.Auth
import com.example.quiz.api.readJsonString
import com.varabyte.kobweb.api.Api
import com.varabyte.kobweb.api.ApiContext
import com.varabyte.kobweb.api.http.Body
import com.varabyte.kobweb.api.http.HttpMethod
import com.varabyte.kobweb.api.http.json
import com.varabyte.kobweb.api.http.text

@Api
suspend fun login(ctx: ApiContext) {
    if (ctx.req.method != HttpMethod.POST) {
        ctx.res.status = 405
        return
    }

    val body = runCatching { ctx.req.body?.text() }.getOrNull()
    val password = body?.let { readJsonString(it, "password") }
    if (password == null || !Auth.passwordMatches(password)) {
        ctx.res.status = 401
        ctx.res.headers["Content-Type"] = "application/json"
        ctx.res.body = Body.json("""{"authenticated":false}""")
        return
    }

    Auth.setSessionCookie(ctx)
    ctx.res.status = 200
    ctx.res.headers["Content-Type"] = "application/json"
    ctx.res.body = Body.json("""{"authenticated":true}""")
}
