import path from "node:path"

const DASH = " \u2014 "
const INDEXES = new Set(["memory.md", "readme.md"])
const FOLDERS = new Set(["topics", "archive", "agents"])

const isObj = (v) => v !== null && typeof v === "object"
const isWin = (p) => /^(?:[A-Za-z]:|\\)/.test(String(p))
const flavor = (p) => (isWin(p) ? path.win32 : path.posix)

/**
 * Memory folders in the order of resolveMemoryDir (geneseed-learn.js). The caller tests which exists.
 * @param {Record<string,string|undefined>} env
 * @param {{ kind: "project"|"global", root: string }} install
 * @param {string} cfg
 * @param {string} machine
 * @param {string} cwd
 * @param {boolean} readsTier the install reads the shared machine tier
 * @returns {string[]}
 */
export function storeCandidates(env, install, cfg, machine, cwd, readsTier) {
  const out = []
  if (env.GENESEED_MEMORY) out.push(env.GENESEED_MEMORY)
  if (env.GENESEED_HARNESS) out.push(flavor(env.GENESEED_HARNESS).join(env.GENESEED_HARNESS, "memory"))
  if (readsTier) out.push(flavor(machine).join(machine, "memory"))
  const dir = install.kind === "global" ? cfg : flavor(install.root).join(install.root, ".opencode")
  out.push(flavor(dir).join(dir, "memory"))
  const p = flavor(cwd)
  out.push(p.join(cwd, "memory"), p.join(cwd, "Harness", "memory"))
  return out
}

// "/"-separated, no trailing slash, lower-cased for a Windows path.
function norm(p) {
  const s = String(p).replace(/\\/g, "/").replace(/\/+$/, "")
  return isWin(p) ? s.toLowerCase() : s
}

/** Store-relative path -> slug when it names a fact file, else null. */
function slugOf(rel) {
  const parts = rel.split("/").filter(Boolean)
  const base = parts[parts.length - 1]
  if (!base || !/\.md$/i.test(base) || INDEXES.has(base.toLowerCase())) return null
  if (parts.slice(0, -1).some((d) => FOLDERS.has(d.toLowerCase()))) return null
  return base.slice(0, -3)
}

const atOf = (part) => (isObj(part.time) && typeof part.time.completed === "number" ? part.time.completed : null)

function textOf(state) {
  if (!Array.isArray(state.content)) return ""
  return state.content
    .filter((c) => isObj(c) && c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n")
}

function countOf(text) {
  const lines = text.split(/\r?\n/)
  const head = lines.findIndex((l) => l.startsWith("Facts in "))
  if (head < 0) return 0
  return lines.slice(head + 1).filter((l) => l.includes(DASH)).length
}

function namedDir(text) {
  const m = /^(?:Facts in (.+?) \(read |No fact in (.+?) matches ")/m.exec(text)
  return m ? m[1] || m[2] : null
}

/**
 * Memory the session used, in message order: searches and reads of fact files.
 * A search result names its folder; the last one seen is the store for the reads.
 * @param {unknown} messages OpenCode 2 SessionMessageInfo[]
 * @param {string|null} store
 * @returns {{ kind: "searched"|"read", label: string, count?: number, at: number|null }[]}
 */
export function readMemoryUse(messages, store) {
  const calls = []
  if (!Array.isArray(messages)) return []
  let root = typeof store === "string" && store ? store : null
  for (const message of messages) {
    if (!isObj(message) || !Array.isArray(message.content)) continue
    for (const part of message.content) {
      if (!isObj(part) || part.type !== "tool" || !isObj(part.state) || part.state.status !== "completed") continue
      const input = isObj(part.state.input) ? part.state.input : {}
      if (part.name === "memory_search") {
        const text = textOf(part.state)
        const dir = namedDir(text)
        if (dir) root = dir
        calls.push({ kind: "searched", label: String(input.query ?? ""), count: countOf(text), at: atOf(part) })
      } else if (part.name === "read") {
        const file = typeof input.filePath === "string" ? input.filePath : input.path
        if (typeof file === "string" && file) calls.push({ kind: "read", file, at: atOf(part) })
      }
    }
  }
  const rows = []
  for (const c of calls) {
    if (c.kind === "searched") {
      rows.push(c)
      continue
    }
    if (!root) continue
    const base = norm(root) + "/"
    const f = norm(c.file)
    if (!f.startsWith(base)) continue
    const slug = slugOf(c.file.replace(/\\/g, "/").slice(base.length))
    if (slug) rows.push({ kind: "read", label: slug, at: c.at })
  }
  return rows
}

/**
 * Fact files created or changed since sinceMs, newest first.
 * @param {{ name: string, mtimeMs: number }[]} entries store-relative names
 * @param {number} sinceMs
 * @returns {{ kind: "learned", label: string, at: number }[]}
 */
export function learned(entries, sinceMs) {
  if (!Array.isArray(entries)) return []
  const rows = []
  for (const e of entries) {
    if (!isObj(e) || typeof e.name !== "string" || typeof e.mtimeMs !== "number") continue
    if (e.mtimeMs < sinceMs) continue
    const slug = slugOf(e.name.replace(/\\/g, "/"))
    if (slug) rows.push({ kind: "learned", label: slug, at: e.mtimeMs })
  }
  return rows.sort((a, b) => b.at - a.at)
}
