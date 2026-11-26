// The environment a throwaway OpenCode run gets: an allowlist, not a scrub. Anything not named
// here (OPENCODE_CONFIG, OPENCODE_AUTH_CONTENT, proxies, credentials, CLAUDE_CONFIG_DIR, ...) is gone.
import path from "node:path"

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
