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
const src = fs.readFileSync(path.join(ext, "src/extension.js"), "utf8");
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
console.log(`ok: ${c.commands.length} commands, ${c.languages.length} languages, ${glyphs.length} glyphs`);
