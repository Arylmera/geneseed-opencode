/** Carrier markers this reader knows (Test note is advisory and not listed). */
export const KNOWN_MARKERS = [
  "Secrets gate",
  "Done gate",
  "Deletion gate",
  "Ownership gate",
  "External gate",
  "Own-branch pass",
]

const SWITCHABLE = [
  ["secrets", "Secrets gate"],
  ["deletion", "Deletion gate"],
  ["ownership", "Ownership gate"],
  ["external", "External gate"],
]

const GUARD_OFF = ["off", "0", "false", "no"]

const isOff = (text, marker) => new RegExp(`^${marker}:[ \\t]*off[ \\t]*\\r?$`, "m").test(text)

/**
 * Done gate is not listed (OpenCode 2 turns are not judged); Test note is advisory and not listed.
 * @param {string|null} text carrier text, null when no carrier
 * @param {Record<string,string|undefined>} env
 * @returns {null | { on: string[], off: string[], strict: boolean, guard: "on"|"off"|"warn" }}
 */
export function readGates(text, env) {
  if (text == null) return null
  const on = []
  const off = []
  for (const [name, marker] of SWITCHABLE) (isOff(text, marker) ? off : on).push(name)
  // The guard's own parse (geneseed-guard.js MODE / OFF / WARN_ONLY): no trim, so " off" is armed.
  const mode = String(env.GENESEED_GUARD || "on").toLowerCase()
  return {
    on,
    off,
    strict: isOff(text, "Own-branch pass"),
    guard: GUARD_OFF.includes(mode) ? "off" : mode === "warn" ? "warn" : "on",
  }
}
