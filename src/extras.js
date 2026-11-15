// The rest of the workbench in VS Code: glyphs as you type and the Glyphs
// view, the project's modules, mim.mim, tasks and a target for them,
// `mimic audit` in Problems, the docs and the UI of a program in VS Code,
// examples of the manual that run, and `mimic mcp` for agents.

const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");
const setup = require("./setup");
const { exec } = require("./mimic");
const GLYPHS = require("./glyphs.json");
const { escapeHtml } = require("./util");

function config() {
  return vscode.workspace.getConfiguration("mimic");
}

function projectRoot(file) {
  let dir = file ? path.dirname(file) : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "mim.mim"))) return dir;
    dir = path.dirname(dir);
  }
  return undefined;
}

function activeFile() {
  const d = vscode.window.activeTextEditor?.document;
  return d && d.uri.scheme === "file" ? d.uri.fsPath : undefined;
}

// ---- glyphs as you type -------------------------------------------------------------------

const DIGRAPHS = new Map(GLYPHS.filter((g) => g.digraph).map((g) => [g.digraph, g.glyph]));

/** Is `before` (the line up to here) inside a string? */
function insideString(before) {
  let inside = false;
  for (let i = 0; i < before.length; i++) {
    if (before[i] === "\\" && inside) i++;
    else if (before[i] === '"') inside = !inside;
    else if (!inside && before[i] === "/" && before[i + 1] === "/") return true; // a comment
  }
  return inside;
}

let replacing = false;
async function glyphAsYouType(e) {
  if (replacing || e.document.languageId !== "mimic" || !config().get("glyphInput")) return;
  // (typed: one change of one character; the document need not be the
  // active editor's, a webview may have the focus)
  if (e.contentChanges.length !== 1) return;
  const ch = e.contentChanges[0];
  if (ch.text.length !== 1) return;
  const at = ch.range.start.translate(0, 1);
  if (at.character < 2) return;
  const line = e.document.lineAt(at.line).text;
  const two = line.slice(at.character - 2, at.character);
  const g = DIGRAPHS.get(two);
  if (!g || insideString(line.slice(0, at.character - 2))) return;
  replacing = true;
  try {
    const ed = vscode.window.visibleTextEditors.find((x) => x.document === e.document);
    const range = new vscode.Range(at.line, at.character - 2, at.line, at.character);
    if (ed) await ed.edit((b) => b.replace(range, g), { undoStopBefore: false, undoStopAfter: true });
    else {
      const we = new vscode.WorkspaceEdit();
      we.replace(e.document.uri, range, g);
      await vscode.workspace.applyEdit(we);
    }
  } finally {
    replacing = false;
  }
}

// ---- the Glyphs view ------------------------------------------------------------------------

