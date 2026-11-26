/** @jsxImportSource @opentui/solid */
// Geneseed panel in OpenCode 2's session sidebar. Read-only: it stats and reads files, and reads the
// session's loaded messages. All fs access is in `sessionFiles` below; the readers stay pure.
import fs from "node:fs"
import os from "node:os"
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js"
import { Plugin } from "@opencode/plugin/tui"
import { carrierPaths, cfgDir, findInstall, flavor, machineDir } from "./paths.js"
import { readGates } from "./read/gates.js"
import { readRefusals } from "./read/refusals.js"
import { learned, readMemoryUse, storeCandidates } from "./read/memory.js"
import { readState, rowsFor, runLine } from "./read/runs.js"
import { createPoll } from "./poll.js"

const EVERY = 3000
const WIDTH = 30
const SHOW = 3

type Line = { text: string; role: "text" | "muted" | "warning" }
type Snap = Record<string, unknown>

/** Cut to WIDTH characters, the last one an ellipsis; never splits a character. */
const cut = (s: string) => {
  const c = Array.from(s)
  return c.length <= WIDTH ? s : c.slice(0, WIDTH - 1).join("") + "…"
}

/** Newest SHOW of a newest-first list, then "+N". */
function capped(rows: string[], indent: string): Line[] {
  const out: Line[] = rows.slice(0, SHOW).map((t) => ({ text: cut(indent + t), role: "muted" }))
  if (rows.length > SHOW) out.push({ text: `${indent}+${rows.length - SHOW}`, role: "muted" })
  return out
}

const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

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

/** Everything one session polls, and how its snapshot becomes panel lines. */
function sessionFiles(dir: string, sinceMs: number) {
  const env = process.env
  const home = os.homedir()
  const cfg = cfgDir(env, home)
  const machine = machineDir(env, home)
  const install = findInstall(dir, cfg, (x) => fs.existsSync(x))
  const p = flavor(dir)
  const git = gitRoot(dir)
  const roots = git && git !== dir ? [dir, git] : [dir]
  const emit = install.kind === "project" ? readText(flavor(install.root).join(install.root, ".opencode", ".geneseed-emit")) : null
  const readsTier = install.kind === "global" || (emit ?? "").trim().endsWith("-global")
  const carriers = carrierPaths(env, install, cfg)
  const stores = storeCandidates(env, install, cfg, machine, dir, readsTier)
  const storeSet = new Set(stores)
  const mp = flavor(machine)
  const loopsReg = mp.join(machine, "loops.json")
  const factReg = mp.join(machine, "factories.json")
  const listings = new Map<string, { name: string; mtimeMs: number }[]>()

  const runs = (snap: Snap | null, reg: string, key: "loops" | "factories", file: string) =>
    rowsFor(snap?.[reg] ?? "", key, roots, process.platform).map((r) => flavor(r.root).join(r.root, file))

  return {
    files: (snap: Snap | null) => [
      ...carriers,
      ...stores,
      loopsReg,
      factReg,
      ...runs(snap, loopsReg, "loops", "LOOP.md"),
      ...runs(snap, factReg, "factories", "FACTORY.md"),
    ],
    // A store is a folder: its token is its listing, since a changed fact leaves the folder mtime alone.
    stat(x: string): unknown {
      if (storeSet.has(x)) {
        if (!fs.statSync(x).isDirectory()) return null
        const sp = flavor(x)
        const entries = (fs.readdirSync(x, { recursive: true }) as string[])
          .filter((n) => /\.md$/i.test(n))
          .map((n) => ({ name: n, mtimeMs: fs.statSync(sp.join(x, n)).mtimeMs }))
        listings.set(x, entries)
        return entries.map((e) => `${e.name}@${e.mtimeMs}`).join("|") || "empty"
      }
      const s = fs.statSync(x)
      return `${s.mtimeMs}:${s.size}`
    },
    read: (x: string): unknown => (storeSet.has(x) ? listings.get(x) ?? [] : fs.readFileSync(x, "utf8")),
    view(snap: Snap, messages: unknown): Line[] | null {
      const text = carriers.map((c) => snap[c]).find((v) => typeof v === "string") as string | undefined
      const gates = readGates(text ?? null, env)
      if (!gates) return null
      const out: Line[] = [{ text: "Geneseed", role: "text" }, { text: " Gates", role: "text" }]
      if (gates.guard === "off") out.push({ text: "  guard off", role: "warning" })
      else if (gates.guard === "warn") out.push({ text: "  warn only", role: "warning" })
      else {
        if (gates.on.length) out.push({ text: cut(`  on   ${gates.on.join(", ")}`), role: "muted" })
        if (gates.off.length) out.push({ text: cut(`  off  ${gates.off.join(", ")}`), role: "muted" })
        out.push({ text: cut(`  n/a  ${gates.na.join(", ")} (OpenCode 2)`), role: "muted" })
        if (gates.strict) out.push({ text: "  strict consent", role: "muted" })
      }

      const refused = readRefusals(messages)
      if (refused.length) {
        out.push({ text: ` Refused  ${refused.length}`, role: "warning" })
        out.push(...capped(refused.map((r) => (r.detail ? `${r.rule}  ${r.detail}` : r.rule)), "  "))
      }

      const store = stores.find((s) => Array.isArray(snap[s])) ?? null
      const used = readMemoryUse(messages, store).reverse()
      const fresh = store ? learned(snap[store] as { name: string; mtimeMs: number }[], sinceMs) : []
      if (used.length || fresh.length) {
        out.push({ text: " Memory", role: "text" })
        out.push(
          ...capped(
            used.map((u) => (u.kind === "searched" ? `searched  "${u.label}"  ${u.count ?? 0}` : `read      ${u.label}`)),
            "  ",
          ),
        )
        out.push(...capped(fresh.map((f) => `learned   ${f.label}  ${hhmm(f.at)}`), "  "))
      }

      const lines = (kind: "loop" | "factory", files: string[]) => {
        const tag = kind === "loop" ? "loop-state" : "factory-state"
        const label = kind === "loop" ? "Loop" : "Factory"
        return files
          .map((f) => runLine(kind, readState(snap[f], tag)))
          .filter((l): l is NonNullable<typeof l> => l !== null)
          .map((l) => `${label}  ${l.name}  ${l.step}${l.note ? ` · ${l.note}` : ""}`)
          .reverse()
      }
      out.push(...capped(lines("loop", runs(snap, loopsReg, "loops", "LOOP.md")), " "))
      out.push(...capped(lines("factory", runs(snap, factReg, "factories", "FACTORY.md")), " "))
      return out
    },
  }
}

