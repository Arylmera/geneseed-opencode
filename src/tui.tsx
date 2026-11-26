/** @jsxImportSource @opentui/solid */
// Geneseed panel in OpenCode 2's session sidebar. Read-only: it stats and reads files, and reads the
// session's loaded messages. This file is Solid wiring and fs adapters only; src/panel.js turns a
// snapshot and the messages into rows of exactly the panel width, drawn here as they are.
import fs from "node:fs"
import os from "node:os"
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js"
import { Plugin } from "@opencode/plugin/tui"
import { carrierPaths, cfgDir, findInstall, flavor, machineDir } from "./paths.js"
import { listFacts, storeCandidates } from "./read/memory.js"
import { WIDTH, carrierText, glyphsFor, panelLines, readsTierOf, watchList } from "./panel.js"
import { createPoll } from "./poll.js"

const EVERY = 3000

type Snap = Record<string, unknown>
// The shapes src/panel.js documents in JSDoc.
type Role = "text" | "muted" | "success" | "warning" | "error" | "accent"
type Seg = { text: string; role: Role; bold?: boolean; inverse?: boolean }
type Row = Seg[]
type Watch = { carriers: string[]; stores: string[]; loopsReg: string; factReg: string; roots: string[]; platform: string }

const readText = (p: string): string | null => {
  try {
    return fs.readFileSync(p, "utf8")
  } catch {
    return null
  }
}

function gitRoot(dir: string): string | null {
  const p = flavor(dir)
  for (let cur = dir; ; cur = p.dirname(cur)) {
    if (fs.existsSync(p.join(cur, ".git"))) return cur
    if (p.dirname(cur) === cur) return null
  }
}

/** What one session polls, resolved once from its directory. */
function watchFor(dir: string): Watch {
  const env = process.env
  const home = os.homedir()
  const cfg = cfgDir(env, home)
  const machine = machineDir(env, home)
  const install = findInstall(dir, cfg, (x) => fs.existsSync(x))
  const git = gitRoot(dir)
  const emit = install.kind === "project" ? readText(flavor(install.root).join(install.root, ".opencode", ".geneseed-emit")) : null
  const mp = flavor(machine)
  return {
    carriers: carrierPaths(env, install, cfg),
    stores: storeCandidates(env, install, cfg, machine, dir, readsTierOf(install, emit)),
    loopsReg: mp.join(machine, "loops.json"),
    factReg: mp.join(machine, "factories.json"),
    roots: git && git !== dir ? [dir, git] : [dir],
    platform: process.platform,
  }
}

// The disk for listFacts: one folder's entries, one file's mtime.
const factIo = {
  list: (d: string) => fs.readdirSync(d, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() })),
  mtime: (f: string) => fs.statSync(f).mtimeMs,
}

/** fs adapter for createPoll. A folder (a memory store) is stat'd by its fact listing, depth 2: a
 * changed fact leaves the folder's own mtime alone. */
function fsAdapter() {
  const listings = new Map<string, { name: string; mtimeMs: number }[]>()
  return {
    stat(x: string): unknown {
      const s = fs.statSync(x)
      if (!s.isDirectory()) return `${s.mtimeMs}:${s.size}`
      const entries = listFacts(x, factIo)
      listings.set(x, entries)
      return "dir|" + entries.map((e) => `${e.name}@${e.mtimeMs}`).join("|")
    },
    read: (x: string): unknown => listings.get(x) ?? fs.readFileSync(x, "utf8"),
  }
}

const keyOf = (rows: Row[] | null) =>
  rows ? rows.map((r) => r.map((s) => `${s.role}${s.bold ? "!" : ""}${s.inverse ? "^" : ""}:${s.text}`).join("|")).join("\n") : ""

