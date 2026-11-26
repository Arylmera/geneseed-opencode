// Text the model or a file wrote, made safe to draw in a row. Two entry points, one rule set:
// - every control character (\p{Cc}: ESC, BEL, ...) and every format character (\p{Cf}: the bidi
//   overrides and isolates U+202A-202E and U+2066-2069, U+FEFF, soft hyphen, tag characters, ...)
//   is dropped, except U+200D ZERO WIDTH JOINER, which holds an emoji sequence together
//   (src/width.js counts a joined cluster as 2 columns);
// - every remaining whitespace character (\n \r \t \v \f, U+2028, U+3000, ...) is a space.
// Dropped before mapped, so U+FEFF (both whitespace and format to JS) is dropped, not a space.

// Cc and Cf, but not ZWJ and not the Cc characters that are whitespace (mapped to a space below).
const DROP = /(?!\u200D)(?![\t\n\v\f\r])[\p{Cc}\p{Cf}]/gu

/**
 * Character for character: dropped or one space, no run collapsed and nothing trimmed, so indents
 * and padding keep their width. src/panel.js runs every segment's text through it.
 * @param {string} t
 */
export const strip = (t) => String(t).replace(DROP, "").replace(/\s/g, " ")

/**
 * One line of text: strip, then each run of spaces is one space, the ends trimmed. The readers run
 * every piece of model or file text through it before it becomes a row's label.
 * @param {string} t
 */
export const clean = (t) => strip(t).replace(/ {2,}/g, " ").trim()
