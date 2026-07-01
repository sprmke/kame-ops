// @ts-nocheck
/**
 * Grouped, colorized CLI output (TTY). Matches style of terminal utility scripts.
 * Set NO_COLOR=1 or run with non-TTY stdout to disable ANSI codes.
 */

const useColor =
  process.stdout.isTTY && !process.env.NO_COLOR && !process.env.CI;

export const colorsEnabled = useColor;

const B = (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s);
const dim = (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s);
const cyan = (s: string) => (useColor ? `\x1b[36m${s}\x1b[0m` : s);

const icon = (c: string, sym: string) => `${c}${sym}\x1b[0m  `;

export const log = {
  /** Section divider */
  header(title: string) {
    console.log("");
    console.log(`${B(cyan("──"))} ${B(cyan(title))} ${B(cyan("──"))}`);
    console.log("");
  },

  info(msg: string) {
    console.log(`${useColor ? icon("\x1b[34m", "ℹ") : "ℹ  "}${msg}`);
  },

  success(msg: string) {
    console.log(`${useColor ? icon("\x1b[32m", "✓") : "✓  "}${msg}`);
  },

  warn(msg: string) {
    console.log(`${useColor ? icon("\x1b[33m", "⚠") : "⚠  "}${msg}`);
  },

  error(msg: string) {
    console.log(`${useColor ? icon("\x1b[31m", "✗") : "✗  "}${msg}`);
  },

  /** Secondary detail line (indented, dim) */
  detail(msg: string) {
    console.log(`  ${dim(msg)}`);
  },

  /** Label: value on one line */
  kv(label: string, value: string) {
    console.log(`  ${dim(label + ":")} ${value}`);
  },

  /** Raw line (no prefix) */
  line(msg: string) {
    console.log(msg);
  },

  dim,
  bold: B,
  cyan,

  /** Prefix for readline-style prompts (blue ?) */
  questionPrefix() {
    return useColor ? "\x1b[34m?\x1b[0m  " : "?  ";
  },
};

export function logBanner(title: string, subtitle?: string) {
  console.log("");
  if (useColor) {
    console.log(`\x1b[1m\x1b[36m╔══════════════════════════════════════════╗\x1b[0m`);
    console.log(
      `\x1b[1m\x1b[36m║\x1b[0m  ${B(title.padEnd(38))}  \x1b[1m\x1b[36m║\x1b[0m`
    );
    console.log(`\x1b[1m\x1b[36m╚══════════════════════════════════════════╝\x1b[0m`);
  } else {
    console.log(`=== ${title} ===`);
  }
  if (subtitle) {
    console.log(dim(`  ${subtitle}`));
  }
  console.log("");
}
