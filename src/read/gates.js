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

const isOff = (text, marker) => new RegExp(`^${marker}:[ \\t]*off[ \\t]*\\r?$`, "m").test(text)

/**
 * Done gate is always n/a (OpenCode 2 turns are not judged); Test note is advisory and not listed.
 * @param {string|null} text carrier text, null when no carrier
 * @param {Record<string,string|undefined>} env
 * @returns {null | { on: string[], off: string[], na: string[], strict: boolean, guard: "on"|"off"|"warn" }}
 */
export function readGates(text, env) {
  if (text == null) return null
  const on = []
  const off = []
  for (const [name, marker] of SWITCHABLE) (isOff(text, marker) ? off : on).push(name)
  const g = String(env.GENESEED_GUARD ?? "").trim().toLowerCase()
  return {
    on,
    off,
    na: ["done"],
    strict: isOff(text, "Own-branch pass"),
    guard: g === "off" || g === "warn" ? g : "on",
  }
}
