// A segment's OpenTUI style from the theme. Pure, so it is tested without OpenTUI.
//
// Theme roles of @opencode/theme 2.3.2 ResolvedTheme. The keys read here (text.base, text.muted,
// text.feedback.<role>.base, hue.accent[200], background.base) are not checked against every
// host: the Rust client runs plugins through a compatibility layer. So each one may be missing,
// and a missing one never hides a segment: a role colour falls back to text.base, then to the
// terminal's own colour (no fg at all).

/** @typedef {"text"|"muted"|"success"|"warning"|"error"|"accent"} Role */

/**
 * The colour of a role, or undefined when the theme does not have it.
 * accent is the hue OpenCode's own prompt uses (@opencode/theme 2.3.2 syntax.js: hue.accent[200]).
 * @param {any} theme context.theme
 * @param {Role} role
 */
export function roleColor(theme, role) {
  const t = theme?.text
  if (role === "success" || role === "warning" || role === "error") return t?.feedback?.[role]?.base
  if (role === "accent") return theme?.hue?.accent?.[200]
  return role === "muted" ? t?.muted : t?.base
}

const given = (v) => v !== undefined && v !== null && v !== ""

/**
 * The style of a segment. An inverse segment is the page colour on its role's colour, set
 * explicitly rather than through the inverse attribute (which would swap with a transparent
 * background), and only when both resolve; else it is drawn as the role colour on no background,
 * so GUARD OFF never goes invisible. No key is left undefined.
 * @param {any} theme context.theme
 * @param {{ role: Role, bold?: boolean, inverse?: boolean }} s
 * @returns {{ fg?: unknown, bg?: unknown, bold?: boolean }}
 */
export function styleOf(theme, s) {
  const own = roleColor(theme, s.role)
  const fg = given(own) ? own : theme?.text?.base
  const page = theme?.background?.base
  /** @type {{ fg?: unknown, bg?: unknown, bold?: boolean }} */
  const out = {}
  if (s.inverse && given(page) && given(own)) {
    out.fg = page
    out.bg = own
  } else if (given(fg)) out.fg = fg
  if (s.bold) out.bold = true
  return out
}