export default Plugin.define({
  id: "geneseed.sidebar",
  setup(context) {
    // When the panel first rendered each session: "learned" counts facts changed since then.
    const since = new Map<string, number>()
    const color = (role: Line["role"]) => (context.theme as unknown as Record<string, unknown>)?.[role] as any

    return context.ui.slot({
      append: "sidebar.content",
      render(input) {
        const [snap, setSnap] = createSignal<Snap | null>(null)
        const [files, setFiles] = createSignal<ReturnType<typeof sessionFiles> | null>(null)
        const [bump, setBump] = createSignal(0)

        createEffect(
          on(
            () => input.sessionID,
            (id) => {
              setSnap(null)
              setFiles(null)
              if (!id) return
              let s: ReturnType<typeof sessionFiles>
              try {
                const info = context.data.session.get(id) as any
                const base: string | undefined = info?.location?.directory ?? context.location?.directory
                if (!base) return
                const dir = typeof info?.subpath === "string" && info.subpath ? flavor(base).join(base, info.subpath) : base
                if (!since.has(id)) since.set(id, Date.now())
                s = sessionFiles(dir, since.get(id)!)
              } catch {
                return
              }
              setFiles(s)
              let last: Snap | null = null
              const stop = createPoll({
                files: () => s.files(last),
                stat: s.stat,
                read: s.read,
                onChange: (x) => {
                  last = x
                  setSnap(x)
                },
                every: EVERY,
              })
              // message.list is not documented as a tracked read: re-read it on the poll's beat too.
              const beat = setInterval(() => setBump((n) => n + 1), EVERY)
              onCleanup(() => {
                stop()
                clearInterval(beat)
              })
            },
          ),
        )

        const messages = createMemo(
          () => {
            bump()
            try {
              return context.data.session.message.list(input.sessionID) ?? []
            } catch {
              return []
            }
          },
          undefined,
          { equals: false },
        )

        const view = createMemo(() => {
          const s = files()
          const x = snap()
          if (!s || !x) return null
          try {
            return s.view(x, messages())
          } catch {
            return null
          }
        })

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
