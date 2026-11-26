import { sameRoot } from "../paths.js"

const isObj = (v) => v !== null && typeof v === "object"

/**
 * The delimiters Geneseed writes around the state JSON (js/loop/state.mjs, js/factory/state.mjs).
 * A contract test compares them with a Geneseed checkout.
 */
export const MARKERS = {
  "loop-state": { begin: "<!-- loop-state:begin -->", end: "<!-- loop-state:end -->" },
  "factory-state": { begin: "<!-- factory-state:begin -->", end: "<!-- factory-state:end -->" },
}

/**
 * Registry rows whose root is one of roots. Rows without a string root are ignored, as loadRows does.
 * @param {unknown} registryText loops.json or factories.json
 * @param {"loops"|"factories"} key
 * @param {string[]} roots the dir and its git root
 * @param {string} platform process.platform
 * @returns {{ root: string }[]}
 */
export function rowsFor(registryText, key, roots, platform) {
  let data
  try {
    data = JSON.parse(String(registryText))
  } catch {
    return []
  }
  if (!isObj(data) || !Array.isArray(data[key])) return []
  return data[key].filter(
    (r) => isObj(r) && typeof r.root === "string" && roots.some((root) => sameRoot(r.root, root, platform)),
  )
}

/**
 * The state JSON of a LOOP.md or FACTORY.md: parseLoopFile's rule (CRLF to LF, first begin, last end,
 * strip the fence), with null for anything that does not parse.
 * @param {unknown} text
 * @param {"loop-state"|"factory-state"} tag
 * @returns {object|null}
 */
export function readState(text, tag) {
  const m = MARKERS[tag]
  if (!m) return null
  const t = String(text ?? "").replace(/\r\n/g, "\n")
  const a = t.indexOf(m.begin)
  const b = t.lastIndexOf(m.end)
  if (a < 0 || b < a) return null
  const inner = t.slice(a + m.begin.length, b).replace(/^\s*```json\s*/, "").replace(/\s*```\s*$/, "")
  try {
    const state = JSON.parse(inner)
    return isObj(state) && !Array.isArray(state) ? state : null
  } catch {
    return null
  }
}

/**
 * One sidebar line for a run; null when it is done or has no title and step.
 * @param {"loop"|"factory"} kind
 * @param {unknown} state
 * @param {string} [sep] between the node and the iteration: the glyph set's `sep`
 * @returns {{ name: string, step: string, note: string }|null}
 */
export function runLine(kind, state, sep = "·") {
  if (!isObj(state) || typeof state.title !== "string") return null
  const at = kind === "loop" ? state.node : state.stage
  if (typeof at !== "string") return null
  if (state.status === "done") return null
  let step = at
  if (kind === "loop" && typeof state.iteration === "number") step = `${at} ${sep} #${state.iteration}`
  let note = ""
  if (state.status === "awaiting") note = "waits for you"
  else if (state.status === "stopped") note = typeof state.reason === "string" ? state.reason : ""
  return { name: state.title, step, note }
}
