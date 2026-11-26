import { test } from "node:test"
import assert from "node:assert/strict"
import { roleColor, styleOf } from "../src/style.js"

const THEME = {
  text: { base: "#ddd", muted: "#888", feedback: { success: { base: "#0f0" }, warning: { base: "#fa0" }, error: { base: "#f00" } } },
  hue: { accent: { 200: "#a8f" } },
  background: { base: "#111" },
}
const BAR = { role: "error", inverse: true }

test("roleColor: each role from its theme key", () => {
  assert.deepEqual(
    ["text", "muted", "success", "warning", "error", "accent"].map((r) => roleColor(THEME, r)),
    ["#ddd", "#888", "#0f0", "#fa0", "#f00", "#a8f"],
  )
})

test("styleOf: the inverse bar is the page colour on the role colour when both resolve", () => {
  assert.deepEqual(styleOf(THEME, BAR), { fg: "#111", bg: "#f00" })
  assert.deepEqual(styleOf(THEME, { role: "accent", bold: true }), { fg: "#a8f", bold: true })
})

test("styleOf: no background colour: the bar is the role colour on no background", () => {
  const { background, ...noPage } = THEME
  assert.deepEqual(styleOf(noPage, BAR), { fg: "#f00" })
})

test("styleOf: no role colour: text.base, for the bar too, never an invisible segment", () => {
  const { feedback, ...text } = THEME.text
  const noFeedback = { ...THEME, text }
  assert.deepEqual(styleOf(noFeedback, BAR), { fg: "#ddd" })
  assert.deepEqual(styleOf(noFeedback, { role: "warning" }), { fg: "#ddd" })
  const { hue, ...noHue } = THEME
  assert.deepEqual(styleOf(noHue, { role: "accent", bold: true }), { fg: "#ddd", bold: true })
})

test("styleOf: no theme at all: the terminal's own colour, no undefined key", () => {
  assert.deepEqual(styleOf(undefined, BAR), {})
  assert.deepEqual(styleOf({}, { role: "muted", bold: true }), { bold: true })
  for (const s of [styleOf(undefined, BAR), styleOf({ text: {} }, { role: "text" })]) assert.ok(Object.values(s).every((v) => v !== undefined))
})
