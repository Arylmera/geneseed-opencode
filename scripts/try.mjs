#!/usr/bin/env node
// Try the sidebar plugin in OpenCode's own screen, in a throwaway home. No dependencies.
//
//   node scripts/try.mjs [--geneseed <dir> | GENESEED_SRC] [--opencode <opencode.exe>]
//   node scripts/try.mjs --clean <dir>
//
// It builds a home under the OS temp dir (gs-try-<random>) holding a Geneseed emit, a cli.json that
// lists this checkout, a scripted model on 127.0.0.1 (scripts/fake-model.mjs: no real model, no credentials), and a temp git
// repo with a real `loop init`. It checks what it can without a screen, prints each result, then
// prints the one command that opens OpenCode's screen in that home. It never starts that screen.
// Nothing writes your real OpenCode config dir or Geneseed machine dir: a check compares their
// top-level entries and mtimes before and after.
import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { CHECKLIST, KEEP, RUNTIME_MODULES, buildEnv, missingModules, overridesFor, realDirs, tryTurns } from "./try-env.mjs"

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const argv = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const tmp = () => fs.realpathSync.native(os.tmpdir())

// ---- --clean ---------------------------------------------------------------------------------
if (argv.includes("--clean")) {
  const dir = opt("--clean", "")
  let real
  try {
    real = fs.realpathSync.native(path.resolve(dir))
  } catch {
    console.error(`clean: ${dir} does not exist`)
    process.exit(2)
  }
  const ok = /^gs-try-[A-Za-z0-9]+$/.test(path.basename(real)) && path.dirname(real).toLowerCase() === tmp().toLowerCase()
  if (!dir || !ok) {
    console.error(`clean: refused. ${dir || "(no dir)"} is not a gs-try-* folder directly under ${tmp()}`)
    process.exit(2)
  }
  fs.rmSync(real, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  console.log(`removed ${real}`)
  process.exit(0)
}

// ---- setup -----------------------------------------------------------------------------------
const geneseedArg = opt("--geneseed", process.env.GENESEED_SRC)
if (!geneseedArg) {
  console.error("Pass --geneseed <Geneseed checkout> or set GENESEED_SRC.")
  process.exit(2)
}
const GENESEED = path.resolve(geneseedArg)
const results = []
const check = (name, pass, detail = "") => {
  results.push(pass)
  console.log(`${pass ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`)
}

for (const f of ["bin/build-driver.mjs", "bin/geneseed-cli.mjs"]) {
  if (!fs.existsSync(path.join(GENESEED, f))) {
    console.error(`not a Geneseed checkout (missing ${f}): ${GENESEED}. Pass --geneseed <dir>.`)
    process.exit(2)
  }
}

// What the owner's real config looked like before, to prove it was left alone: the top-level entries
// (name and mtime) of the real OpenCode config dir and Geneseed machine dir, from the parent
// environment.
const watched = realDirs(process.env, os.homedir())
const snapshot = () => JSON.stringify(watched.map((d) => {
  try {
    return fs.readdirSync(d).sort().map((n) => [n, fs.statSync(path.join(d, n)).mtimeMs])
  } catch {
    return null
  }
}))
const before = snapshot()

const HOME = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "gs-try-")))
const CFG = path.join(HOME, ".config", "opencode")
const MACHINE = path.join(HOME, ".config", "geneseed")
const PROJECT = path.join(HOME, "project")
const WORK = path.join(HOME, "work")
for (const d of [CFG, PROJECT, WORK, path.join(HOME, ".local", "share"), path.join(HOME, ".local", "state"), path.join(HOME, ".cache")]) {
  fs.mkdirSync(d, { recursive: true })
}

