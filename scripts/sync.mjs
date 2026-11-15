// Copy the grammars from mimic-syntax and the glyph table from the
// compiler into the extension. Run inside the mimic repository, where
// this extension is the submodule editors/vscode:
//
//   node scripts/sync.mjs            (or: npm run sync)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ext = path.resolve(here, "..");
const syntax = path.resolve(ext, "../syntax");
const mimic = path.resolve(ext, "../..");

for (const [from, to] of [
  ["grammars/mimic.tmLanguage.json", "syntaxes/mimic.tmLanguage.json"],
  ["grammars/mimic-net.tmLanguage.json", "syntaxes/mimic-net.tmLanguage.json"],
  ["language-configuration.json", "language-configuration.json"],
  ["language-configuration-net.json", "language-configuration-net.json"],
]) {
  fs.copyFileSync(path.join(syntax, from), path.join(ext, to));
}

// the glyph table, from crates/mimic-syntax/src/glyphs.rs
const rs = fs.readFileSync(path.join(mimic, "crates/mimic-syntax/src/glyphs.rs"), "utf8");
const str = (s) => (s === undefined ? null : JSON.parse(`"${s}"`));
const glyphs = [];
const prim = /PrimInfo \{ prim: Prim::\w+, glyph: "((?:[^"\\]|\\.)*)", word: "((?:[^"\\]|\\.)*)", digraph: (?:Some\("((?:[^"\\]|\\.)*)"\)|None), ascii: (?:Some\("((?:[^"\\]|\\.)*)"\)|None), arity: (\d+), doc: "((?:[^"\\]|\\.)*)" \}/g;
for (const m of rs.matchAll(prim)) {
  glyphs.push({ glyph: str(m[1]), word: str(m[2]), digraph: str(m[3]), kind: "primitive", doc: str(m[6]) });
}
const syn = /SyntaxGlyph \{ glyph: "((?:[^"\\]|\\.)*)", word: "((?:[^"\\]|\\.)*)", digraph: (?:Some\("((?:[^"\\]|\\.)*)"\)|None), doc: "((?:[^"\\]|\\.)*)" \}/g;
for (const m of rs.matchAll(syn)) {
  glyphs.push({ glyph: str(m[1]), word: str(m[2]), digraph: str(m[3]), kind: "syntax", doc: str(m[4]) });
}
if (glyphs.length < 40) throw new Error(`only ${glyphs.length} glyphs found in glyphs.rs`);
fs.writeFileSync(path.join(ext, "src/glyphs.json"), JSON.stringify(glyphs, null, 2) + "\n");
console.log(`synced the grammars and ${glyphs.length} glyphs`);
