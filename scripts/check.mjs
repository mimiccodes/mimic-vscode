// Checks that need no VS Code: the manifest points at files that exist,
// the grammars and glyph table parse, and the helpers behave.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ext, "package.json"), "utf8"));
const c = pkg.contributes;
const exists = (p) => assert.ok(fs.existsSync(path.join(ext, p)), `missing ${p}`);

exists(pkg.main);
exists(pkg.icon);
for (const l of c.languages) {
  exists(l.configuration);
  exists(l.icon.light);
  JSON.parse(fs.readFileSync(path.join(ext, l.configuration), "utf8"));
}
for (const g of c.grammars) {
  const grammar = JSON.parse(fs.readFileSync(path.join(ext, g.path), "utf8"));
  assert.equal(grammar.scopeName, g.scopeName, g.path);
}
for (const s of c.snippets) JSON.parse(fs.readFileSync(path.join(ext, s.path), "utf8"));
const commands = new Set(c.commands.map((x) => x.command));
const src = fs.readdirSync(path.join(ext, "src")).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(ext, "src", f), "utf8")).join("\n");
for (const cmd of commands) assert.ok(src.includes(`"${cmd}"`), `command ${cmd} is not registered`);
for (const k of c.keybindings) assert.ok(commands.has(k.command), k.command);

const glyphs = require(path.join(ext, "src/glyphs.json"));
assert.ok(glyphs.length >= 40, "glyph table");
assert.ok(glyphs.some((g) => g.glyph === "⍳" && g.word === "iota" && g.digraph === "\\i"));

const u = require(path.join(ext, "src/util.js"));
assert.equal(u.newer("0.3.5", "0.3.4"), true);
assert.equal(u.newer("0.2.9", "0.3.4"), false);
assert.equal(u.newer("0.3.4", "0.3.4"), false);
assert.ok(u.MAIN.test("pub fn main() {"));
assert.deepEqual(u.testsIn('test "adds \\"x\\"" {\n}\n// > f(1)\n// 2').map((t) => t.name), ['adds \\"x\\"', "example on line 3"]);
const r = u.parseTestOutput("     Testing 2 tests\n  ✓ square\n  ✗ a wrong one\n      line 13: expect(square(2) == 5)\n        left:  4\n        right: 5\n  1 passed, 1 failed (0.01 s)\n");
assert.equal(r.get("square").ok, true);
assert.equal(r.get("a wrong one").ok, false);
assert.deepEqual(r.get("a wrong one").detail, ["line 13: expect(square(2) == 5)", "left:  4", "right: 5"]);
for (const w of c.walkthroughs || []) for (const st of w.steps) if (st.media.markdown) exists(st.media.markdown);
assert.equal(u.parseVersion("mimic 0.2.9 (58aa56c42, LLVM 23.1.4)"), "0.2.9");
const cmds = u.parseCommands("Usage: mimic <COMMAND>\n\nCommands:\n  create     Create\n  lsp        The language server\n  help       Print\n\nOptions:\n  -h, --help\n");
assert.deepEqual([...cmds], ["create", "lsp", "help"]);
assert.equal(u.platformTag("darwin", "arm64"), "macos-arm64");
assert.equal(u.platformTag("darwin", "x64"), undefined);
assert.equal(u.assetName("0.3.0", "windows-x86_64"), "mimic-0.3.0-windows-x86_64.zip");
assert.equal(u.assetName("0.3.0", "linux-x86_64"), "mimic-0.3.0-linux-x86_64.tar.gz");
assert.equal(u.sumFor("aa".repeat(32) + "  mimic-0.3.0-linux-x86_64.tar.gz\n" + "bb".repeat(32) + " *SHA256SUMS", "mimic-0.3.0-linux-x86_64.tar.gz"), "aa".repeat(32));
const probs = u.checkProblems({ diagnostics: [{ code: "E0303", severity: "error", message: "cannot find `nope`", help: [], notes: [], location: { file: "src/main.mim", start: { line: 4, column: 11 }, end: { line: 4, column: 15 } } }, { code: "E0901", severity: "error", message: "x", location: null }] }, "/p");
assert.equal(probs.length, 1);
assert.deepEqual([probs[0].file, probs[0].start, probs[0].end], [path.join("/p", "src/main.mim"), [3, 10], [3, 14]]);
assert.equal(u.due(0, 5), true);
assert.equal(u.due(Date.now() - 1000, Date.now()), false);
// finding mimic: not on PATH, no login shell, but where the installer puts it
if (process.platform !== "win32") {
  const os = await import("node:os");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mimic-find-"));
  fs.mkdirSync(path.join(home, "bin"));
  const fake = path.join(home, "bin", "mimic");
  fs.writeFileSync(fake, '#!/bin/sh\ncase "$1" in\n--version) echo "mimic 0.2.9 (abc, LLVM 23.1.4)";;\n--help) printf "Usage: mimic <COMMAND>\\n\\nCommands:\\n  run   Run\\n  check  Check\\n\\nOptions:\\n";;\nesac\n');
  fs.chmodSync(fake, 0o755);
  const saved = { PATH: process.env.PATH, SHELL: process.env.SHELL, MIMIC_HOME: process.env.MIMIC_HOME, HOME: process.env.HOME };
  // (HOME too: a real ~/.mimic/bin/mimic must not be found)
  Object.assign(process.env, { PATH: "/nonexistent", SHELL: "/usr/bin/false", MIMIC_HOME: home, HOME: home });
  const { locate } = require(path.join(ext, "src/mimic.js"));
  const f = await locate(undefined);
  assert.equal(f.path, fake, JSON.stringify(f));
  assert.equal(f.version, "0.2.9");
  assert.ok(f.commands.has("check") && !f.commands.has("lsp"));
  const bad = await locate("/nonexistent/mimic");
  assert.ok(bad.missing && bad.setting === "/nonexistent/mimic");
  process.env.MIMIC_HOME = path.join(home, "nothing-here");
  assert.ok((await locate(undefined)).missing, "nothing to find");
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  fs.rmSync(home, { recursive: true, force: true });
}
console.log(`ok: ${c.commands.length} commands, ${c.languages.length} languages, ${glyphs.length} glyphs`);
