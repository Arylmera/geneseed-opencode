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

/** The live-run checklist: try.mjs prints it, the README lists it, a test holds them equal. */
export const CHECKLIST = [
  "The Geneseed section is in the sidebar, with the gates.",
  "After you type any prompt, a Refused row appears (Sealed Secrets, `.ssh/id_rsa`).",
  "A Loop row `try-sidebar` is shown.",
  "Memory: a searched row appears after the second turn.",
  String.raw`In another PowerShell, ${"`"}Rename-Item${"`"} the throwaway ${"`"}.config\geneseed\loops.json${"`"} (in the home the script printed): within a few seconds the loop row goes and the session keeps running.`,
  String.raw`Quit, ${"`"}Rename-Item${"`"} the throwaway ${"`"}.config\opencode\AGENT.md${"`"}, start the screen again with the same command: the Geneseed panel is hidden.`,
]

/**
 * Is this file held by another process? A rename onto itself fails with EBUSY while OpenCode has its
 * database open (a plain open for writing succeeds: SQLite shares it), which is the same lock that
 * stops the delete.
 * @param {string} file
 * @param {{ existsSync: (f: string) => boolean, renameSync: (a: string, b: string) => void }} fs
 */
export function dbBusy(file, fs) {
  if (!fs.existsSync(file)) return false
  try {
    fs.renameSync(file, file)
    return false
  } catch (e) {
    return ["EBUSY", "EPERM", "EACCES"].includes(e?.code)
  }
}

/** The one command that removes `home`, whole: runs from any folder. */
export const cleanCommand = (script, home) => `node "${script}" --clean "${home}"`

/**
 * --clean's work, after the folder was checked to be a gs-try-* home. Nothing is deleted while
 * OpenCode still holds the database; any other failure is one line, no stack.
 * @returns {number} the exit code
 */
export function cleanHome(real, { isBusy, remove, log, error, script }) {
  if (isBusy(path.join(real, ".local", "share", "opencode", "opencode.db"))) {
    error("clean: OpenCode still has this home open. Quit it, then run this again:")
    error(`  ${cleanCommand(script, real)}`)
    return 1
  }
  try {
    remove(real)
  } catch (e) {
    error(`clean: could not remove ${e?.path ?? real} (${e?.code ?? "unknown"})`)
    return 1
  }
  log(`removed ${real}`)
  return 0
}

/**
 * Every command try.mjs prints for the owner to run. Each runs as written from any folder (R12):
 * absolute paths only.
 * @param {{ script: string, home: string, pid: number|string }} a
 */
export function printedCommands({ script, home, pid }) {
  const w = path.win32
  const off = (rel, suffix) => `Rename-Item -LiteralPath "${w.join(home, ...rel)}" -NewName ${rel.at(-1)}${suffix}`
  return [
    `powershell -NoProfile -ExecutionPolicy Bypass -File "${w.join(home, "try.ps1")}"`,
    `Stop-Process -Id ${pid}`,
    cleanCommand(script, home),
    off([".config", "geneseed", "loops.json"], ".off"),
    off([".config", "opencode", "AGENT.md"], ".off"),
  ]
}
