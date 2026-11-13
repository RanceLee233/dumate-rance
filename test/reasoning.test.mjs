import test from "node:test"
import assert from "node:assert/strict"
import { normalizeReasoningBody } from "../reasoning.mjs"

test("mapping leaves other models, missing/unknown effort and malformed bodies untouched", () => {
  for (const body of [
    JSON.stringify({ model: "model-text", reasoning_effort: "none" }),
    JSON.stringify({ model: "deepseek-v41-flash", thinking: { type: "disabled" } }),
    JSON.stringify({ model: "deepseek-v41-flash", reasoning_effort: "future-level" }),
    "invalid JSON", "null", undefined,
  ]) assert.equal(normalizeReasoningBody(body), body)
})

test("encoded request bodies receive the same mapping without changing tools or messages", () => {
  const request = { model: "deepseek-v41-flash", reasoning_effort: "low", messages: [{ role: "user", content: "你好" }], tools: [{ type: "function", function: { name: "read" } }] }
  const encoded = new TextEncoder().encode(JSON.stringify(request))
  for (const body of [encoded, encoded.buffer]) {
    const mapped = JSON.parse(normalizeReasoningBody(body))
    assert.equal(mapped.reasoning_effort, "high")
    assert.deepEqual(mapped.messages, request.messages)
    assert.deepEqual(mapped.tools, request.tools)
  }
})
