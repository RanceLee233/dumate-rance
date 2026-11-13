import test from "node:test"
import assert from "node:assert/strict"
import { DuMatePlugin } from "../index.mjs"

test("credentials are sent only to the official chat endpoint, without redirects", async () => {
  const hooks = await DuMatePlugin()
  const loader = await hooks.auth.loader(async () => ({ type: "oauth", cookies: [{ name: "bce-sessionid", value: "FAKE-SESSION", domain: ".baidu.com" }] }))
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = async (url, init) => {
      calls++
      assert.equal(init.redirect, "error")
      if (String(url).includes("/api/dumate/app/token/get")) return Response.json({ code: 0, result: { token: "FAKE-TOKEN", expired_at: new Date(Date.now() + 3600000).toISOString() } })
      assert.equal(String(url), "https://dumate-svc.baidu.com/gateway/apis/v1/chat/completions")
      assert.equal(init.headers.get("Authorization"), "Bearer FAKE-TOKEN")
      assert.equal(init.headers.get("x-api-key"), null)
      const body = JSON.parse(init.body)
      assert.equal(body.model, "deepseek-v41-flash")
      assert.deepEqual(body.thinking, { type: body.label === "none" ? "disabled" : "enabled" })
      assert.equal(body.enable_thinking, body.label !== "none")
      assert.equal(body.reasoning_effort, { none: undefined, low: "high", high: "high", max: "max" }[body.label])
      assert.deepEqual(body.messages, [{ role: "user", content: "hello" }])
      assert.equal(body.stream, true)
      return Response.json({ model: "deepseek-v41-flash", choices: [{ message: { content: "OK" } }] })
    }
    for (const url of ["https://example.invalid/chat/completions", "http://dumate-svc.baidu.com/gateway/apis/v1/chat/completions", "https://dumate-svc.baidu.com/other", "https://user:fake@dumate-svc.baidu.com/gateway/apis/v1/chat/completions"]) {
      assert.equal((await loader.fetch(url, { method: "POST", body: "{}" })).status, 400)
    }
    assert.equal(calls, 0)
    for (const effort of ["none", "low", "high", "max"]) {
      const init = { method: "POST", headers: { "x-api-key": "FAKE-CLIENT-KEY" }, body: JSON.stringify({ model: "deepseek-v41-flash", label: effort, reasoning_effort: effort, thinking: { type: effort === "none" ? "enabled" : "disabled" }, enable_thinking: effort === "none", messages: [{ role: "user", content: "hello" }], stream: true }) }
      const url = "https://dumate-svc.baidu.com/gateway/apis/v1/chat/completions"
      for (const r of [await loader.fetch(new Request(url, init)), await loader.fetch(url, init)]) assert.equal(r.status, 200)
    }
    assert.equal(calls, 9)
  } finally { globalThis.fetch = originalFetch }
})
