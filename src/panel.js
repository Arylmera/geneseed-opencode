// The panel as plain lines: snapshot of polled files + session messages in, { text, role }[] out.
// Pure: no OpenCode and no fs import; tui.tsx does the reading and the drawing.
import { flavor } from "./paths.js"
import { readGates } from "./read/gates.js"
import { readRefusals } from "./read/refusals.js"
import { learned, readMemoryUse, storeNamed } from "./read/memory.js"
import { readState, rowsFor, runLine } from "./read/runs.js"

export const WIDTH = 30
export const SHOW = 3

/**
 * @typedef {{ text: string, role: "text"|"muted"|"warning" }} Line
 * @typedef {{ carriers: string[], stores: string[], loopsReg: string, factReg: string, roots: string[], platform: string }} Watch
 */

const len = (s) => Array.from(s).length

/** At most `width` characters, the last an ellipsis; never splits a character. */
export function cut(s, width = WIDTH) {
  const c = Array.from(String(s))
  return c.length <= width ? String(s) : c.slice(0, width - 1).join("") + "…"
}

/**
 * A row that lists names is never cut: wrap at ", " to `width`, continuation lines aligned under
 * the first name. A name longer than the width stays whole on its own line.
 * @param {string} head
 * @param {string[]} names
 * @returns {string[]}
 */
export function wrapList(head, names, width = WIDTH) {
  const pad = " ".repeat(len(head))
  const words = names.map((n, i) => (i < names.length - 1 ? `${n},` : n))
  const out = []
  let line = head + (words[0] ?? "")
  for (const w of words.slice(1)) {
    const next = `${line} ${w}`
    if (len(next) <= width) line = next
    else {
      out.push(line)
      line = pad + w
    }
  }
  out.push(line)
  return out
}

/** Newest SHOW rows of a newest-first list, cut, then "+N". */
function capped(rows, indent) {
  return cappedEntries(rows.map((t) => [indent + t]), indent)
}

/** Newest SHOW entries of a newest-first list, each one or more lines (each cut), then "+N". */
function cappedEntries(entries, indent) {
  /** @type {Line[]} */
  const out = entries.slice(0, SHOW).flatMap((lines) => lines.map((t) => ({ text: cut(t), role: "muted" })))
  if (entries.length > SHOW) out.push({ text: `${indent}+${entries.length - SHOW}`, role: "muted" })
  return out
}

/**
 * Does the install read the shared machine memory tier? A global one does; a project one when its
 * `.opencode/.geneseed-emit` names a -global emit.
 * @param {{ kind: "project"|"global" }} install
 * @param {string|null} emitText
 */
export function readsTierOf(install, emitText) {
  return install.kind === "global" || String(emitText ?? "").trim().endsWith("-global")
}

const startOf = (r) => {
  const t = Date.parse(typeof r.initAt === "string" ? r.initAt : r.started)
  return Number.isNaN(t) ? -Infinity : t
}

/**
 * `<root>/<file>` for the registry rows on these roots, newest first: by initAt or started when the
 * row has one; rows without either fall back to registry order, where a later row was added later.
 * @returns {string[]}
 */
export function runPaths(registryText, key, file, roots, platform) {
  return rowsFor(registryText, key, roots, platform)
    .map((r, i) => ({ r, i, t: startOf(r) }))
    .sort((a, b) => b.t - a.t || b.i - a.i)
    .map(({ r }) => flavor(r.root).join(r.root, file))
}

const text = (v) => (typeof v === "string" ? v : "")

/**
 * The memory store: the one a search result names (the fact observed) wins over the first
 * candidate that listed as a folder.
 * @param {Watch} w
 * @returns {string|null}
 */
export function storeOf(w, snap, messages) {
  return storeNamed(messages) ?? w.stores.find((s) => Array.isArray(snap[s])) ?? null
}

/**
 * Every path to poll for this snapshot and these messages.
 * @param {Watch} w
 * @returns {string[]}
 */
export function watchList(w, snap, messages) {
  const named = storeNamed(messages)
  return [
    ...w.carriers,
    ...w.stores,
    ...(named && !w.stores.includes(named) ? [named] : []),
    w.loopsReg,
    w.factReg,
    ...runPaths(text(snap[w.loopsReg]), "loops", "LOOP.md", w.roots, w.platform),
    ...runPaths(text(snap[w.factReg]), "factories", "FACTORY.md", w.roots, w.platform),
  ]
}

const hhmm = (ms) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/**
 * The panel, in spec order; empty sections absent; null when there is no carrier.
 * @param {Watch} w
 * @param {Record<string, unknown>} snap
 * @param {unknown} messages
 * @param {{ env: Record<string, string|undefined>, sinceMs: number, time?: (ms: number) => string }} o
 * @returns {Line[]|null}
 */
export function panelLines(w, snap, messages, { env, sinceMs, time = hhmm }) {
  const carrier = w.carriers.map((c) => snap[c]).find((v) => typeof v === "string")
  const gates = readGates(carrier ?? null, env)
  if (!gates) return null
  /** @type {Line[]} */
  const out = [
    { text: "Geneseed", role: "text" },
    { text: " Gates", role: "text" },
  ]
  const list = (head, names) => wrapList(head, names).forEach((t) => out.push({ text: t, role: "muted" }))
  if (gates.guard === "off") out.push({ text: "  guard off", role: "warning" })
  else if (gates.guard === "warn") out.push({ text: "  warn only", role: "warning" })
  else {
    if (gates.on.length) list("  on   ", gates.on)
    if (gates.off.length) list("  off  ", gates.off)
    list("  n/a  ", gates.na.map((n) => `${n} (OpenCode 2)`))
    if (gates.strict) out.push({ text: "  strict consent", role: "muted" })
  }

  const refused = readRefusals(messages)
  if (refused.length) {
    out.push({ text: ` Refused  ${refused.length}`, role: "warning" })
    // One line when it fits; else the rule, then the detail below it, so neither hides the other.
    const entry = (r) => {
      const one = `  ${r.rule}${r.detail ? `  ${r.detail}` : ""}`
      return len(one) <= WIDTH || !r.detail ? [one] : [`  ${r.rule}`, `    ${r.detail}`]
    }
    out.push(...cappedEntries(refused.map(entry), "  "))
  }

  const store = storeOf(w, snap, messages)
  const used = readMemoryUse(messages, store).reverse()
  const listing = store ? snap[store] : null
  const fresh = Array.isArray(listing) ? learned(listing, sinceMs) : []
  if (used.length || fresh.length) {
    out.push({ text: " Memory", role: "text" })
    const row = (u) => (u.kind === "searched" ? `searched  "${u.label}"  ${u.count ?? 0}` : `read      ${u.label}`)
    out.push(...capped(used.map(row), "  "))
    out.push(...capped(fresh.map((f) => `learned   ${f.label}  ${time(f.at)}`), "  "))
  }

  // Two lines a run: the title, then the step and note, so a long title never hides "waits for you".
  const runs = (kind, reg, key, file, tag, label) => {
    const entries = runPaths(text(snap[reg]), key, file, w.roots, w.platform)
      .map((f) => runLine(kind, readState(snap[f], tag)))
      .filter((l) => l !== null)
      .map((l) => [` ${label}  ${l.name}`, `   ${l.step}${l.note ? ` · ${l.note}` : ""}`])
    out.push(...cappedEntries(entries, " "))
  }
  runs("loop", w.loopsReg, "loops", "LOOP.md", "loop-state", "Loop")
  runs("factory", w.factReg, "factories", "FACTORY.md", "factory-state", "Factory")
  return out
}
