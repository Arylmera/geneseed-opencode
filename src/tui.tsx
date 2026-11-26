/** @jsxImportSource @opentui/solid */
// Geneseed panel in OpenCode 2's session sidebar. Read-only: it stats and reads files, and reads the
// session's loaded messages. This file is Solid wiring and fs adapters only; src/panel.js turns a
// snapshot and the messages into lines.
import fs from "node:fs"
import os from "node:os"
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js"
import { Plugin } from "@opencode/plugin/tui"
import { carrierPaths, cfgDir, findInstall, flavor, machineDir } from "./paths.js"
import { listFacts, storeCandidates } from "./read/memory.js"
import { carrierText, panelLines, readsTierOf, watchList } from "./panel.js"
import { createPoll } from "./poll.js"

const EVERY = 3000

type Snap = Record<string, unknown>
// The shapes src/panel.js documents in JSDoc.
type Line = { text: string; role: "text" | "muted" | "warning" }
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

const keyOf = (lines: Line[] | null) => (lines ? lines.map((l) => `${l.role}:${l.text}`).join("\n") : "")

export default Plugin.define({
  id: "geneseed.sidebar",
  setup(context) {
    // When the panel first rendered each session: "learned" counts facts changed since then.
    const since = new Map<string, number>()
    // The carrier text each session first rendered: the guard reads its carrier once, so do we.
    const carriers = new Map<string, string>()
    // Theme roles of @opencode/theme 2.3.2 ResolvedTheme. Read on every draw, so a mode switch
    // applies; optional chaining because the Rust client runs plugins through a compatibility layer.
    const color = (role: Line["role"]) => {
      const t = context.theme?.text
      return role === "warning" ? t?.feedback?.warning?.base : role === "muted" ? t?.muted : t?.base
    }
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
              const now = carrierText(w, x)
              if (!carriers.has(id) && now !== null) carriers.set(id, now)
              return panelLines(w, x, messages(), { env: process.env, sinceMs: since.get(id) ?? Date.now(), carrier: carriers.get(id) })
            } catch {
              return null
            }
          },
          null,
          { equals: (a, b) => keyOf(a) === keyOf(b) },
        )

        return (
          <Show when={view()}>
            <box flexDirection="column">
              <For each={view() ?? []}>{(l) => <text fg={color(l.role)}>{l.text}</text>}</For>
            </box>
          </Show>
        )
      },
    })
  },
})