class GlyphView {
  resolveWebviewView(view) {
    view.webview.options = { enableScripts: true };
    const groups = [
      ["Arrays", ["iota", "shape", "reshape", "reverse", "take", "drop", "keep", "len", "first", "transpose"]],
      ["Folds and maps", ["sum", "product", "max", "min", "each", "scan", "trail", "gather"]],
    ];
    const known = new Set(groups.flatMap((g) => g[1]));
    const card = (g) =>
      `<button class="g" data-glyph="${escapeHtml(g.glyph)}" title="${escapeHtml(`${g.word}${g.digraph ? `  (type ${g.digraph})` : ""}\n${g.doc}`)}"><span class="gl">${escapeHtml(g.glyph)}</span><span class="w">${escapeHtml(g.word)}</span></button>`;
    const sections = groups
      .map(([name, words]) => [name, words.map((w) => GLYPHS.find((g) => g.word === w)).filter(Boolean)])
      .concat([["Everything else", GLYPHS.filter((g) => !known.has(g.word))]])
      .map(([name, list]) => `<h3>${name}</h3><div class="grid">${list.map(card).join("")}</div>`)
      .join("");
    const nonce = Math.random().toString(36).slice(2);
    view.webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
body { font-family: var(--vscode-font-family); padding: 4px 8px; color: var(--vscode-foreground); }
h3 { font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em; color: var(--vscode-descriptionForeground); margin: 10px 0 4px; }
input { width: 100%; box-sizing: border-box; padding: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 4px; }
.g { display: flex; flex-direction: column; align-items: center; padding: 4px 2px; background: var(--vscode-editorWidget-background); color: var(--vscode-foreground); border: 1px solid var(--vscode-panel-border); border-radius: 4px; cursor: pointer; }
.g:hover { border-color: #E24B04; }
.gl { font-size: 1.5em; line-height: 1.2; font-family: var(--vscode-editor-font-family); color: #E24B04; }
.w { font-size: 0.75em; color: var(--vscode-descriptionForeground); overflow: hidden; text-overflow: ellipsis; max-width: 60px; white-space: nowrap; }
</style></head><body>
<input id="q" placeholder="Find a glyph: a word or what it does">
${sections}
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
document.querySelectorAll(".g").forEach((b) => b.addEventListener("click", () => vscode.postMessage({ glyph: b.dataset.glyph })));
document.getElementById("q").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll(".g").forEach((b) => (b.style.display = !q || b.title.toLowerCase().includes(q) || b.dataset.glyph === q ? "" : "none"));
});
</script></body></html>`;
    view.webview.onDidReceiveMessage(async (m) => {
      const ed = vscode.window.visibleTextEditors.find((e) => e.document.languageId === "mimic") || vscode.window.activeTextEditor;
      if (!ed || !m.glyph) return;
      await ed.edit((b) => ed.selections.forEach((s) => b.replace(s, m.glyph)));
      vscode.window.showTextDocument(ed.document, ed.viewColumn);
    });
  }
}

// ---- the project's modules --------------------------------------------------------------------

class Modules {
  constructor() {
    this.changed = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changed.event;
    this.tree = null;
  }
  getTreeItem(x) {
    return x;
  }
  async getChildren(parent) {
    if (parent) return parent.children || [];
    const root = projectRoot(activeFile());
    if (!root || setup.found().missing) return [new vscode.TreeItem("Open a Mimic project (a folder with mim.mim)")];
    const r = await exec(setup.mimicPath(), ["query", "symbols"], { cwd: root });
    let syms;
    try {
      syms = JSON.parse(r.stdout).symbols;
    } catch {
      return [new vscode.TreeItem("The project does not load: see Problems")];
    }
    const pkg = (syms.find((s) => s.location && s.location.file && s.location.file.startsWith(root)) || {}).package;
    const mods = new Map();
    for (const s of syms) {
      if (s.package !== pkg || !s.location || !s.location.file.startsWith(root)) continue;
      const mod = s.kind === "module" ? [s.path, s.name].filter(Boolean).join("::") : s.path.split("::").slice(0, -1).join("::");
      if (!mods.has(mod)) mods.set(mod, { file: s.location.file, items: [] });
      if (s.kind !== "module") mods.get(mod).items.push(s);
    }
    const icon = { fn: "symbol-function", type: "symbol-struct", module: "symbol-namespace", const: "symbol-constant" };
    return [...mods.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, m]) => {
        const it = new vscode.TreeItem(name || "main", vscode.TreeItemCollapsibleState.Collapsed);
        it.iconPath = new vscode.ThemeIcon("symbol-namespace");
        it.description = path.relative(root, m.file);
        it.children = m.items.map((s) => {
          const c = new vscode.TreeItem(s.name);
          c.description = (s.public ? "pub " : "") + (s.signature || "").replace(/^pub\s+/, "").slice(0, 60);
          c.tooltip = new vscode.MarkdownString(`\`\`\`mimic\n${s.signature}\n\`\`\`\n${s.doc || ""}`);
          c.iconPath = new vscode.ThemeIcon(icon[s.kind] || "symbol-misc");
          c.command = { command: "mimic.openAt", title: "Open", arguments: [s.location.file, s.location.line] };
          return c;
        });
        return it;
      });
  }
}

// ---- mim.mim -------------------------------------------------------------------------------------

