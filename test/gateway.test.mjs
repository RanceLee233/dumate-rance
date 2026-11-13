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
      assert.equal(JSON.parse(init.body).model, "deepseek-v41-flash")
      return Response.json({ model: "deepseek-v41-flash", choices: [{ message: { content: "OK" } }] })
    }
    for (const url of ["https://example.invalid/chat/completions", "http://dumate-svc.baidu.com/gateway/apis/v1/chat/completions", "https://dumate-svc.baidu.com/other", "https://user:fake@dumate-svc.baidu.com/gateway/apis/v1/chat/completions"]) {
      assert.equal((await loader.fetch(url, { method: "POST", body: "{}" })).status, 400)
    }
    assert.equal(calls, 0)
    const r = await loader.fetch(new Request("https://dumate-svc.baidu.com/gateway/apis/v1/chat/completions", { method: "POST", headers: { "x-api-key": "FAKE-CLIENT-KEY" }, body: JSON.stringify({ model: "deepseek-v41-flash" }) }))
    assert.equal(r.status, 200)
    assert.equal(calls, 2)
  } finally { globalThis.fetch = originalFetch }
})
