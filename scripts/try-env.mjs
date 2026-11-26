// The environment a throwaway OpenCode run gets: an allowlist, not a scrub. Anything not named
// here (OPENCODE_CONFIG, OPENCODE_AUTH_CONTENT, proxies, credentials, CLAUDE_CONFIG_DIR, ...) is gone.
import { createRequire } from "node:module"
import path from "node:path"
import { cfgDir, machineDir } from "../src/paths.js"

// What Windows and Node need to start, and what the screen needs to draw. Compared case-insensitively.
export const KEEP = [
  "PATH", "PATHEXT", "SystemRoot", "SystemDrive", "windir", "COMSPEC", "TEMP", "TMP",
  "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS",
  "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "ProgramData", "ALLUSERSPROFILE",
  "TERM", "COLORTERM", "WT_SESSION", "WT_PROFILE_ID", "TERM_PROGRAM", "TERM_PROGRAM_VERSION",
]

/** The throwaway locations, all inside `home`. */
export function overridesFor(home) {
  return {
    HOME: home,
    USERPROFILE: home,
    OPENCODE_CONFIG_DIR: path.join(home, ".config", "opencode"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_STATE_HOME: path.join(home, ".local", "state"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"),
    GENESEED_HOME: path.join(home, ".geneseed"),
    GENESEED_NOTIFY: "off",
    NO_PROXY: "127.0.0.1,localhost",
  }
}

/**
 * Only KEEP from `parent`, then the overrides, then `extra`.
 * @param {Record<string, string|undefined>} parent
 * @param {Record<string, string>} overrides
 * @param {Record<string, string>} [extra]
 */
export function buildEnv(parent, overrides, extra = {}) {
  const keep = new Set(KEEP.map((k) => k.toLowerCase()))
  const out = {}
  for (const [k, v] of Object.entries(parent)) if (keep.has(k.toLowerCase()) && v !== undefined) out[k] = v
  return { ...out, ...overrides, ...extra }
}

/** The modules src/tui.tsx imports that OpenCode does not hand it: they resolve from the repo. */
export const RUNTIME_MODULES = ["solid-js", "@opentui/solid"]

/**
 * The names in `names` that do not resolve from `repo` (createRequire on its package.json). A package
 * whose export map hides its root from require is installed, so it counts as found.
 * @param {string} repo
 * @param {string[]} [names]
 * @returns {string[]}
 */
export function missingModules(repo, names = RUNTIME_MODULES) {
  const req = createRequire(path.join(repo, "package.json"))
  return names.filter((n) => {
    try {
      req.resolve(n)
      return false
    } catch (e) {
      return e?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED"
    }
  })
}

/**
 * What the scripted model asks for after one prompt in the project: a write the secrets gate
 * refuses, a memory search, then a write that is allowed.
 * @param {string} project
 */
export function tryTurns(project) {
  return [
    { tool: "write", path: path.join(project, ".ssh", ["id", "rsa"].join("_")), content: "not a key" },
    { tool: "memory_search", args: { query: "geneseed" } },
    { tool: "write", path: path.join(project, "allowed.txt"), content: "ok" },
  ]
}

/**
 * The owner's real folders try.mjs proves untouched: the OpenCode config dir and the Geneseed
 * machine dir, as `env` and `home` resolve them.
 * @param {Record<string, string|undefined>} env
 * @param {string} home
 */
export function realDirs(env, home) {
  return [cfgDir(env, home), machineDir(env, home)]
}
