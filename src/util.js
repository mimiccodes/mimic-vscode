// The parts of the extension that do not need VS Code (tested by
// scripts/check.mjs).

/** Is version `a` newer than `b` (`0.3.5` > `0.3.4`)? */
function newer(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

/** `fn main(`, and `test "name"` (the name, with its escapes). */
const MAIN = /^\s*(pub\s+)?fn\s+main\s*\(/;
const TEST = /^\s*test\s+"((?:[^"\\]|\\.)*)"/;

/** The tests of a file: `test "…"` blocks and examples in comments. */
function testsIn(text) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    const t = TEST.exec(line);
    if (t) out.push({ name: t[1], line: i });
    const ex = /^\s*\/\/ > (.*)$/.exec(line);
    if (ex) out.push({ name: `example on line ${i + 1}`, line: i });
  });
  return out;
}

/** `  ✓ name` / `  ✗ name` lines of `mimic test`, with the lines under a failure. */
function parseTestOutput(text) {
  const results = new Map();
  let current;
  for (const line of text.split("\n")) {
    const m = /^\s*([✓✗])\s+(.*)$/.exec(line);
    if (m) {
      current = { ok: m[1] === "✓", detail: [] };
      results.set(m[2].trim(), current);
    } else if (current && !current.ok && /^\s{4,}\S/.test(line)) {
      current.detail.push(line.trim());
    } else if (!/^\s{4,}/.test(line)) {
      current = undefined;
    }
  }
  return results;
}

module.exports = { newer, MAIN, TEST, testsIn, parseTestOutput };
