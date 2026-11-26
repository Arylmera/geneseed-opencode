import { test } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { KEEP, buildEnv, overridesFor } from "../scripts/try-env.mjs"

const LEAKS = [
  "OPENCODE_CONFIG", "OPENCODE_CONFIG_CONTENT", "OPENCODE_AUTH_CONTENT", "OPENCODE_PERMISSION",
  "GENESEED_WIKI", "GENESEED_GUARD", "GENESEED_HARNESS", "CLAUDE_CONFIG_DIR",
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "ANTHROPIC_API_KEY", "AWS_PROFILE",
]
const HOME = "/h/gs-try-x"

test("no leaked variable survives; the allowlist and the overrides do", () => {
  const parent = { PATH: "/bin", SystemRoot: "C:\\Windows", ...Object.fromEntries(LEAKS.map((k) => [k, "leak"])) }
  const env = buildEnv(parent, overridesFor(HOME))
  for (const k of LEAKS) assert.equal(env[k], undefined, k)
  assert.equal(env.PATH, "/bin")
  assert.equal(env.SystemRoot, "C:\\Windows")
  assert.equal(env.NO_PROXY, "127.0.0.1,localhost")
  assert.equal(env.OPENCODE_CONFIG_DIR, path.join(HOME, ".config", "opencode"))
})

test("the allowlist matches names case-insensitively", () => {
  assert.equal(buildEnv({ Path: "p", systemroot: "r" }, {}).Path, "p")
  assert.equal(buildEnv({ Path: "p", systemroot: "r" }, {}).systemroot, "r")
})

test("overrides win over a parent value of the same name", () => {
  assert.equal(buildEnv({ TEMP: "/real" }, { TEMP: "/mine" }).TEMP, "/mine")
})

test("the allowlist names no config or credential variable", () => {
  for (const k of KEEP) assert.doesNotMatch(k, /OPENCODE|GENESEED|CLAUDE|PROXY|KEY|TOKEN|SECRET/i)
})