// The throwaway environment: an allowlist (see try-env.mjs), then the overrides.
const OVERRIDES = overridesFor(HOME)
const env = (extra = {}) => buildEnv(process.env, OVERRIDES, extra)
const run = (cmd, args, cwd, timeout = 120_000) => {
  const r = spawnSync(cmd, args, { cwd, env: env({ PWD: cwd }), encoding: "utf8", timeout, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` }
}

console.log(`throwaway home: ${HOME}\n`)

// 2. Geneseed, emitted for OpenCode into the throwaway config dir.
const emit = run(process.execPath, [path.join(GENESEED, "bin", "build-driver.mjs"), "--emit", "opencode-global"], PROJECT, 180_000)
if (emit.status !== 0) console.error(emit.out.slice(-1500))

// 3. cli.json and the scripted model.
fs.writeFileSync(path.join(CFG, "cli.json"), JSON.stringify({ plugins: [REPO] }, null, 2))
const portFile = path.join(WORK, "fake-model.port")
const requestsFile = path.join(WORK, "fake-model.requests.jsonl")
// One prompt: a write the secrets gate refuses, a memory_search, then a write that is allowed.
const model = spawn(process.execPath, [
  path.join(REPO, "scripts", "fake-model.mjs"),
  "--port-file", portFile, "--requests", requestsFile, "--turns", JSON.stringify(tryTurns(PROJECT)), "--ttl", "1800",
], { env: env(), detached: true, stdio: "ignore", windowsHide: true })
model.unref()
for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100)
const port = fs.existsSync(portFile) ? fs.readFileSync(portFile, "utf8").trim() : ""
if (!port) {
  try { process.kill(model.pid) } catch { /* already gone */ }
  console.error(`FAIL  the fake model never listened (no port file after 10 s); stopped pid ${model.pid}. Home left at ${HOME}`)
  process.exit(1)
}

if (port) {
  // The only provider is the scripted model; `model` and `small_model` both name it.
  fs.writeFileSync(path.join(PROJECT, "opencode.json"), JSON.stringify({
    model: "canary/fake",
    small_model: "canary/fake",
    provider: {
      canary: {
        npm: "@ai-sdk/openai-compatible",
        name: "canary",
        options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: "none" },
        models: { fake: { name: "fake" } },
      },
    },
    enabled_providers: ["canary"],
    permission: { edit: "allow" },
  }, null, 2))
}

// 4. The project: a temp git repo with a real loop registered.
const git = (...a) => run("git", ["-c", "user.name=try", "-c", "user.email=try@example.invalid", ...a], PROJECT, 30_000)
git("init", "-q")
git("commit", "-q", "--allow-empty", "-m", "init")
const init = run(process.execPath, [
  path.join(GENESEED, "bin", "geneseed-cli.mjs"), "loop", "init",
  "--title", "try-sidebar", "--requirement", "Show the sidebar loop line", "--graph", "tdd",
], PROJECT, 60_000)
if (init.status !== 0) console.error(init.out.slice(-1500))

// 5. Headless self-checks.
const agent = [path.join(CFG, "AGENT.md"), path.join(HOME, ".config", "AGENT.md")].find((f) => fs.existsSync(f))
check("emitted AGENT.md exists", Boolean(agent), agent ?? "none under the throwaway config dir")

let plugins = []
try {
  plugins = JSON.parse(fs.readFileSync(path.join(CFG, "cli.json"), "utf8")).plugins ?? []
} catch { /* reported below */ }
check("cli.json lists the plugin", plugins.length === 1 && path.resolve(plugins[0]) === REPO, plugins[0])

// OpenCode loads src/tui.tsx from this checkout, so its imports resolve from here, not from OpenCode.
const missing = missingModules(REPO)
check(`${RUNTIME_MODULES.join(" and ")} resolve from the repo`, missing.length === 0,
  missing.length ? `missing ${missing.join(", ")}: run npm install --ignore-scripts in ${REPO}` : "")

let listening = false
if (port) {
  listening = await new Promise((resolve) => {
    const s = net.connect(Number(port), "127.0.0.1")
    s.once("connect", () => { s.destroy(); resolve(true) })
    s.once("error", () => resolve(false))
    setTimeout(() => resolve(false), 3000).unref()
  })
}
check("fake model listens on 127.0.0.1", listening, port ? `port ${port}, pid ${model.pid}` : "no port file after 10 s")

const loopsFile = path.join(MACHINE, "loops.json")
let rows = []
try {
  rows = JSON.parse(fs.readFileSync(loopsFile, "utf8")).loops ?? []
} catch { /* reported below */ }
const samePath = (a, b) => path.resolve(String(a)).toLowerCase() === path.resolve(b).toLowerCase()
check("loops.json names the repo", rows.some((r) => samePath(r.root, PROJECT)), loopsFile)

// The panel, built from the throwaway files by the plugin's own src/panel.js (a child process, so it
// reads the throwaway env the way the screen will).
const probe = `
import fs from "node:fs"
import { panelLines } from ${JSON.stringify(new URL("../src/panel.js", import.meta.url).href)}
const a = JSON.parse(process.argv[1])
const read = (f) => { try { return fs.readFileSync(f, "utf8") } catch { return undefined } }
const snap = {}
for (const f of [...a.w.carriers, a.w.loopsReg, a.w.factReg, ...a.loopFiles]) { const t = read(f); if (t !== undefined) snap[f] = t }
const lines = panelLines(a.w, snap, [], { env: process.env, sinceMs: Date.now() })
console.log(JSON.stringify(lines))
`
let lines = null
let probeOut = ""
if (agent) {
  const loopFiles = rows.map((r) => path.join(r.root, "LOOP.md"))
  const w = {
    carriers: [path.join(CFG, "AGENT.md"), path.join(HOME, ".config", "AGENT.md")],
    stores: [], loopsReg: loopsFile, factReg: path.join(MACHINE, "factories.json"), roots: [PROJECT], platform: process.platform,
  }
  const p = run(process.execPath, ["--input-type=module", "-e", probe, JSON.stringify({ w, loopFiles })], PROJECT, 30_000)
  probeOut = p.out
  try {
    lines = JSON.parse(p.out.trim().split("\n").pop())
  } catch { /* reported below */ }
}
const texts = (lines ?? []).map((l) => l.text)
check("panel builds the Geneseed section and the gates", texts[0] === "Geneseed" && texts.some((t) => /^\s+on\s+secrets/.test(t)), texts.slice(0, 4).join(" | ") || probeOut.slice(-300))
check("panel builds the loop line", texts.some((t) => /^ Loop\s+try-sidebar/.test(t)), texts.filter((t) => /Loop/.test(t) || /^\s{3}\S/.test(t)).join(" | "))

check("your real OpenCode config dir and Geneseed machine dir are untouched (top-level entries and mtimes)", snapshot() === before)

// 6. The command for the owner. A .ps1 in the home sets the environment, so the command itself is plain.
const exe = opt("--opencode", findOpencode())
function findOpencode() {
  const shim = spawnSync("where.exe", ["opencode"], { env: env(), encoding: "utf8", windowsHide: true }).stdout?.split(/\r?\n/).find(Boolean)
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  const roots = [shim && path.dirname(shim), path.join(process.env.APPDATA ?? "", "npm")].filter(Boolean)
  for (const r of roots) {
    for (const p of [
      path.join(r, "node_modules", "@opencode", "cli", "node_modules", "@opencode", `cli-windows-${arch}`, "bin", "opencode.exe"),
      path.join(r, "node_modules", "@opencode", "cli", "bin", "opencode.exe"),
    ]) if (fs.existsSync(p)) return p
  }
  return "opencode.exe"
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const ps1 = [
  "# Opens OpenCode's screen in the throwaway home made by scripts/try.mjs.",
  // A fresh environment: everything not on the allowlist is cleared, then the throwaway values are set.
  `$keep = @(${KEEP.map(q).join(", ")})`,
  'Get-ChildItem Env: | Where-Object { $keep -notcontains $_.Name } | ForEach-Object { Remove-Item -LiteralPath ("Env:" + $_.Name) -ErrorAction SilentlyContinue }',
  ...Object.entries({ ...OVERRIDES, PWD: PROJECT }).map(([k, v]) => `$env:${k} = ${q(v)}`),
  `Set-Location ${q(PROJECT)}`,
  `& ${q(exe)} --standalone`,
  "",
].join("\r\n")
const ps1File = path.join(HOME, "try.ps1")
fs.writeFileSync(ps1File, ps1)

const allOk = results.every(Boolean)
console.log(`\n${allOk ? "All headless checks ok." : "Some headless checks FAILED. Do not trust the screen run until they pass."}`)
console.log(`\nOpen OpenCode's screen in the throwaway home (PowerShell, one command):\n\n  powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1File}"\n`)
console.log("What you should see (the README checklist):")
CHECKLIST.forEach((item, i) => console.log(`  ${i + 1}. ${item}`))
console.log(`\nThe scripted model is running (pid ${model.pid}, stops itself after 30 minutes). Stop it now with:\n\n  Stop-Process -Id ${model.pid}\n`)
console.log(`When done, remove the home:\n\n  node scripts/try.mjs --clean "${HOME}"\n`)
process.exit(allOk ? 0 : 1)
