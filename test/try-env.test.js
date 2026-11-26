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

const cleanFakes = (o = {}) => {
  const f = { renamed: [], removed: [], out: [], err: [] }
  f.opts = {
    rename: (a, b) => { f.renamed.push([a, b]) },
    remove: (d) => { f.removed.push(d) },
    log: (s) => f.out.push(s),
    error: (s) => f.err.push(s),
    script: String.raw`C:\repo\scripts\try.mjs`,
    random: () => "k3j9",
    ...o,
  }
  return f
}
const HOME_X = String.raw`C:\Temp\gs-try-abc`

test("cleanHome: a held home (the rename fails) deletes nothing, says so with the full command, exits 1", async () => {
  const { cleanHome } = await import("../scripts/try-env.mjs")
  for (const code of ["EBUSY", "EPERM", "EACCES"]) {
    const f = cleanFakes({ rename: () => { throw Object.assign(new Error(code), { code }) } })
    assert.equal(cleanHome(HOME_X, f.opts), 1, code)
    assert.deepEqual(f.removed, [], code)
    assert.deepEqual(f.err, [
      "clean: something still holds this home (OpenCode, or a shell whose folder is inside it). Close it, then run this again:",
      String.raw`  node "C:\repo\scripts\try.mjs" --clean "C:\Temp\gs-try-abc"`,
    ], code)
  }
})

test("cleanHome: the home is renamed to a sibling .del-<random>, then that folder is removed", async () => {
  const { cleanHome } = await import("../scripts/try-env.mjs")
  const f = cleanFakes()
  assert.equal(cleanHome(HOME_X, f.opts), 0)
  assert.deepEqual(f.renamed, [[HOME_X, `${HOME_X}.del-k3j9`]])
  assert.deepEqual(f.removed, [`${HOME_X}.del-k3j9`])
  assert.deepEqual(f.out, [`removed ${HOME_X}`])
})

test("cleanHome: rename ok, delete fails: names the .del folder that is left and that the home is gone", async () => {
  const { cleanHome } = await import("../scripts/try-env.mjs")
  const boom = Object.assign(new Error("x"), { code: "EPERM", path: `${HOME_X}.del-k3j9\\.cache` })
  const f = cleanFakes({ remove: () => { throw boom } })
  assert.equal(cleanHome(HOME_X, f.opts), 1)
  assert.equal(f.err[0], `clean: could not remove ${HOME_X}.del-k3j9\\.cache (EPERM)`)
  const rest = f.err.slice(1).join("\n")
  assert.ok(rest.includes("The home itself is gone"), rest)
  assert.ok(rest.includes(`${HOME_X}.del-k3j9 is left`), rest)
  assert.ok(rest.includes(String.raw`node "C:\repo\scripts\try.mjs" --clean "C:\Temp\gs-try-abc.del-k3j9"`), rest)
})

test("cleanHome: a leftover .del folder is removed as it is, no second rename", async () => {
  const { cleanHome } = await import("../scripts/try-env.mjs")
  const f = cleanFakes()
  assert.equal(cleanHome(`${HOME_X}.del-k3j9`, f.opts), 0)
  assert.deepEqual(f.renamed, [])
  assert.deepEqual(f.removed, [`${HOME_X}.del-k3j9`])
})

test("cleanHome: a rename error that is not a lock is one line with the path and code", async () => {
  const { cleanHome } = await import("../scripts/try-env.mjs")
  const f = cleanFakes({ rename: () => { throw Object.assign(new Error("x"), { code: "ENOENT" }) } })
  assert.equal(cleanHome(HOME_X, f.opts), 1)
  assert.deepEqual(f.err, [`clean: could not rename ${HOME_X} (ENOENT)`])
})

test("isCleanTarget: a gs-try home or its .del leftover directly under the temp dir, nothing else", async () => {
  const { isCleanTarget } = await import("../scripts/try-env.mjs")
  const T = String.raw`C:\Users\g\AppData\Local\Temp`
  const yes = (p, tmp = T) => assert.equal(isCleanTarget(p, tmp), true, p)
  const no = (p, tmp = T) => assert.equal(isCleanTarget(p, tmp), false, p)
  yes(`${T}\\gs-try-abc`)
  yes(`${T}\\gs-try-abc.del-k3j9`)
  yes(String.raw`c:\users\G\appdata\local\temp\gs-try-abc`)
  yes(`${T}\\gs-try-abc`, `${T}\\`)
  no(`${T}\\gs-try-abc.del-x.del-y`)
  no(`${T}\\gs-try-abc.del-`)
  no(`${T}\\gs-try-`)
  no(`${T}\\gs-try-abc.bak`)
  no(`${T}\\other`)
  no(`${T}\\gs-try-abc\\..`)
  no(`${T}\\gs-try-abc\\..\\evil`)
  no(`${T}\\sub\\gs-try-abc`)
  no(String.raw`C:\Other\gs-try-abc`)
  no(`${T}\\gs-try-abc\\project`)
})

test("try.mjs --clean runs the guard before it removes anything", async () => {
  const fs = await import("node:fs")
  const src = fs.readFileSync(new URL("../scripts/try.mjs", import.meta.url), "utf8")
  assert.ok(src.indexOf("isCleanTarget(") >= 0 && src.indexOf("isCleanTarget(") < src.indexOf("cleanHome(real"))
})

test("every command try.mjs prints runs from any folder: absolute paths, none starting 'node scripts'", async () => {
  const { printedCommands } = await import("../scripts/try-env.mjs")
  const home = String.raw`C:\Temp\gs-try-abc`
  const cmds = printedCommands({ script: String.raw`C:\repo\scripts\try.mjs`, home, pid: 4242 })
  assert.ok(cmds.length >= 5)
  for (const c of cmds) {
    assert.doesNotMatch(c, /^\s*node\s+scripts/, c)
    const quoted = [...c.matchAll(/"([^"]*)"/g)].map((m) => m[1])
    for (const q of quoted) assert.ok(path.win32.isAbsolute(q), `${q} in: ${c}`)
  }
  assert.ok(cmds.filter((c) => c.includes('"')).length >= 4)
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
