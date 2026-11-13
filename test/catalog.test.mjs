import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { desktopUserDataDir, discoverConfig } from "../paths.mjs"
import { loadModels } from "../models.mjs"

const model = { id: "deepseek-v41-flash", limit: { input: 1000000, output: 384000 }, modalities: { input: ["text", "image"] } }
const fixture = { provider: { QianfanPersonalQuota: {
  options: { apiKey: "FAKE-KEY-MUST-NOT-BE-SAVED", baseURL: "http://127.0.0.1:1/v1" },
  models: { "deepseek-v41-flash": model, "legacy-alias": { ...model, id: "deepseek-v41-flash" }, "model-routing": model, "qwen3-embedding-4b": model },
} } }

test("platform directories and explicit override", () => {
  assert.equal(desktopUserDataDir("darwin", {}, "/test user"), join("/test user", "Library", "Application Support", "qianfan-desktop-app"))
  assert.equal(desktopUserDataDir("win32", { APPDATA: "/roaming" }, "/test"), join("/roaming", "qianfan-desktop-app"))
  assert.equal(desktopUserDataDir("win32", {}, "/test"), join("/test", "AppData", "Roaming", "qianfan-desktop-app"))
  assert.equal(desktopUserDataDir("linux", { XDG_CONFIG_HOME: "/xdg" }, "/test"), join("/xdg", "qianfan-desktop-app"))
  assert.equal(desktopUserDataDir("linux", {}, "/test"), join("/test", ".config", "qianfan-desktop-app"))
  assert.equal(desktopUserDataDir("darwin", { DUMATE_USER_DATA_DIR: " /override " }, "/test"), "/override")
})

test("active account wins; ambiguous accounts are not guessed", () => {
  const dir = mkdtempSync(join(tmpdir(), "dumate-discovery-"))
  try {
    const root = join(dir, "qianfan_desk_xdg")
    for (const name of ["account-one", "account-two", "global"]) mkdirSync(join(root, name), { recursive: true })
    assert.equal(discoverConfig({ userDataDir: dir, env: {} }), undefined)
    writeFileSync(join(dir, "auth.json"), JSON.stringify({ activeProfileId: "p2", accountProfiles: [{ profileId: "p1", bceAccountId: "account-one" }, { profileId: "p2", bceAccountId: "account-two" }] }))
    assert.equal(discoverConfig({ userDataDir: dir, env: {} }), join(root, "account-two/config/opencode/opencode.json"))
    assert.equal(discoverConfig({ userDataDir: dir, env: { DUMATE_OPENCODE_CONFIG: "/custom.json" } }), "/custom.json")
    assert.equal(discoverConfig({ userDataDir: dir, env: { DUMATE_OPENCODE_CONFIG: "relative.json" } }), undefined)
    writeFileSync(join(dir, "auth.json"), JSON.stringify({ activeProfileId: "p", accountProfiles: [{ profileId: "p", bceAccountId: "../../escape" }] }))
    assert.equal(discoverConfig({ userDataDir: dir, env: {} }), undefined)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("imports limits and actual IDs; survives source deletion without persisting secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "dumate-import-"))
  try {
    const sourcePath = join(dir, "opencode.json")
    const snapshotPath = join(dir, "snapshot.json")
    writeFileSync(sourcePath, JSON.stringify(fixture))
    const imported = loadModels({ sourcePath, snapshotPath })
    assert.deepEqual(Object.keys(imported), ["deepseek-v41-flash"])
    assert.equal(imported["deepseek-v41-flash"].limit.context, 1000000)
    assert.equal(imported["deepseek-v41-flash"].limit.output, 384000)
    assert.equal(imported["deepseek-v41-flash"].attachment, true)
    assert.equal(imported["deepseek-v41-flash"].reasoning, true)
    const saved = readFileSync(snapshotPath, "utf8")
    assert.ok(!saved.includes("FAKE-KEY") && !saved.includes("127.0.0.1") && !saved.includes(dir))
    unlinkSync(sourcePath)
    assert.deepEqual(loadModels({ sourcePath, snapshotPath }), imported)
    writeFileSync(sourcePath, "invalid JSON")
    assert.deepEqual(loadModels({ sourcePath, snapshotPath }), imported)
    assert.equal(readFileSync(snapshotPath, "utf8"), saved)
    writeFileSync(snapshotPath, "invalid JSON")
    assert.equal(loadModels({ sourcePath, snapshotPath })["deepseek-v41-flash"].limit.context, 1000000)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
