import { readFileSync, statSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { randomUUID } from "node:crypto"
import { discoverConfig } from "./paths.mjs"

const validId = (id) => typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,159}$/.test(id)
const positive = (n) => Number.isSafeInteger(n) && n > 0
const modalities = (list) => Array.isArray(list) ? [...new Set(list.filter((x) => ["text", "image", "audio", "video", "pdf"].includes(x)))] : ["text"]

function readJson(path) {
  const st = statSync(path)
  if (!st.isFile() || st.size <= 0 || st.size > 2 * 1024 * 1024) throw new Error("Invalid model catalog size")
  return JSON.parse(readFileSync(path, "utf8"))
}

// Import metadata only. Never import endpoints, keys, headers, plugins or instructions.
export function importModels(config) {
  const source = config?.provider?.QianfanPersonalQuota?.models
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Missing DuMate model catalog")
  const models = Object.create(null)
  let excluded = 0
  for (const [key, value] of Object.entries(source)) {
    const id = value?.id ?? key
    if (!validId(key) || !validId(id) || !value || typeof value !== "object") continue
    if ((key.startsWith("model-") && key !== "model-text") || /(?:embedding|reranker|ocr|^llm-mock$|^dumate-image)/i.test(key)) {
      excluded++
      continue
    }
    if (key !== id && Object.hasOwn(source, id)) {
      excluded++
      continue
    }
    const context = value.limit?.context ?? value.limit?.input
    const output = value.limit?.output
    if (!positive(context) || !positive(output)) continue
    const input = modalities(value.modalities?.input)
    if (!input.includes("text")) continue
    models[key] = {
      id,
      name: key === id ? key : `${key} (API: ${id})`,
      limit: { context, output },
      tool_call: value.tool_call !== false,
      reasoning: id === "deepseek-v41-flash" || value.reasoning === true || value.capabilities?.reasoning === true,
      attachment: input.some((x) => x !== "text"),
      modalities: { input, output: ["text"] },
    }
  }
  if (!Object.keys(models).length) throw new Error("No chat models in DuMate catalog")
  return { schema: 1, models, excluded }
}

function fromSnapshot(snapshot) {
  if (snapshot?.schema !== 1) throw new Error("Unsupported catalog schema")
  return importModels({ provider: { QianfanPersonalQuota: { models: snapshot.models } } }).models
}

function saveSnapshot(path, catalog) {
  const temp = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temp, JSON.stringify(catalog, null, 2) + "\n", { mode: 0o600, flag: "wx" })
    renameSync(temp, path)
  } finally {
    try { unlinkSync(temp) } catch {}
  }
}

export function loadModels({ sourcePath, snapshotPath, stateDir, userDataDir, env = process.env } = {}) {
  const store = join(stateDir || join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "magpie"), "dumate-rance")
  snapshotPath ??= join(store, "models.snapshot.json")
  sourcePath ??= discoverConfig({ userDataDir, env })
  try {
    if (!sourcePath) throw new Error("Desktop model source unavailable")
    const catalog = importModels(readJson(sourcePath))
    try {
      if (JSON.stringify(readJson(snapshotPath)) === JSON.stringify(catalog)) return catalog.models
    } catch {}
    try {
      if (snapshotPath === join(store, "models.snapshot.json")) mkdirSync(store, { recursive: true, mode: 0o700 })
      saveSnapshot(snapshotPath, catalog)
    } catch {}
    return catalog.models
  } catch {
    try { return fromSnapshot(readJson(snapshotPath)) } catch {}
    try { return fromSnapshot(readJson(new URL("./models.default.json", import.meta.url))) } catch {}
    return {}
  }
}