const MANIFEST_KEYS = {
  project: ["name", "version", "authors", "description", "readme", "license", "repository", "edition", "kind"],
  dependencies: [],
  ffi: ["link", "headers", "sources", "include", "flags"],
  workspace: ["members"],
};

class ManifestCompletion {
  provideCompletionItems(doc, pos) {
    if (path.basename(doc.uri.fsPath) !== "mim.mim") return [];
    // the block the cursor is in
    let block;
    for (let l = pos.line; l >= 0; l--) {
      const m = /^\s*(\w+)\s*\{/.exec(doc.lineAt(l).text);
      if (m) {
        block = m[1];
        break;
      }
    }
    if (block && MANIFEST_KEYS[block]) {
      const keys = block === "dependencies" ? ["git", "rev", "path", "version"] : MANIFEST_KEYS[block];
      return keys.map((k) => new vscode.CompletionItem(k, vscode.CompletionItemKind.Property));
    }
    return Object.keys(MANIFEST_KEYS).map((k) => {
      const it = new vscode.CompletionItem(k, vscode.CompletionItemKind.Module);
      it.insertText = new vscode.SnippetString(`${k} {\n\t$0\n}`);
      return it;
    });
  }
}

class ManifestLenses {
  provideCodeLenses(doc) {
    if (path.basename(doc.uri.fsPath) !== "mim.mim") return [];
    const out = [];
    for (let i = 0; i < doc.lineCount; i++) {
      if (/^\s*dependencies\s*\{/.test(doc.lineAt(i).text)) {
        const r = new vscode.Range(i, 0, i, 0);
        out.push(new vscode.CodeLens(r, { title: "Install dependencies", command: "mimic.installDeps", arguments: [doc.uri] }));
        out.push(new vscode.CodeLens(r, { title: "Add a dependency…", command: "mimic.addDependency", arguments: [doc.uri] }));
      }
    }
    return out;
  }
}

function terminalRun(args, cwd, name = "Mimic") {
  const t = vscode.window.createTerminal({ name, cwd, shellPath: setup.mimicPath(), shellArgs: args });
  t.show(true);
  return t;
}

async function newProject() {
  if (setup.found().missing) return setup.need("create");
  const name = await vscode.window.showInputBox({ prompt: "The project's name", placeHolder: "hello", validateInput: (v) => (/^[a-z][a-z0-9_-]*$/.test(v) ? null : "letters, digits, - and _, starting with a letter") });
  if (!name) return;
  const kind = await vscode.window.showQuickPick([{ label: "A program", flag: "--bin" }, { label: "A library", flag: "--lib" }], { placeHolder: "What kind of project?" });
  if (!kind) return;
  const where = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: "Create it here" });
  if (!where) return;
  const dir = where[0].fsPath;
  const r = await exec(setup.mimicPath(), ["create", name, kind.flag], { cwd: dir });
  if (r.code !== 0) {
    vscode.window.showErrorMessage(`mimic create: ${(r.stderr || r.stdout).trim()}`);
    return;
  }
  vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(path.join(dir, name)), { forceNewWindow: !!vscode.workspace.workspaceFolders });
}

