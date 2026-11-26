// Display width in terminal columns, with no dependency: what a row measures, what a cut keeps.
// Wide (East Asian Wide and Fullwidth, emoji) is 2; combining marks, joiners and variation
// selectors are 0; a grapheme cluster is measured and cut whole.

/** The panel's own glyphs, drawn 1 column wide as OpenTUI draws them (some are ambiguous width). */
const ONE = new Set(["●", "○", "✓", "–", "▲", "■", "◐", "↺", "↻", "⚙", "◆", "⌕", "─", "·", "…"])

const ZERO = /^[\p{Mn}\p{Me}\p{Cf}\p{Cc}]$/u
const PICTO = /\p{Extended_Pictographic}/u
// East Asian Wide and Fullwidth blocks, and the regional indicators a flag pairs.
const WIDE = [
  [0x1100, 0x115f], [0x231a, 0x231b], [0x2329, 0x232a], [0x2e80, 0x303e], [0x3041, 0x33ff],
  [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xa960, 0xa97f], [0xac00, 0xd7a3],
  [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6],
  [0x1f1e6, 0x1f1ff], [0x1f300, 0x1f64f], [0x1f900, 0x1f9ff], [0x20000, 0x2fffd], [0x30000, 0x3fffd],
]
const isWide = (cp) => WIDE.some(([a, b]) => cp >= a && cp <= b)

const segmenter = typeof Intl === "object" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter() : null

/**
 * The grapheme clusters of s. Intl.Segmenter when there is one; else code points, each zero-width
 * one (and the one after a joiner) kept with the one before.
 * @param {string} s
 * @returns {string[]}
 */
export function graphemes(s) {
  const str = String(s)
  if (segmenter) return Array.from(segmenter.segment(str), (x) => x.segment)
  const out = []
  for (const c of str) {
    if (out.length && (ZERO.test(c) || out[out.length - 1].endsWith("‍"))) out[out.length - 1] += c
    else out.push(c)
  }
  return out
}

/**
 * The columns one grapheme cluster takes: 0, 1 or 2.
 * @param {string} g
 */
export function clusterCols(g) {
  if (ONE.has(g)) return 1
  let any = false
  for (const c of g) {
    if (ZERO.test(c)) continue
    if (PICTO.test(c) || isWide(c.codePointAt(0))) return 2
    any = true
  }
  return any ? 1 : 0
}

/**
 * The columns s takes in a terminal.
 * @param {string} s
 */
export function cols(s) {
  let n = 0
  for (const g of graphemes(s)) n += clusterCols(g)
  return n
}
