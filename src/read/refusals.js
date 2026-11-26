export const MARKER = 'No tool named "BLOCKED, not a missing tool:'
// The guard's gateText sentence that ends in the rule's name: `It was refused because <why>. (<rule>)`.
export const REFUSED_BECAUSE = "It was refused because"
// Only these input keys are ever read: a refused write's content can be the secret the guard stopped.
const DETAIL_KEYS = ["filePath", "path", "command"]

const isObj = (v) => v !== null && typeof v === "object"

function ruleOf(message) {
  for (const line of message.split(/\r?\n/)) {
    if (!line.startsWith(REFUSED_BECAUSE)) continue
    const m = /\(([^()]*)\)\s*$/.exec(line)
    return m && m[1].trim() ? m[1].trim() : "refused"
  }
  return "refused"
}

// A command as one line of text: a run of whitespace (newlines, tabs, CR) is one space, every other
// control character (ESC included) is dropped, the ends trimmed. The model wrote it; the row is ours.
const oneLine = (t) => t.replace(/(?!\s)\p{Cc}/gu, "").replace(/\s+/g, " ").trim()

function detailOf(input) {
  if (!isObj(input)) return { detail: "", isPath: false }
  for (const k of DETAIL_KEYS) {
    if (typeof input[k] === "string" && input[k] !== "") return k === "command" ? { detail: oneLine(input[k]), isPath: false } : { detail: input[k], isPath: true }
  }
  return { detail: "", isPath: false }
}

/**
 * Tool calls Geneseed's guard refused, newest first.
 * @param {unknown} messages OpenCode 2 SessionMessageInfo[]
 * @returns {{ id: string, rule: string, detail: string, isPath: boolean }[]}
 */
export function readRefusals(messages) {
  const rows = []
  if (!Array.isArray(messages)) return rows
  for (const message of messages) {
    if (!isObj(message) || !Array.isArray(message.content)) continue
    for (const part of message.content) {
      if (!isObj(part) || part.type !== "tool" || !isObj(part.state)) continue
      const { state } = part
      if (state.status !== "error" || !isObj(state.error)) continue
      const text = String(state.error.message ?? "").trimStart()
      if (!text.startsWith(MARKER)) continue
      rows.push({ id: String(part.id ?? ""), rule: ruleOf(text), ...detailOf(state.input) })
    }
  }
  return rows.reverse()
}