async function addDependency(uri) {
  const file = uri instanceof vscode.Uri ? uri.fsPath : path.join(projectRoot(activeFile()) || "", "mim.mim");
  if (!fs.existsSync(file)) return vscode.window.showErrorMessage("No mim.mim here: open a Mimic project.");
  const url = await vscode.window.showInputBox({ prompt: "A git URL, optionally with @tag or @commit", placeHolder: "https://github.com/someone/somelib@v1.2.0" });
  if (!url) return;
  const [git, rev] = url.split(/@(?=[^/]*$)/);
  const name = path.basename(git).replace(/\.git$/, "").replace(/[^a-z0-9_]/gi, "_");
  const doc = await vscode.workspace.openTextDocument(file);
  const text = doc.getText();
  const entry = `    ${name} = { git = "${git}"${rev ? `, rev = "${rev}"` : ""} }\n`;
  const ed = new vscode.WorkspaceEdit();
  const m = /^\s*dependencies\s*\{[^\n]*\n/m.exec(text);
  if (m) ed.insert(doc.uri, doc.positionAt(m.index + m[0].length), entry);
  else ed.insert(doc.uri, doc.positionAt(text.length), `${text.endsWith("\n") ? "" : "\n"}\ndependencies {\n${entry}}\n`);
  await vscode.workspace.applyEdit(ed);
  await doc.save();
  terminalRun(["install"], path.dirname(file), "Mimic install");
}

// ---- tasks and the target ----------------------------------------------------------------------

const TASKS = [
  ["build", "Build", vscode.TaskGroup.Build],
  ["run", "Run", undefined],
  ["test", "Test", vscode.TaskGroup.Test],
  ["check", "Check", undefined],
  ["audit", "Audit", undefined],
  ["fmt", "Format", undefined],
  ["doc", "Docs", undefined],
];

class Tasks {
  provideTasks() {
    const root = projectRoot(activeFile());
    if (!root) return [];
    return TASKS.map(([cmd, label, group]) => this.make({ type: "mimic", command: cmd }, label, group, root));
  }
  resolveTask(t) {
    const root = projectRoot(activeFile()) || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return this.make(t.definition, t.name, undefined, root);
  }
  make(def, label, group, cwd) {
    const args = [def.command, ...(def.args || [])];
    const target = config().get("target");
    if (target && ["build", "run"].includes(def.command) && !args.includes("--target")) args.push("--target", target);
    if (def.release && !args.includes("--release")) args.push("--release");
    const t = new vscode.Task(def, vscode.TaskScope.Workspace, label, "mimic", new vscode.ProcessExecution(setup.mimicPath(), args, { cwd }), ["$mimic"]);
    if (group) t.group = group;
    return t;
  }
}

let targetItem;
function showTarget() {
  const t = config().get("target");
  targetItem.text = `$(server-environment) ${t || "this machine"}`;
  targetItem.tooltip = "The target of Mimic builds (Build and Run tasks). Click to change.";
  targetItem.show();
}

async function pickTarget() {
  if (setup.found().missing) return setup.need("targets");
  const r = await exec(setup.mimicPath(), ["targets", "--json"]);
  let tiers = [];
  try {
    tiers = JSON.parse(r.stdout).tiers || [];
  } catch {}
  const items = [{ label: "this machine", description: "native: this CPU, SIMD and GPU", value: "" }].concat(
    tiers
      .sort((a, b) => (a.tier === "stable" ? -1 : 0) - (b.tier === "stable" ? -1 : 0))
      .map((x) => ({ label: x.target, description: x.tier === "stable" ? "stable, tested in CI" : x.tier, value: x.target })),
  );
  const pick = await vscode.window.showQuickPick(items, { placeHolder: "Build for…", matchOnDescription: true });
  if (pick) await config().update("target", pick.value, vscode.ConfigurationTarget.Workspace);
}

// ---- audit in Problems --------------------------------------------------------------------------

let auditDiags;
let auditView;
async function audit(doc) {
  if (!config().get("audit.onSave") || doc.languageId !== "mimic" || doc.uri.scheme !== "file" || !setup.has("audit")) return;
  const root = projectRoot(doc.uri.fsPath);
  const args = root ? ["audit", "--format", "json", "--fail-on", "never"] : ["audit", "--in", doc.uri.fsPath, "--format", "json", "--fail-on", "never"];
  const r = await exec(setup.mimicPath(), args, { cwd: root || path.dirname(doc.uri.fsPath), timeout: 120000 });
  let report;
  try {
    report = JSON.parse(r.stdout);
  } catch {
    return;
  }
  const byFile = new Map();
  for (const f of report.findings || []) {
    const sev = f.severity === "error" ? vscode.DiagnosticSeverity.Error : f.severity === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
    const d = new vscode.Diagnostic(new vscode.Range(Math.max(0, f.line - 1), Math.max(0, f.column - 1), Math.max(0, (f.end_line || f.line) - 1), Math.max(0, (f.end_column || f.column) - 1)), `${f.message}${f.help ? `\n${f.help}` : ""}`, sev);
    d.source = "mimic audit";
    d.code = { value: `${f.rule} ${f.name}`, target: vscode.Uri.parse(`mimic-man:/${encodeURIComponent(f.rule)}.md`) };
    const file = f.path || path.resolve(root || path.dirname(doc.uri.fsPath), f.file);
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(d);
  }
  auditDiags.clear();
  for (const [f, ds] of byFile) auditDiags.set(vscode.Uri.file(f), ds);
  auditView.show(report, root || path.dirname(doc.uri.fsPath));
}

/** The Audit view: the counts, the trend of past runs, findings by rule. */
class AuditView {
  constructor() {
    this.changed = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changed.event;
    this.report = null;
  }
  show(report, root) {
    this.report = report;
    this.root = root;
    this.changed.fire();
  }
  getTreeItem(x) {
    return x;
  }
  getChildren(parent) {
    if (parent) return parent.children || [];
    if (!this.report) return [new vscode.TreeItem("Save a Mimic file to audit it")];
    const fs_ = this.report.findings || [];
    const count = (sev) => fs_.filter((f) => f.severity === sev).length;
    const head = new vscode.TreeItem(`${count("error")} errors, ${count("warning")} warnings, ${count("note")} notes`);
    head.iconPath = new vscode.ThemeIcon(count("error") ? "error" : count("warning") ? "warning" : "pass");
    const fresh = fs_.filter((f) => f.new).length;
    head.description = fresh && fresh !== fs_.length ? `${fresh} new since the baseline` : "";
    const out = [head];
    // the trend: the last runs' totals, from target/audit/history-*.jsonl
    try {
      const dir = path.join(this.root, "target", "audit");
      const file = fs.readdirSync(dir).find((f) => f.startsWith("history-") && f.endsWith(".jsonl"));
      const runs = fs.readFileSync(path.join(dir, file), "utf8").trim().split("\n").slice(-8).map((l) => JSON.parse(l));
      if (runs.length > 1) {
        const t = new vscode.TreeItem(`trend: ${runs.map((x) => x.total).join(" → ")}`);
        t.iconPath = new vscode.ThemeIcon(runs[runs.length - 1].total <= runs[0].total ? "arrow-down" : "arrow-up");
        t.tooltip = "Findings in the last audits, oldest first";
        out.push(t);
      }
    } catch {}
    const byRule = new Map();
    for (const f of fs_) {
      const k = `${f.rule} ${f.name}`;
      if (!byRule.has(k)) byRule.set(k, []);
      byRule.get(k).push(f);
    }
    for (const [rule, list] of byRule) {
      const it = new vscode.TreeItem(rule, vscode.TreeItemCollapsibleState.Collapsed);
      it.description = `${list.length} · ${list[0].severity}`;
      it.iconPath = new vscode.ThemeIcon(list[0].category === "security" ? "shield" : "lightbulb");
      it.tooltip = list[0].help || "";
      it.children = list.map((f) => {
        const c = new vscode.TreeItem(f.message);
        c.description = `${f.file}:${f.line}`;
        c.tooltip = f.help || "";
        c.command = { command: "mimic.openAt", title: "Open", arguments: [f.path || path.resolve(this.root, f.file), f.line] };
        return c;
      });
      out.push(it);
    }
    return out;
  }
}

/** After a save: words or glyphs throughout (mimic.format.onSave). */
async function formatOnSave(doc) {
  const style = config().get("format.onSave");
  if (doc.languageId !== "mimic" || doc.uri.scheme !== "file" || !style || style === "off" || setup.found().missing) return;
  const args = ["fmt", doc.uri.fsPath];
  if (style === "glyphs") args.splice(1, 0, "--glyphs");
  const r = await exec(setup.mimicPath(), args, { cwd: path.dirname(doc.uri.fsPath) });
  if (r.code !== 0) setup.log(`mimic fmt: ${(r.stderr || r.stdout).trim()}`);
}

// ---- docs, UI preview, manual examples ----------------------------------------------------------

async function docPreview() {
  const file = activeFile();
  const root = projectRoot(file);
  const cwd = root || (file && path.dirname(file));
  if (!cwd || !setup.need("doc")) return;
  const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: "mimic doc" }, () => exec(setup.mimicPath(), root ? ["doc"] : ["doc", file], { cwd }));
  const m = /(\/\S+index\.html|[A-Za-z]:\\\S+index\.html|\S*target\/doc\/index\.html)/.exec(r.stdout + r.stderr);
  const index = m ? path.resolve(cwd, m[1]) : path.join(cwd, "target", "doc", "index.html");
  if (!fs.existsSync(index)) return vscode.window.showErrorMessage(`mimic doc: ${(r.stderr || r.stdout).trim()}`);
  const p = vscode.window.createWebviewPanel("mimic.doc", "Mimic Docs", vscode.ViewColumn.Beside, { enableScripts: true, localResourceRoots: [vscode.Uri.file(path.dirname(index))] });
  const base = p.webview.asWebviewUri(vscode.Uri.file(path.dirname(index) + path.sep));
  p.webview.html = fs.readFileSync(index, "utf8").replace(/<head>/i, `<head><base href="${base}">`);
}

