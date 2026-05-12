package com.example.quiz.api

import com.varabyte.kobweb.api.Api
import com.varabyte.kobweb.api.ApiContext
import com.varabyte.kobweb.api.http.Body
import com.varabyte.kobweb.api.http.HttpMethod
import com.varabyte.kobweb.api.http.json

@Api
fun stats(ctx: ApiContext) {
    if (ctx.req.method != HttpMethod.GET) return
    if (!Auth.requireAuthenticated(ctx)) return
    ctx.res.headers["Content-Type"] = "application/json"
    ctx.res.body = Body.json(statsSnapshotJson(StatsStore.snapshot()))
    ctx.res.status = 200
}
