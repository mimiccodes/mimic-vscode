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

/** `mimic 0.2.9 (58aa56c42, LLVM 23.1.4)` → `0.2.9`. */
function parseVersion(text) {
  const m = /mimic (\d+\.\d+\.\d+)/.exec(text || "");
  return m ? m[1] : undefined;
}

/** The subcommands `mimic --help` lists (what this mimic can do). */
function parseCommands(help) {
  const out = new Set();
  let inside = false;
  for (const line of (help || "").split(/\r?\n/)) {
    if (/^Commands:/.test(line)) {
      inside = true;
      continue;
    }
    if (inside) {
      const m = /^ {2}([a-z][a-z0-9-]*)\b/.exec(line);
      if (m) out.add(m[1]);
      else if (line.trim() && !/^\s/.test(line)) break;
    }
  }
  return out;
}

/** The release package for this machine (`macos-arm64`, …), if there is one. */
function platformTag(platform, arch) {
  if (platform === "darwin" && arch === "arm64") return "macos-arm64";
  if (platform === "linux" && arch === "x64") return "linux-x86_64";
  if (platform === "win32" && arch === "x64") return "windows-x86_64";
  return undefined;
}

function assetName(version, tag) {
  return `mimic-${version}-${tag}${tag.startsWith("windows") ? ".zip" : ".tar.gz"}`;
}

/** The SHA-256 a `SHA256SUMS` file gives for `name`. */
function sumFor(sums, name) {
  for (const line of (sums || "").split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line.trim());
    if (m && m[2].trim() === name) return m[1];
  }
  return undefined;
}

/** `mimic check --emit-json` → problems: file, 0-based range, severity. */
function checkProblems(json, cwd) {
  const out = [];
  for (const d of (json && json.diagnostics) || []) {
    const loc = d.location;
    if (!loc || !loc.file) continue;
    const file = require("path").isAbsolute(loc.file) ? loc.file : require("path").join(cwd || "", loc.file);
    const help = [...(d.help || []), ...(d.notes || [])].join("\n");
    out.push({
      file,
      start: [Math.max(0, loc.start.line - 1), Math.max(0, loc.start.column - 1)],
      end: [Math.max(0, loc.end.line - 1), Math.max(0, loc.end.column - 1)],
      severity: d.severity === "error" ? "error" : "warning",
      code: d.code,
      message: help ? `${d.message}\n${help}` : d.message,
    });
  }
  return out;
}

/** Once a day: is `last` (ms) at least `every` ms before `now`? */
function due(last, now, every = 24 * 3600 * 1000) {
  return !last || now - last >= every;
}

/** Each function's change in share (self) from profile `a` to `b`. */
function compareProfiles(a, b) {
  const key = (f) => f.function + (f.part ? `#${f.part}` : "");
  const before = new Map((a.functions || []).map((f) => [key(f), f.self]));
  const out = new Map();
  for (const f of b.functions || []) out.set(key(f), f.self - (before.get(key(f)) || 0));
  return out;
}

/** How a share of time is marked in the code. */
function heatOf(share) {
  if (share >= 0.25) return { icon: "🔥", color: "#E24B04" };
  if (share >= 0.05) return { icon: "●", color: "#E8A33D" };
  return { icon: "○", color: "#888888" };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/**
 * What a failed test's lines say: the lines they point at (`line 16: …`,
 * a broken contract's `(line 4)`), and a property's smallest failing case
 * (`x = 100`).
 */
function failureFacts(detail) {
  const at = [];
  let counterexample;
  for (const l of detail || []) {
    const m = /^\s*line (\d+): (.*)$/.exec(l);
    if (m) at.push({ line: Number(m[1]), text: m[2] });
    const c = /\(line (\d+)\)/.exec(l);
    if (c && /contract/.test(l)) at.push({ line: Number(c[1]), text: l.replace(/^\s*mimic panic:\s*/, "") });
    const k = /smallest failing case: (.*)$/.exec(l);
    if (k) counterexample = k[1].trim();
  }
  return { at, counterexample };
}

/** Split `x = 1, ys = [1 2], s = "a, b"` at the commas between values. */
function splitValues(text) {
  const out = [];
  let depth = 0, inside = false, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && text[i - 1] !== "\\") inside = !inside;
    else if (!inside && "([{".includes(c)) depth++;
    else if (!inside && ")]}".includes(c)) depth--;
    else if (!inside && depth === 0 && c === ",") {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (text.slice(start).trim()) out.push(text.slice(start).trim());
  return out;
}

/**
 * A property test's failing case as a test of its own: the property's body
 * with its variables bound to the case. `lines` is the file, `at` the line
 * of `test "…" for …`. Returns { line: where to insert, text } or undefined.
 */
function caseAsTest(lines, at, counterexample) {
  const head = /^(\s*)test\s+"((?:[^"\\]|\\.)*)"\s+for\s+.*\{\s*$/.exec(lines[at] || "");
  if (!head) return undefined;
  const indent = head[1];
  let depth = 0, end = -1;
  for (let i = at; i < lines.length && end < 0; i++) {
    for (const c of lines[i]) {
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return undefined;
  const body = lines.slice(at + 1, end);
  const lets = splitValues(counterexample).map((v) => `${indent}    let ${v.replace(/\s*=\s*/, " = ")}`);
  const text = [``, `${indent}test "${head[2]}: ${counterexample.replace(/"/g, "'")}" {`, ...lets, ...body, `${indent}}`].join("\n");
  return { line: end, text };
}

/**
 * A list or matrix as the debugger shows Mimic values: `[3 1 4]`,
 * `[[1 2] [3 4]]`, `[1.5 -2 3e2]` → rows of numbers; undefined otherwise.
 */
function parseArray(text) {
  const t = String(text || "").trim();
  if (!t.startsWith("[") || !t.endsWith("]")) return undefined;
  const inner = t.slice(1, -1).trim();
  const num = (x) => {
    const v = Number(x.replace(/^¯/, "-"));
    return Number.isFinite(v) ? v : undefined;
  };
  if (inner.startsWith("[")) {
    const rows = [...inner.matchAll(/\[([^\[\]]*)\]/g)].map((m) => m[1].trim().split(/[\s,]+/).filter(Boolean).map(num));
    return rows.length && rows.every((r) => r.every((x) => x !== undefined)) ? rows : undefined;
  }
  const row = inner.split(/[\s,]+/).filter(Boolean).map(num);
  return row.length && row.every((x) => x !== undefined) ? [row] : undefined;
}

module.exports = { parseArray, failureFacts, splitValues, caseAsTest, compareProfiles, heatOf, escapeHtml, newer, MAIN, TEST, testsIn, parseTestOutput, parseVersion, parseCommands, platformTag, assetName, sumFor, checkProblems, due };
