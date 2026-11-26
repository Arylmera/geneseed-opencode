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
 * May --clean remove this folder? Only a `gs-try-<id>` home, or its `.del-<id>` leftover, directly
 * under the temp dir (compared case-insensitively, as Windows does). `real` is the resolved path.
 * @param {string} real
 * @param {string} tmpDir
 */
export function isCleanTarget(real, tmpDir) {
  const p = path.win32
  const name = p.basename(real)
  if (!/^gs-try-[A-Za-z0-9]+(\.del-[A-Za-z0-9]+)?$/.test(name)) return false
  const norm = (x) => p.normalize(x).replace(/[\\/]+$/, "").toLowerCase()
  return norm(p.dirname(real)) === norm(tmpDir)
}

/** The one command that removes `home`, whole: runs from any folder. */
export const cleanCommand = (script, home) => `node "${script}" --clean "${home}"`

/** A leftover of an earlier --clean: the home renamed aside, `gs-try-<id>.del-<id>`. */
export const isLeftover = (dir) => /\.del-[A-Za-z0-9]+$/.test(path.basename(dir))

/**
 * --clean's work, after the folder was checked to be a gs-try-* home (or a leftover of one). The
 * home is first renamed to a sibling `<home>.del-<random>`: a process holding anything inside it
 * (OpenCode and its database, a shell whose folder is in it, the model) makes that rename fail
 * whole, so nothing is deleted and no half-deleted home is left. Then the renamed folder goes.
 * @param {string} real
 * @param {{ rename: (a: string, b: string) => void, remove: (d: string) => void, log: (s: string) => void,
 *   error: (s: string) => void, script: string, random?: () => string }} o
 * @returns {number} the exit code
 */
export function cleanHome(real, { rename, remove, log, error, script, random = () => Math.random().toString(36).slice(2, 10) }) {
  let target = real
  if (!isLeftover(real)) {
    target = `${real}.del-${random()}`
    try {
      rename(real, target)
    } catch (e) {
      if (["EBUSY", "EPERM", "EACCES"].includes(e?.code)) {
        error("clean: something still holds this home (OpenCode, or a shell whose folder is inside it). Close it, then run this again:")
        error(`  ${cleanCommand(script, real)}`)
      } else {
        error(`clean: could not rename ${real} (${e?.code ?? "unknown"})`)
      }
      return 1
    }
  }
  try {
    remove(target)
  } catch (e) {
    error(`clean: could not remove ${e?.path ?? target} (${e?.code ?? "unknown"})`)
    if (target !== real) error(`  The home itself is gone; ${target} is left. Remove it with:\n  ${cleanCommand(script, target)}`)
    else error(`  ${target} is left. Run this again:\n  ${cleanCommand(script, target)}`)
    return 1
  }
  log(`removed ${real}`)
  return 0
}

/**
 * Every command try.mjs prints for the owner to run. Each runs as written from any folder (R12):
 * absolute paths only. Windows-only on purpose: PowerShell commands and win32 paths, like try.ps1.
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
