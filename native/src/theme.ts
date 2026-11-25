// The one place for colours and type in the native app. Values are carried from app/globals.css.
export const colors = {
  bg: "#151820",
  card: "#12151c",
  line: "#2a2f3c",
  text: "#ffffff",
  muted: "#a1a0a3",
  accent: "#105dfb",
  accentInk: "#ffffff",
  /** The brand blue, lightened to stay readable as text. */
  accentText: "#6c9bff",
  slate: "#384c62",
  good: "#58c98d",
  warn: "#e65454",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12 } as const;

export const type = {
  h1: { color: colors.text, fontSize: 28, fontWeight: "600", lineHeight: 34 },
  h2: { color: colors.text, fontSize: 20, fontWeight: "600", lineHeight: 26 },
  body: { color: colors.text, fontSize: 16, lineHeight: 25 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
} as const;
