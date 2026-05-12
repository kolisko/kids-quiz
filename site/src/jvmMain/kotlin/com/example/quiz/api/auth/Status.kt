package com.example.quiz.api.auth

import com.example.quiz.api.Auth
import com.varabyte.kobweb.api.Api
import com.varabyte.kobweb.api.ApiContext
import com.varabyte.kobweb.api.http.Body
import com.varabyte.kobweb.api.http.HttpMethod
import com.varabyte.kobweb.api.http.json

@Api
fun status(ctx: ApiContext) {
    if (ctx.req.method != HttpMethod.GET) {
        ctx.res.status = 405
        return
    }

    ctx.res.status = 200
    ctx.res.headers["Content-Type"] = "application/json"
    ctx.res.body = Body.json("""{"authenticated":${Auth.isAuthenticated(ctx)}}""")
}