export default Plugin.define({
  id: "geneseed.sidebar",
  setup(context) {
    // When the panel first rendered each session: "learned" counts facts changed since then.
    const since = new Map<string, number>()
    // Geneseed's guard reads its carrier once per process, at load: one pin per setup, from the first
    // snapshot read after it. null records "absent". undefined until that first read.
    let pinned: string | null | undefined
    // Theme roles of @opencode/theme 2.3.2 ResolvedTheme. Read on every draw, so a mode switch
    // applies; optional chaining because the Rust client runs plugins through a compatibility layer.
    // accent is the hue OpenCode's own prompt uses (@opencode/theme 2.3.2 syntax.js: hue.accent[200]).
    const color = (role: Role) => {
      const th = context.theme
      const t = th?.text
      if (role === "success" || role === "warning" || role === "error") return t?.feedback?.[role]?.base
      if (role === "accent") return th?.hue?.accent?.[200]
      return role === "muted" ? t?.muted : t?.base
    }
    // An inverse segment is drawn as the page colour on its role's colour, set explicitly rather
    // than through the inverse attribute, which would swap with a transparent background.
    const style = (s: Seg) =>
      s.inverse ? { fg: context.theme?.background?.base, bg: color(s.role), bold: s.bold } : { fg: color(s.role), bold: s.bold }
    // ASCII glyphs when cli.json gives the plugin { "options": { "ascii": true } } or GENESEED_SIDEBAR_ASCII=1.
    const glyphs = glyphsFor(context.options, process.env)
    const messagesOf = (id: string): unknown => {
      try {
        return context.data.session.message.list(id) ?? []
      } catch {
        return []
      }
    }

    return context.ui.slot({
      append: "sidebar.content",
      render(input) {
        const [snap, setSnap] = createSignal<Snap | null>(null)
        const [watch, setWatch] = createSignal<Watch | null>(null)
        // Neither session.get nor message.list is documented as a tracked read: re-read on a beat.
        const [bump, setBump] = createSignal(0)
        const beat = setInterval(() => setBump((n) => n + 1), EVERY)
        onCleanup(() => clearInterval(beat))
        // The drawn box's inner width: OpenTUI's Renderable.width, kept by its onSizeChange hook
        // (both in @opentui/core 0.8.4, which OpenCode 2.3.2 pins, and 0.9.9), and read again on
        // the beat in case a host never calls the hook. WIDTH until the box has been laid out.
        const [width, setWidth] = createSignal(WIDTH)
        const measure = (r: any) => {
          const n = r?.width
          if (typeof n === "number" && Number.isFinite(n) && n > 0) setWidth(Math.floor(n))
        }
        let box: any
        createEffect(on(bump, () => measure(box)))

        // The session's directory; a session that loads late restarts the poller with its real dir.
        const dir = createMemo(() => {
          bump()
          try {
            const info = context.data.session.get(input.sessionID) as any
            const base: string | undefined = info?.location?.directory ?? context.location?.directory
            if (!base) return null
            return typeof info?.subpath === "string" && info.subpath ? flavor(base).join(base, info.subpath) : base
          } catch {
            return null
          }
        })

        createEffect(
          on([() => input.sessionID, dir], ([id, d]) => {
            setSnap(null)
            setWatch(null)
            if (!id || !d) return
            let w: Watch
            try {
              w = watchFor(d)
            } catch {
              return
            }
            if (!since.has(id)) since.set(id, Date.now())
            setWatch(w)
            const io = fsAdapter()
            const stop = createPoll({
              files: (s) => watchList(w, s, messagesOf(id)),
              stat: io.stat,
              read: io.read,
              onChange: setSnap,
              every: EVERY,
            })
            onCleanup(stop)
          }),
        )

        const messages = createMemo(
          () => {
            bump()
            return messagesOf(input.sessionID)
          },
          undefined,
          { equals: false },
        )

        const view = createMemo(
          () => {
            const w = watch()
            const x = snap()
            if (!w || !x) return null
            try {
              const id = input.sessionID
              if (pinned === undefined) pinned = carrierText(w, x)
              return panelLines(w, x, messages(), {
                env: process.env,
                sinceMs: since.get(id) ?? Date.now(),
                carrier: pinned,
                width: width(),
                glyphs,
              })
            } catch {
              return null
            }
          },
          null,
          { equals: (a, b) => keyOf(a) === keyOf(b) },
        )

        return (
          <Show when={view()}>
            <box
              flexDirection="column"
              width="100%"
              ref={(r: any) => {
                box = r
                measure(r)
              }}
              onSizeChange={function (this: any) {
                measure(this)
              }}
            >
              <For each={view() ?? []}>
                {(row) => (
                  <text>
                    <For each={row}>{(s) => <span style={style(s)}>{s.text}</span>}</For>
                  </text>
                )}
              </For>
            </box>
          </Show>
        )
      },
    })
  },
})
