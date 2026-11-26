import path from "node:path"

/** Pick path flavour from the path itself: a drive letter or a UNC prefix means win32. */
function flavor(p) {
  return /^(?:[A-Za-z]:|\\\\)/.test(String(p)) ? path.win32 : path.posix
}

/**
 * @param {Record<string,string|undefined>} env
 * @param {string} home
 * @returns {string} OpenCode config dir
 */
export function cfgDir(env, home) {
  if (env.OPENCODE_CONFIG_DIR) return env.OPENCODE_CONFIG_DIR
  if (env.XDG_CONFIG_HOME) return flavor(env.XDG_CONFIG_HOME).join(env.XDG_CONFIG_HOME, "opencode")
  return flavor(home).join(home, ".config", "opencode")
}

/**
 * @param {Record<string,string|undefined>} env
 * @param {string} home
 * @returns {string} Geneseed machine dir
 */
export function machineDir(env, home) {
  if (env.XDG_CONFIG_HOME) return flavor(env.XDG_CONFIG_HOME).join(env.XDG_CONFIG_HOME, "geneseed")
  return flavor(home).join(home, ".config", "geneseed")
}

/**
 * Same folder? Case-insensitive on win32 only.
 * @param {string} a
 * @param {string} b
 * @param {string} platform
 * @returns {boolean}
 */
export function sameRoot(a, b, platform) {
  const p = platform === "win32" ? path.win32 : path.posix
  const norm = (x) => {
    const n = p.normalize(String(x)).replace(/[\/]+$/, "")
    return platform === "win32" ? n.toLowerCase() : n
  }
  return norm(a) === norm(b)
}

/**
 * Nearest install: walk from dir up, stopping at the first folder holding .git.
 * @param {string} dir
 * @param {string} cfg
 * @param {(p: string) => boolean} exists
 * @returns {{ kind: "project"|"global", root: string }}
 */
export function findInstall(dir, cfg, exists) {
  const p = flavor(dir)
  let cur = dir
  for (;;) {
    if (exists(p.join(cur, ".opencode", ".geneseed-manifest.json"))) return { kind: "project", root: cur }
    if (exists(p.join(cur, ".git"))) break
    const up = p.dirname(cur)
    if (up === cur) break
    cur = up
  }
  return { kind: "global", root: cfg }
}

/**
 * Carrier candidates, in the order of CARRIER_DIRS in geneseed-guard.js: GENESEED_HARNESS, then the
 * plugin dir's parent (cfg for a global install, root/.opencode for a project one), then its grandparent
 * (the parent of cfg, or root).
 * @param {Record<string,string|undefined>} env
 * @param {{ kind: "project"|"global", root: string }} install
 * @param {string} cfg
 * @returns {string[]}
 */
export function carrierPaths(env, install, cfg) {
  const out = []
  if (env.GENESEED_HARNESS) out.push(flavor(env.GENESEED_HARNESS).join(env.GENESEED_HARNESS, "AGENT.md"))
  if (install.kind === "global") {
    const p = flavor(cfg)
    out.push(p.join(cfg, "AGENT.md"), p.join(p.dirname(cfg), "AGENT.md"))
  } else {
    const p = flavor(install.root)
    out.push(p.join(install.root, ".opencode", "AGENT.md"), p.join(install.root, "AGENT.md"))
  }
  return out
}
