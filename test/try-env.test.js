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