let uiPort = 18800;
async function uiPreview(uri) {
  const file = uri instanceof vscode.Uri ? uri.fsPath : activeFile();
  if (!file || setup.found().missing) return setup.need("run");
  await vscode.workspace.saveAll(false);
  const root = projectRoot(file);
  const port = uiPort++;
  terminalRun(root ? ["run", "--web", "--port", String(port)] : ["run", file, "--web", "--port", String(port)], root || path.dirname(file), "Mimic UI");
  const url = `http://127.0.0.1:${port}/`;
  // wait for the page, then show it beside the code
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  vscode.commands.executeCommand("simpleBrowser.show", url);
}

class ManualExamples {
  provideCodeLenses(doc) {
    if (doc.uri.scheme !== "mimic-man") return [];
    const out = [];
    const lines = doc.getText().split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/^```mimic( run)?\s*$/.test(lines[i])) {
        let j = i + 1;
        while (j < lines.length && !/^```/.test(lines[j])) j++;
        const code = lines.slice(i + 1, j).join("\n");
        if (/^\s*(module|§)\s+main\b/m.test(code)) out.push(new vscode.CodeLens(new vscode.Range(i, 0, i, 0), { title: "▶ Run this example", command: "mimic.runExample", arguments: [code] }));
        i = j;
      }
    }
    return out;
  }
}

