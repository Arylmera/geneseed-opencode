const MARKER = 'No tool named "BLOCKED, not a missing tool:'
// Only these input keys are ever read: a refused write's content can be the secret the guard stopped.
const DETAIL_KEYS = ["filePath", "path", "command"]

const isObj = (v) => v !== null && typeof v === "object"

function ruleOf(message) {
  for (const line of message.split(/\r?\n/)) {
    if (!line.startsWith("It was refused because")) continue
    const m = /\(([^()]*)\)\s*$/.exec(line)
    return m && m[1].trim() ? m[1].trim() : "refused"
  }
  return "refused"
}

function detailOf(input) {
  if (!isObj(input)) return ""
  for (const k of DETAIL_KEYS) if (typeof input[k] === "string" && input[k] !== "") return input[k]
  return ""
}

/**
 * Tool calls Geneseed's guard refused, newest first.
 * @param {unknown} messages OpenCode 2 SessionMessageInfo[]
 * @returns {{ id: string, rule: string, detail: string }[]}
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
      rows.push({ id: String(part.id ?? ""), rule: ruleOf(text), detail: detailOf(state.input) })
    }
  }
  return rows.reverse()
}
