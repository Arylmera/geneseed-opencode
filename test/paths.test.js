import { test } from "node:test"
import assert from "node:assert/strict"
import { cfgDir, machineDir, sameRoot, findInstall, carrierPaths } from "../src/paths.js"

test("cfgDir: OPENCODE_CONFIG_DIR, then XDG_CONFIG_HOME/opencode, then home", () => {
  assert.equal(cfgDir({ OPENCODE_CONFIG_DIR: "/a", XDG_CONFIG_HOME: "/x" }, "/h"), "/a")
  assert.equal(cfgDir({ XDG_CONFIG_HOME: "/x" }, "/h"), "/x/opencode")
  assert.equal(cfgDir({}, "/h"), "/h/.config/opencode")
})

test("machineDir: XDG_CONFIG_HOME/geneseed, else home", () => {
  assert.equal(machineDir({ XDG_CONFIG_HOME: "/x" }, "/h"), "/x/geneseed")
  assert.equal(machineDir({}, "/h"), "/h/.config/geneseed")
})

test("sameRoot: case-insensitive on win32 only", () => {
  assert.equal(sameRoot("c:\\Repo", "C:/repo", "win32"), true)
  assert.equal(sameRoot("/Repo", "/repo", "linux"), false)
  assert.equal(sameRoot("/repo/", "/repo", "linux"), true)
})

const MAN = ".opencode/.geneseed-manifest.json"
test("findInstall: manifest in a parent gives project", () => {
  const exists = (p) => p === "/r/" + MAN
  assert.deepEqual(findInstall("/r/a/b", "/cfg", exists), { kind: "project", root: "/r" })
})
test("findInstall: none gives global at cfg", () => {
  assert.deepEqual(findInstall("/r/a", "/cfg", () => false), { kind: "global", root: "/cfg" })
})
test("findInstall: stops at the git root", () => {
  const exists = (p) => p === "/r/.git" || p === "/" + MAN
  assert.deepEqual(findInstall("/r/a", "/cfg", exists), { kind: "global", root: "/cfg" })
})
test("findInstall: manifest at the git root is found", () => {
  const exists = (p) => p === "/r/.git" || p === "/r/" + MAN
  assert.deepEqual(findInstall("/r/a", "/cfg", exists), { kind: "project", root: "/r" })
})
test("findInstall: windows paths walk to the drive root", () => {
  const exists = (p) => p === "C:\\r\\" + MAN.replace(/\//g, "\\")
  assert.deepEqual(findInstall("C:\\r\\a", "C:\\cfg", exists), { kind: "project", root: "C:\\r" })
  assert.deepEqual(findInstall("C:\\q\\a", "C:\\cfg", () => false), { kind: "global", root: "C:\\cfg" })
})

test("carrierPaths: GENESEED_HARNESS first, then global cfg or project root", () => {
  assert.deepEqual(carrierPaths({ GENESEED_HARNESS: "/h" }, { kind: "global", root: "/cfg" }, "/cfg"), ["/h/AGENT.md", "/cfg/AGENT.md"])
  assert.deepEqual(carrierPaths({}, { kind: "global", root: "/cfg" }, "/cfg"), ["/cfg/AGENT.md"])
  assert.deepEqual(carrierPaths({}, { kind: "project", root: "/r" }, "/cfg"), ["/r/AGENT.md"])
})
