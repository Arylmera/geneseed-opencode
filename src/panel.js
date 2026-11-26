// The panel as rows: snapshot of polled files + session messages in, Row[] out, each row exactly
// `width` display columns (src/width.js: CJK and emoji count 2). Pure: no OpenCode and no fs
// import; tui.tsx does the reading and draws the rows as they are.
import { flavor } from "./paths.js"
import { readGates } from "./read/gates.js"
import { readRefusals } from "./read/refusals.js"
import { learned, readMemoryUse, storeNamed } from "./read/memory.js"
import { readState, rowsFor, runLine } from "./read/runs.js"
import { strip } from "./clean.js"
import { clusterCols, cols, graphemes } from "./width.js"

/** The inner width when the TUI cannot measure the drawn box. */
export const WIDTH = 32
/** Below this the panel folds to one line a section. */
export const FOLD = 28
/** Above this the panel goes wide: gates on up to 4 columns, items on one line. */
export const WIDE = 40
export const SHOW = 3

/**
 * A segment of a row: its text, the theme role that colours it, bold, and inverse (drawn on a
 * background of its role's colour). A row is an array of segments whose texts add up to exactly the
 * panel width, so the TUI draws them side by side and does no arithmetic.
 * @typedef {"text"|"muted"|"success"|"warning"|"error"|"accent"} Role
 * @typedef {{ text: string, role: Role, bold?: boolean, inverse?: boolean }} Seg
 * @typedef {Seg[]} Row
 * @typedef {{ carriers: string[], stores: string[], loopsReg: string, factReg: string, roots: string[], platform: string }} Watch
 * @typedef {Record<string, string>} Glyphs
 */

/**
 * Every glyph the panel draws: [name, Unicode, ASCII], each one column wide. The ASCII set (printable
 * ASCII only) stands in when the plugin option `ascii` is true or GENESEED_SIDEBAR_ASCII=1.
 */
export const GLYPH_TABLE = [
  ["on", "●", "*"],
  ["off", "○", "o"],
  ["ok", "✓", "+"],
  ["na", "–", "-"],
  ["alert", "▲", "!"],
  ["stop", "■", "#"],
  ["warn", "◐", "~"],
  ["restart", "↺", "R"],
  ["loop", "↻", "L"],
  ["factory", "⚙", "F"],
  ["memory", "◆", "M"],
  ["search", "⌕", "?"],
  ["learned", "+", "+"],
  ["rule", "─", "-"],
  ["sep", "·", "."],
  // A cut: `>` where the right end was cut off, `<` where the left was (a path's head).
  ["ellipsis", "…", ">"],
  ["ellipsisLeft", "…", "<"],
]

/** @type {{ unicode: Glyphs, ascii: Glyphs }} */
export const GLYPHS = {
  unicode: Object.fromEntries(GLYPH_TABLE.map(([k, u]) => [k, u])),
  ascii: Object.fromEntries(GLYPH_TABLE.map(([k, , a]) => [k, a])),
}

/**
 * The glyph set: ASCII when the plugin option `ascii` is exactly true (cli.json
 * `{ "package": "<path>", "options": { "ascii": true } }`) or GENESEED_SIDEBAR_ASCII is "1".
 * @param {Record<string, unknown>|undefined} options context.options
 * @param {Record<string, string|undefined>|undefined} env
 * @returns {Glyphs}
 */
export function glyphsFor(options, env) {
  return options?.ascii === true || env?.GENESEED_SIDEBAR_ASCII === "1" ? GLYPHS.ascii : GLYPHS.unicode
}

const len = cols

/**
 * At most `width` columns, the last an ellipsis: the head of s, grapheme clusters kept whole; a
 * wide one that would cross the edge is left out and the gap padded, so a cut is exactly `width`.
 */
export function cut(s, width = WIDTH, ell = "…") {
  const str = String(s)
  if (cols(str) <= width) return str
  if (width <= 0) return ""
  let out = ""
  let n = 0
  for (const g of graphemes(str)) {
    const w = clusterCols(g)
    if (n + w > width - 1) break
    out += g
    n += w
  }
  return out + ell + " ".repeat(width - 1 - n)
}

/** As cut, the ellipsis first and the right end kept (the padding stays at the right). */
export function cutLeft(s, width, ell = "…") {
  const str = String(s)
  if (cols(str) <= width) return str
  if (width <= 0) return ""
  let out = ""
  let n = 0
  for (const g of graphemes(str).reverse()) {
    const w = clusterCols(g)
    if (n + w > width - 1) break
    out = g + out
    n += w
  }
  return ell + out + " ".repeat(width - 1 - n)
}