/** The runnable examples of a manual page (the last one opened, or chosen). */
async function runManualExample() {
  if (!setup.need("man")) return;
  const topic = (await vscode.window.showInputBox({ prompt: "Examples of which manual page?", value: lastTopic() || "1" })) || "";
  if (!topic) return;
  const r = await exec(setup.mimicPath(), ["man", topic, "--json"]);
  let text = "";
  try {
    text = JSON.parse(r.stdout).text;
  } catch {
    return vscode.window.showErrorMessage(`mimic man ${topic}: ${(r.stderr || r.stdout).trim()}`);
  }
  const blocks = [...text.matchAll(/```mimic(?: run)?\n([\s\S]*?)```/g)].map((m) => m[1]).filter((c) => /^\s*(module|§)\s+main\b/m.test(c));
  if (!blocks.length) return vscode.window.showInformationMessage(`The page \`${topic}\` has no complete program to run.`);
  const pick = await vscode.window.showQuickPick(
    blocks.map((c, i) => ({ label: `Example ${i + 1}`, detail: c.split("\n").filter((l) => l.trim() && !/^\s*(module|§)\s/.test(l)).slice(0, 2).join("  ⏎  "), code: c })),
    { placeHolder: `Run an example of ${topic}` },
  );
  if (pick) runExample(pick.code);
}

function lastTopic() {
  return require("./extension").lastTopic && require("./extension").lastTopic();
}