test("missingModules: names what does not resolve from the repo, finds what does", async () => {
  const { missingModules } = await import("../scripts/try-env.mjs")
  const fs = await import("node:fs")
  const os = await import("node:os")
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-mods-"))
  try {
    fs.writeFileSync(path.join(dir, "package.json"), "{}")
    assert.deepEqual(missingModules(dir, ["solid-js", "@opentui/solid"]), ["solid-js", "@opentui/solid"])
    // An installed package, one with an export map that hides "." from require included.
    const pkg = (name, json) => {
      const d = path.join(dir, "node_modules", ...name.split("/"))
      fs.mkdirSync(d, { recursive: true })
      fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name, ...json }))
      fs.writeFileSync(path.join(d, "index.js"), "")
    }
    pkg("solid-js", { main: "index.js" })
    pkg("@opentui/solid", { exports: { "./x": "./index.js" } })
    assert.deepEqual(missingModules(dir, ["solid-js", "@opentui/solid"]), [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("the untouched check watches the real OpenCode config dir and Geneseed machine dir, not ~/.claude", async () => {
  const { realDirs } = await import("../scripts/try-env.mjs")
  const home = "/home/me"
  assert.deepEqual(realDirs({}, home), ["/home/me/.config/opencode", "/home/me/.config/geneseed"])
  assert.deepEqual(realDirs({ OPENCODE_CONFIG_DIR: "/oc", XDG_CONFIG_HOME: "/x" }, home), ["/oc", "/x/geneseed"])
  for (const d of realDirs({}, home)) assert.doesNotMatch(d, /\.claude/)
})

test("every child try.mjs starts gets the allowlisted env", async () => {
  const fs = await import("node:fs")
  const src = fs.readFileSync(new URL("../scripts/try.mjs", import.meta.url), "utf8")
  const calls = []
  for (const m of src.matchAll(/\b(spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\(/g)) {
    let depth = 0
    let i = m.index + m[0].length - 1
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++
      else if (src[i] === ")" && --depth === 0) break
    }
    calls.push(src.slice(m.index, i + 1))
  }
  // run (spawnSync), the scripted model (spawn) and where.exe (spawnSync).
  assert.ok(calls.length >= 3, `only ${calls.length} child calls found`)
  for (const c of calls) assert.match(c, /\benv:\s*env\(/, c.split("\n")[0])
})

test("try.mjs prints the README checklist: same items, same order, same words", async () => {
  const fs = await import("node:fs")
  const { CHECKLIST } = await import("../scripts/try-env.mjs")
  const readme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8")
  const start = readme.indexOf("Checklist for the live run")
  assert.ok(start >= 0, "no checklist in the README")
  const items = []
  for (const line of readme.slice(start).split("\n").slice(1)) {
    if (/^\d+\. /.test(line)) items.push(line.replace(/^\d+\. /, ""))
    else if (/^ {3}\S/.test(line) && items.length) items[items.length - 1] += ` ${line.trim()}`
    else if (items.length && line.trim() === "") break
  }
  assert.ok(items.length >= 6, `only ${items.length} README items`)
  assert.deepEqual(CHECKLIST, items)
  const src = fs.readFileSync(new URL("../scripts/try.mjs", import.meta.url), "utf8")
  assert.match(src, /CHECKLIST\.forEach/)
})

test("cleanHome: a busy opencode.db deletes nothing, says so with the full command, exits 1", async () => {
  const { cleanHome } = await import("../scripts/try-env.mjs")
  const out = []
  const err = []
  const removed = []
  const code = cleanHome(String.raw`C:\Temp\gs-try-abc`, {
    isBusy: (f) => f.endsWith("opencode.db") && f.includes(".local"),
    remove: (p) => removed.push(p),
    log: (s) => out.push(s),
    error: (s) => err.push(s),
    script: String.raw`C:\repo\scripts\try.mjs`,
  })
  assert.equal(code, 1)
  assert.deepEqual(removed, [])
  assert.equal(err[0], "clean: OpenCode still has this home open. Quit it, then run this again:")
  assert.equal(err[1], String.raw`  node "C:\repo\scripts\try.mjs" --clean "C:\Temp\gs-try-abc"`)
  assert.equal(err.length, 2)
})

test("cleanHome: the lock is looked for on the home's own opencode.db", async () => {
  const { cleanHome } = await import("../scripts/try-env.mjs")
  const asked = []
  cleanHome("/t/gs-try-abc", { isBusy: (f) => (asked.push(f), false), remove: () => {}, log: () => {}, error: () => {}, script: "/r/try.mjs" })
  assert.deepEqual(asked, [path.join("/t/gs-try-abc", ".local", "share", "opencode", "opencode.db")])
})

test("cleanHome: a free home is removed; any other delete error is one line with path and code", async () => {
  const { cleanHome } = await import("../scripts/try-env.mjs")
  const out = []
  assert.equal(cleanHome("/t/gs-try-abc", { isBusy: () => false, remove: () => {}, log: (s) => out.push(s), error: () => {}, script: "/r/try.mjs" }), 0)
  assert.deepEqual(out, ["removed /t/gs-try-abc"])
  const err = []
  const boom = Object.assign(new Error("EPERM: operation not permitted, rmdir 'x'"), { code: "EPERM", path: "/t/gs-try-abc/.cache" })
  const code = cleanHome("/t/gs-try-abc", { isBusy: () => false, remove: () => { throw boom }, log: () => {}, error: (s) => err.push(s), script: "/r/try.mjs" })
  assert.equal(code, 1)
  assert.deepEqual(err, ["clean: could not remove /t/gs-try-abc/.cache (EPERM)"])
})

test("isBusy: a missing database is not busy; one that cannot be renamed is", async () => {
  const { dbBusy } = await import("../scripts/try-env.mjs")
  const mk = (code) => ({ existsSync: () => true, renameSync: () => { if (code) throw Object.assign(new Error(code), { code }) } })
  assert.equal(dbBusy("/x/opencode.db", { existsSync: () => false, renameSync: () => { throw new Error("no") } }), false)
  assert.equal(dbBusy("/x/opencode.db", mk(null)), false)
  for (const c of ["EBUSY", "EPERM", "EACCES"]) assert.equal(dbBusy("/x/opencode.db", mk(c)), true, c)
})

test("every command try.mjs prints runs from any folder: absolute paths, none starting 'node scripts'", async () => {
  const { printedCommands } = await import("../scripts/try-env.mjs")
  const home = String.raw`C:\Temp\gs-try-abc`
  const cmds = printedCommands({ script: String.raw`C:\repo\scripts\try.mjs`, home, pid: 4242 })
  assert.ok(cmds.length >= 5)
  for (const c of cmds) {
    assert.doesNotMatch(c, /^\s*node\s+scripts/, c)
    assert.doesNotMatch(c, /"\.{1,2}[\/]/, c)
  }
  assert.ok(cmds.includes(String.raw`node "C:\repo\scripts\try.mjs" --clean "C:\Temp\gs-try-abc"`))
  assert.ok(cmds.includes("Stop-Process -Id 4242"))
  assert.ok(cmds.includes(String.raw`powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Temp\gs-try-abc\try.ps1"`))
  assert.ok(cmds.includes(String.raw`Rename-Item -LiteralPath "C:\Temp\gs-try-abc\.config\geneseed\loops.json" -NewName loops.json.off`))
  assert.ok(cmds.includes(String.raw`Rename-Item -LiteralPath "C:\Temp\gs-try-abc\.config\opencode\AGENT.md" -NewName AGENT.md.off`))
})

test("try.mjs prints its commands through printedCommands, and never a bare 'node scripts' line", async () => {
  const fs = await import("node:fs")
  const src = fs.readFileSync(new URL("../scripts/try.mjs", import.meta.url), "utf8")
  assert.match(src, /printedCommands\(/)
  assert.match(src, /cleanHome\(/)
  for (const line of src.split("\n")) {
    if (/^\s*\/\//.test(line)) continue
    assert.doesNotMatch(line, /node scripts[\/]/, line)
  }
})