/**
 * A refused path for a panel row: relative to the session dir when it lies under it, else its
 * last two segments after the ellipsis `ell`. Keeps the path's own separator; case rules are paths.js's
 * (a drive-letter path is win32, so compared case-insensitively).
 * @param {string} detail
 * @param {string|undefined} dir
 * @param {string} [ell]
 */
export function shortPath(detail, dir, ell = "…") {
  const sep = detail.includes("\\") ? "\\" : "/"
  const p = flavor(detail)
  if (dir && flavor(dir) === p) {
    const rel = p.relative(dir, detail)
    if (rel && rel !== ".." && !rel.startsWith(`..${p.sep}`) && !p.isAbsolute(rel)) return rel.split(/[\\/]+/).join(sep)
  }
  const parts = detail.split(/[\\/]+/).filter(Boolean)
  return parts.length > 2 ? `${ell}${sep}${parts.slice(-2).join(sep)}` : detail
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
  // Only the first store that exists is listed; those before it are still stat'd, in case one appears.
  // Before the first poll none is known, so all are polled once.
  const first = w.stores.findIndex((s) => Array.isArray(snap[s]))
  const stores = first < 0 ? w.stores : w.stores.slice(0, first + 1)
  return [
    ...w.carriers,
    ...stores,
    ...(named && !stores.includes(named) ? [named] : []),
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
 * The text of the first readable carrier in the snapshot, or null.
 * @param {Watch} w
 * @param {Record<string, unknown>} snap
 * @returns {string|null}
 */
export function carrierText(w, snap) {
  const v = w.carriers.map((c) => snap[c]).find((t) => typeof t === "string")
  return v ?? null
}

/** Same gate results (on, off, n/a, strict, guard)? null (no carrier) equals only null. */
export function sameGates(a, b) {
  if (a === null || b === null) return a === b
  const key = (g) => JSON.stringify([g.on, g.off, g.na, g.strict, g.guard])
  return key(a) === key(b)
}


/**
 * Every segment's text enters a row here, stripped (src/clean.js): no control or format character
 * but U+200D, whitespace a space each. The readers clean their labels already; this choke point
 * holds for any text that reaches a row, a gate name or a rule name included.
 * @param {string} text
 * @param {Role} role
 * @param {{ bold?: boolean, inverse?: boolean, flex?: "left"|"right" }} [more]
 */
const seg = (text, role, more) => ({ text: strip(text), role, ...more })
const widthOf = (segs) => segs.reduce((n, s) => n + len(s.text), 0)

/** The row cut or padded (with spaces) to exactly W columns; empty segments dropped. */
function fit(row, W, ell = "…") {
  /** @type {Row} */
  const out = []
  let room = W
  for (const s of row) {
    if (room <= 0) break
    const n = len(s.text)
    out.push(n <= room ? s : { ...s, text: cut(s.text, room, ell) })
    room -= Math.min(n, room)
  }
  if (room > 0) out.push(seg(" ".repeat(room), "text"))
  return out.filter((s) => s.text !== "")
}

/**
 * One row exactly W wide: `left`, then `fill` repeated, then `right`. When they do not fit, the
 * segments marked `flex` give up columns first, shared out (the widest gives one up, in turn, each
 * keeping 1), while the fill keeps `min` columns ("right": cut from the right; "left": cut from
 * the left, so a path keeps its file name); what still overflows is cut from the row's right end.
 * The input segments are left as they are: the row is made of copies, without `flex`.
 * @returns {Row}
 */
export function spread(W, left, right = [], { fill = " ", role = "text", min = 0, ell = "…", ellLeft = "…" } = {}) {
  const parts = [...left, ...right]
  const keep = parts.map((s) => len(s.text))
  let over = keep.reduce((n, k) => n + k, 0) + min - W
  const flexes = parts.map((s, i) => (s.flex ? i : -1)).filter((i) => i >= 0)
  while (over > 0) {
    let at = -1
    for (const i of flexes) if (keep[i] > 1 && (at < 0 || keep[i] > keep[at])) at = i
    if (at < 0) break
    keep[at] -= 1
    over -= 1
  }
  const out = parts.map(({ flex, ...s }, i) =>
    keep[i] === len(s.text) ? s : { ...s, text: flex === "left" ? cutLeft(s.text, keep[i], ellLeft) : cut(s.text, keep[i], ell) },
  )
  const l = out.slice(0, left.length)
  const r = out.slice(left.length)
  const gap = W - widthOf(out)
  return fit([...l, ...(gap > 0 ? [seg(fill.repeat(gap), role)] : []), ...r], W, ell)
}

/**
 * The panel, in the design brief's order (gates, refused, loop, factory, memory); empty sections
 * absent; null when there is no carrier. Every row is exactly `width` columns: below FOLD one line a
 * section, above WIDE gates on up to 4 columns and items on one line each.
 * `carrier` is the carrier pinned once per plugin setup (Geneseed's guard reads its carrier once
 * per process): its text, or null when it was absent then. The gates are what the guard holds: the
 * pinned text's, all armed when it was absent. "restart OpenCode to apply" follows when the gates
 * of the carrier on disk now differ from those of the pin. Left out (undefined), the current
 * carrier is used and there is no hint.
 * @param {Watch} w
 * @param {Record<string, unknown>} snap
 * @param {unknown} messages
 * @param {{ env: Record<string, string|undefined>, sinceMs: number, time?: (ms: number) => string, carrier?: string|null, width?: number, glyphs?: Glyphs }} o
 * @returns {Row[]|null}
 */
export function panelLines(w, snap, messages, { env, sinceMs, time = hhmm, carrier, width = WIDTH, glyphs = GLYPHS.unicode }) {
  const now = carrierText(w, snap)
  const pinnedOne = carrier !== undefined
  const pinned = typeof carrier === "string" ? carrier : null
  if (pinnedOne && pinned === null && now === null) return null
  // The guard reads an absent carrier as "" (every gate armed).
  const gates = readGates(pinnedOne ? (pinned ?? "") : now, env)
  const restart = pinnedOne && !sameGates(readGates(pinned, env), readGates(now, env))
  if (!gates) return null

  const W = width
  const g = glyphs
  const spreadW = (left, right, o = {}) => spread(W, left, right, { ...o, ell: g.ellipsis, ellLeft: g.ellipsisLeft })
  const fold = W < FOLD
  const wide = W > WIDE
  /** @type {Row[]} */
  const out = []
  const item = (segs) => out.push(spreadW(segs))
  const indent = () => seg("  ", "text")
  const more = (n) => n > SHOW && item([seg(`  +${n - SHOW}`, "muted")])
  const rule = (glyph, name, role, summary) =>
    out.push(
      spreadW([seg(`${g.rule}${g.rule} `, "muted"), seg(glyph, role), seg(` ${name} `, "text")], [seg(" ", "muted"), seg(summary, role, { flex: "right" })], {
        fill: g.rule,
        role: "muted",
        min: 1,
      }),
    )
  const folded = (glyph, name, role, summary) => out.push(spreadW([seg(glyph, role), seg(` ${name}`, "text")], [seg(summary, role, { flex: "right" })], { min: 1 }))

  const refused = readRefusals(messages)
  const runsOf = (kind, reg, key, file, tag) =>
    runPaths(text(snap[reg]), key, file, w.roots, w.platform)
      .map((f) => {
        const st = readState(snap[f], tag)
        const l = runLine(kind, st, g.sep)
        return l && { ...l, waiting: st.status === "awaiting" }
      })
      .filter((l) => l !== null)
  const loops = runsOf("loop", w.loopsReg, "loops", "LOOP.md", "loop-state")
  const factories = runsOf("factory", w.factReg, "factories", "FACTORY.md", "factory-state")

  // Header: one badge, in priority order: guard off, warn, restart, then refusals + waiting runs.
  const count = refused.length + [...loops, ...factories].filter((r) => r.waiting).length
  const badge =
    gates.guard === "off"
      ? [seg(`${g.stop} off`, "error")]
      : gates.guard === "warn"
        ? [seg(`${g.warn} warn`, "warning")]
        : restart
          ? [seg(g.restart, "warning")]
          : count
            ? [seg(`${g.alert} ${count}`, "warning")]
            : []
  // Folded, there is no hint line: a restart due under a higher badge shows as its mark before it.
  const mark = fold && restart && gates.guard !== "on" ? [seg(g.restart, "warning"), seg(" ", "text")] : []
  out.push(spreadW([seg("GENESEED", "accent", { bold: true })], [...mark, ...badge], { min: 1 }))

  // Gates. Guard off replaces the section with one line, under an inverse error bar.
  if (gates.guard === "off") {
    const bar = cut(`GUARD OFF ${g.sep} nothing blocks`, W, g.ellipsis)
    out.push([seg(bar + " ".repeat(W - len(bar)), "error", { inverse: true })])
    item([seg("  GENESEED_GUARD=off", "muted")])
  } else {
    const role = gates.guard === "warn" ? "warning" : "success"
    const summary = `${gates.on.length} of ${gates.on.length + gates.off.length}`
    if (fold) folded(g.on, "Gates", role, summary)
    else {
      rule(g.on, "gates", role, summary)
      if (gates.guard === "warn") item([indent(), seg(`${g.warn} warn only ${g.sep} logs, no block`, "warning", { flex: "right" })])
      // A grid of on gates then off ones; as many columns as fit, up to 2 (4 when wide): a name
      // never cut, the list wraps instead.
      const cells = [
        ...gates.on.map((n) => [seg(g.ok, "success"), seg(` ${n}`, "text")]),
        ...gates.off.map((n) => [seg(g.off, "error"), seg(` ${n}`, "muted")]),
      ]
      const cw = Math.max(...cells.map(widthOf)) + 3
      const cols = Math.max(1, Math.min(wide ? 4 : 2, Math.floor((W - 2 + 3) / cw)))
      for (let i = 0; i < cells.length; i += cols) {
        const line = [indent()]
        const row = cells.slice(i, i + cols)
        row.forEach(([glyph, name], j) => line.push(glyph, j < row.length - 1 ? { ...name, text: name.text + " ".repeat(cw - len(glyph.text) - len(name.text)) } : name))
        item(line)
      }
      item([indent(), seg(g.na, "muted"), seg(` ${gates.na.join(", ")} n/a on OpenCode 2`, "muted", { flex: "right" })])
      if (gates.strict) item([indent(), seg(g.ok, "success"), seg(" strict consent", "muted")])
    }
  }
  if (restart && !fold) item([indent(), seg(`${g.restart} restart OpenCode to apply`, "warning", { flex: "right" })])

  // Refused: the rule, then the detail below it (one line when wide). Never the tool's content.
  if (refused.length) {
    const n = String(refused.length)
    if (fold) folded(g.alert, "Refused", "warning", n)
    else {
      rule(g.alert, "refused", "warning", n)
      for (const r of refused.slice(0, SHOW)) {
        const detail = r.isPath ? shortPath(r.detail, w.roots[0], g.ellipsisLeft) : r.detail
        // A path too wide for its row is cut from the left, so the file name always shows.
        const d = () => seg(detail, "muted", { flex: r.isPath ? "left" : "right" })
        if (wide) item([indent(), seg(r.rule, "text"), ...(detail ? [seg("  ", "text"), d()] : [])])
        else {
          item([indent(), seg(r.rule, "text", { flex: "right" })])
          if (detail) item([indent(), d()])
        }
      }
      more(refused.length)
    }
  }

  // Loops and factories: a rule a run (its step at the right), then the title and its note. Folded,
  // one line a section: the newest run's step, after the run count when there is more than one.
  const runs = (list, glyph, name, Name) => {
    if (fold) {
      if (list.length) folded(glyph, Name, "accent", list.length > 1 ? `${list.length} ${g.sep} ${list[0].step}` : list[0].step)
      return
    }
    for (const r of list.slice(0, SHOW)) {
      rule(glyph, name, "accent", r.step)
      const title = seg(r.name, "text", { flex: "right" })
      const note = r.waiting ? seg(`${g.on} waits for you`, "warning", { bold: true }) : r.note ? seg(r.note, "muted", { flex: "right" }) : null
      if (wide) out.push(spreadW([indent(), title], note ? [note] : [], { min: 2 }))
      else {
        item([indent(), title])
        if (note) item([indent(), note])
      }
    }
    more(list.length)
  }
  runs(loops, g.loop, "loop", "Loop")
  runs(factories, g.factory, "factory", "Factory")

  // Memory: what the session used (searches, fact reads), then what was learned; each newest 3.
  const store = storeOf(w, snap, messages)
  const used = readMemoryUse(messages, store).reverse()
  const listing = store ? snap[store] : null
  const fresh = Array.isArray(listing) ? learned(listing, sinceMs) : []
  if (used.length || fresh.length) {
    const summary = fresh.length ? `${used.length} ${g.sep} ${fresh.length} new` : String(used.length)
    if (fold) folded(g.memory, "Memory", "accent", summary)
    else {
      rule(g.memory, "memory", "accent", summary)
      for (const u of used.slice(0, SHOW)) {
        if (u.kind === "searched") {
          const left = [indent(), seg(g.search, "accent"), seg(` "${u.label}"`, "text", { flex: "right" })]
          const n = String(u.count ?? 0)
          if (wide) out.push(spreadW(left, [seg(n, "muted")], { min: 2 }))
          else item([...left, seg(`  ${n}`, "muted")])
        } else item([indent(), seg(g.memory, "accent"), seg(` ${u.label}`, "text", { flex: "right" })])
      }
      more(used.length)
      for (const f of fresh.slice(0, SHOW)) {
        const left = [indent(), seg(g.learned, "success"), seg(` ${f.label}`, "text", { flex: "right" })]
        if (wide) out.push(spreadW(left, [seg(time(f.at), "muted")], { min: 2 }))
        else item(left)
      }
      more(fresh.length)
    }
  }
  return out
}