function runExample(code) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mimic-example-"));
  const file = path.join(dir, "example.mim");
  fs.writeFileSync(file, code + "\n");
  terminalRun(["run", file], dir, "Mimic example");
}

// ---- agents ---------------------------------------------------------------------------------------

function registerMcp(context) {
  // VS Code 1.101 and newer: mimic mcp as an MCP server for agent mode
  if (!vscode.lm || typeof vscode.lm.registerMcpServerDefinitionProvider !== "function" || !vscode.McpStdioServerDefinition) return;
  const changed = new vscode.EventEmitter();
  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider("mimic.mcp", {
      onDidChangeMcpServerDefinitions: changed.event,
      provideMcpServerDefinitions: () => {
        if (!config().get("mcp.enable") || !setup.has("mcp")) return [];
        const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const args = ["mcp"];
        if (folder) args.push("--project", folder);
        for (const [k, flag] of [["mcp.allowOutside", "--allow-outside"], ["mcp.allowInstall", "--allow-install"], ["mcp.allowNetwork", "--allow-network"], ["mcp.readOnly", "--read-only"], ["mcp.noRun", "--no-run"]]) if (config().get(k)) args.push(flag);
        return [new vscode.McpStdioServerDefinition("Mimic", setup.mimicPath(), args, {}, setup.found().version)];
      },
    }),
    changed,
  );
  setup.onChange(() => changed.fire());
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("mimic.mcp") && changed.fire()));
}

// ---- start ------------------------------------------------------------------------------------------

function start(context) {
  auditDiags = vscode.languages.createDiagnosticCollection("mimic-audit");
  targetItem = vscode.window.createStatusBarItem("mimic.target", vscode.StatusBarAlignment.Right, 99);
  targetItem.command = "mimic.pickTarget";
  targetItem.name = "Mimic target";
  const modules = new Modules();
  auditView = new AuditView();
  context.subscriptions.push(
    auditDiags,
    targetItem,
    vscode.workspace.onDidChangeTextDocument(glyphAsYouType),
    vscode.window.registerWebviewViewProvider("mimic.glyphs", new GlyphView()),
    vscode.window.registerTreeDataProvider("mimic.modules", modules),
    vscode.window.registerTreeDataProvider("mimic.audit", auditView),
    vscode.commands.registerCommand("mimic.refreshModules", () => modules.changed.fire()),
    vscode.languages.registerCompletionItemProvider({ language: "mimic", pattern: "**/mim.mim" }, new ManifestCompletion()),
    vscode.languages.registerCodeLensProvider({ language: "mimic", pattern: "**/mim.mim" }, new ManifestLenses()),
    vscode.languages.registerCodeLensProvider({ scheme: "mimic-man" }, new ManualExamples()),
    vscode.commands.registerCommand("mimic.installDeps", (uri) => terminalRun(["install"], path.dirname(uri instanceof vscode.Uri ? uri.fsPath : path.join(projectRoot(activeFile()) || ".", "mim.mim")), "Mimic install")),
    vscode.commands.registerCommand("mimic.addDependency", addDependency),
    vscode.commands.registerCommand("mimic.newProject", newProject),
    vscode.tasks.registerTaskProvider("mimic", new Tasks()),
    vscode.commands.registerCommand("mimic.pickTarget", pickTarget),
    vscode.commands.registerCommand("mimic.docPreview", docPreview),
    vscode.commands.registerCommand("mimic.uiPreview", uiPreview),
    vscode.commands.registerCommand("mimic.runExample", runExample),
    vscode.commands.registerCommand("mimic.agentGuide", () => vscode.commands.executeCommand("mimic.manualPage", "agents")),
    vscode.commands.registerCommand("mimic.runManualExample", runManualExample),
    vscode.workspace.onDidSaveTextDocument((d) => {
      formatOnSave(d).then(() => audit(d));
      if (d.languageId === "mimic") modules.changed.fire();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("mimic.target") && showTarget()),
  );
  showTarget();
  registerMcp(context);
}

module.exports = { start, insideString };
