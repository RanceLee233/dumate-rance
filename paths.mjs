import { readFileSync, readdirSync } from "node:fs"
import { join, isAbsolute } from "node:path"
import { homedir } from "node:os"

export function desktopUserDataDir(platform = process.platform, env = process.env, home = homedir()) {
  const override = String(env.DUMATE_USER_DATA_DIR ?? "").trim()
  if (override) return override
  if (platform === "darwin") return join(home, "Library", "Application Support", "qianfan-desktop-app")
  if (platform === "win32") return join(env.APPDATA || join(home, "AppData", "Roaming"), "qianfan-desktop-app")
  return join(env.XDG_CONFIG_HOME || join(home, ".config"), "qianfan-desktop-app")
}

export function discoverConfig({ userDataDir = desktopUserDataDir(), env = process.env } = {}) {
  const override = String(env.DUMATE_OPENCODE_CONFIG ?? "").trim()
  if (override) return isAbsolute(override) ? override : undefined
  const root = join(userDataDir, "qianfan_desk_xdg")
  let account
  try {
    const auth = JSON.parse(readFileSync(join(userDataDir, "auth.json"), "utf8"))
    const profile = auth.accountProfiles?.find((p) => p.profileId === auth.activeProfileId)
    account = profile?.bceAccountId
  } catch {}
  if (account) {
    if (typeof account !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(account)) return undefined
    return join(root, account, "config", "opencode", "opencode.json")
  }
  // Without an active profile, only an unambiguous single-account install is safe.
  try {
    const dirs = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "global" && /^[a-zA-Z0-9_-]{1,160}$/.test(d.name))
    if (dirs.length === 1) return join(root, dirs[0].name, "config", "opencode", "opencode.json")
  } catch {}
  return undefined
}
