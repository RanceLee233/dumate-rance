// Keep the shared UI levels while sending DuMate's supported controls.
export function normalizeReasoningBody(body) {
  let text
  if (typeof body === "string") text = body
  else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) text = new TextDecoder().decode(body)
  else return body
  let request
  try { request = JSON.parse(text) } catch { return body }
  if (request?.model !== "deepseek-v41-flash" || !["none", "low", "high", "max"].includes(request.reasoning_effort)) return body

  const enabled = request.reasoning_effort !== "none"
  if (!enabled) delete request.reasoning_effort
  else if (request.reasoning_effort === "low") request.reasoning_effort = "high"
  // Explicit effort wins over conflicting switches left by an SDK or variant.
  request.thinking = { ...request.thinking, type: enabled ? "enabled" : "disabled" }
  request.enable_thinking = enabled
  return JSON.stringify(request)
}
