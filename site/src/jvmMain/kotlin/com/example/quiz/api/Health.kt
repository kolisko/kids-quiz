package com.example.quiz.api

import com.varabyte.kobweb.api.Api
import com.varabyte.kobweb.api.ApiContext
import com.varabyte.kobweb.api.http.Body
import com.varabyte.kobweb.api.http.HttpMethod
import com.varabyte.kobweb.api.http.json

@Api
fun health(ctx: ApiContext) {
    if (ctx.req.method != HttpMethod.GET) return
    ctx.res.headers["Content-Type"] = "application/json"
    ctx.res.body = Body.json("""{"ok":true}""")
    ctx.res.status = 200
}
