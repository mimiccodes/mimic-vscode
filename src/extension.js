// Mimic for VS Code. The language itself (errors, hover, definitions,
// completion, formatting) comes from `mimic lsp`, the same engine the
// compiler uses; this file adds what belongs to the editor: the glyph
// palette, Run and Test, the test explorer, the manual; setup.js finds the
// installed `mimic`, installs or updates it, and says what it can do.

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { LanguageClient } = require("vscode-languageclient/node");
const GLYPHS = require("./glyphs.json");
const { MAIN, TEST, testsIn, parseTestOutput } = require("./util");
const setup = require("./setup");
const { exec } = require("./mimic");

let client;
let output;
let terminal;

function config() {
  return vscode.workspace.getConfiguration("mimic");
}

function mimicPath() {
  return setup.mimicPath();
}

/** Run `mimic` with `args`; resolves to { code, stdout, stderr }. */
function mimic(args, cwd) {
  return exec(mimicPath(), args, { cwd });
}

/** The folder holding mim.mim above `file`, if any. */
function projectRoot(file) {
  let dir = path.dirname(file);
  for (;;) {
    if (fs.existsSync(path.join(dir, "mim.mim"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

// ---- the language server ------------------------------------------------------

async function startServer(context) {
  if (!config().get("languageServer.enable") || !setup.has("lsp")) return;
  client = new LanguageClient(
    "mimic",
    "Mimic",
    { command: mimicPath(), args: ["lsp"] },
    {
      documentSelector: [{ scheme: "file", language: "mimic" }],
      outputChannel: output,
      synchronize: { fileEvents: vscode.workspace.createFileSystemWatcher("**/{*.mim,mim.mim,build.mim}") },
    },
  );
  context.subscriptions.push(client);
  await client.start();
}

async function restartServer(context) {
  if (client) {
    await client.stop();
    client = undefined;
  }
  await startServer(context);
}

// ---- glyphs ---------------------------------------------------------------------

async function insertGlyph() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const items = GLYPHS.map((g) => ({
    label: `${g.glyph}   ${g.word}`,
    description: g.digraph ? `type ${g.digraph}` : "",
    detail: g.doc,
    glyph: g.glyph,
  }));
  const pick = await vscode.window.showQuickPick(items, { placeHolder: "Insert a glyph (type its word, or what it does)", matchOnDetail: true, matchOnDescription: true });
  if (!pick) return;
  await editor.edit((e) => {
    for (const sel of editor.selections) e.replace(sel, pick.glyph);
  });
}

async function convert(glyphs) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "mimic") return;
  await editor.document.save();
  const file = editor.document.uri.fsPath;
  const r = await mimic(glyphs ? ["fmt", "--glyphs", file] : ["fmt", file], path.dirname(file));
  if (r.code !== 0) vscode.window.showErrorMessage(`mimic fmt: ${(r.stderr || r.stdout).trim()}`);
}

// ---- run and test ---------------------------------------------------------------

function runInTerminal(args, file) {
  const root = file && projectRoot(file);
  if (!terminal || terminal.exitStatus !== undefined) terminal = vscode.window.createTerminal("Mimic");
  terminal.show(true);
  const q = (s) => (/[\s"'$]/.test(s) ? `"${s.replace(/(["$\\])/g, "\\$1")}"` : s);
  const cwd = root || (file ? path.dirname(file) : undefined);
  const cmd = [q(mimicPath()), ...args.map(q)].join(" ");
  terminal.sendText(cwd ? `cd ${q(cwd)} && ${cmd}` : cmd);
}

/** `mimic run`, for the project of `file`, or `file` alone. */
async function run(uri) {
  const file = uri instanceof vscode.Uri ? uri.fsPath : vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!file) return;
  await vscode.workspace.saveAll(false);
  runInTerminal(projectRoot(file) ? ["run"] : ["run", file], file);
}

/** Debug the program of `uri` (a file, or its project) with `mimic dap`. */
async function debug(uri) {
  const file = uri instanceof vscode.Uri ? uri.fsPath : vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!file || !setup.need("dap")) return;
  await vscode.workspace.saveAll(false);
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file));
  await vscode.debug.startDebugging(folder, { type: "mimic", request: "launch", name: "Debug " + path.basename(projectRoot(file) || file), program: projectRoot(file) || file });
}

class DebugConfigs {
  // F5 with no launch.json: the active file's project, or the file
  resolveDebugConfiguration(folder, config) {
    if (!setup.need("dap")) return undefined;
    if (!config.type && !config.request) {
      const file = vscode.window.activeTextEditor?.document.uri.fsPath;
      if (!file || !file.endsWith(".mim")) return undefined;
      return { type: "mimic", request: "launch", name: "Debug", program: projectRoot(file) || file };
    }
    if (!config.program) config.program = folder ? folder.uri.fsPath : vscode.window.activeTextEditor?.document.uri.fsPath;
    return config;
  }
}

async function test(uri, name) {
  const file = uri instanceof vscode.Uri ? uri.fsPath : vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!file) return;
  await vscode.workspace.saveAll(false);
  const args = projectRoot(file) ? ["test"] : ["test", file];
  if (typeof name === "string") args.push(name);
  runInTerminal(args, file);
}

class Lenses {
  provideCodeLenses(doc) {
    if (!config().get("codeLens.enable")) return [];
    const lenses = [];
    const isMain = /^\s*(module|§)\s+main\b/m.test(doc.getText());
    for (let i = 0; i < doc.lineCount; i++) {
      const line = doc.lineAt(i).text;
      const range = new vscode.Range(i, 0, i, 0);
      if (isMain && MAIN.test(line)) {
        lenses.push(new vscode.CodeLens(range, { title: "▶ Run", command: "mimic.run", arguments: [doc.uri] }));
        lenses.push(new vscode.CodeLens(range, { title: "Debug", command: "mimic.debug", arguments: [doc.uri] }));
      }
      const t = TEST.exec(line);
      if (t) {
        lenses.push(new vscode.CodeLens(range, { title: "▶ Run test", command: "mimic.test", arguments: [doc.uri, t[1]] }));
      }
    }
    return lenses;
  }
}

// ---- the test explorer ------------------------------------------------------------

function setUpTests(context) {
  const ctrl = vscode.tests.createTestController("mimic", "Mimic");
  context.subscriptions.push(ctrl);

  const refresh = (uri, text) => {
    const tests = testsIn(text);
    const id = uri.toString();
    if (tests.length === 0) {
      ctrl.items.delete(id);
      return;
    }
    const file = ctrl.items.get(id) || ctrl.createTestItem(id, path.basename(uri.fsPath), uri);
    file.children.replace(
      tests.map((t) => {
        const item = ctrl.createTestItem(`${id}#${t.name}`, t.name, uri);
        item.range = new vscode.Range(t.line, 0, t.line, 0);
        return item;
      }),
    );
    ctrl.items.add(file);
  };
  const scan = async () => {
    for (const uri of await vscode.workspace.findFiles("**/*.mim", "**/{target,node_modules}/**", 2000)) {
      try {
        refresh(uri, fs.readFileSync(uri.fsPath, "utf8"));
      } catch {}
    }
  };
  ctrl.resolveHandler = async (item) => {
    if (!item) await scan();
  };
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => e.document.languageId === "mimic" && refresh(e.document.uri, e.document.getText())),
    vscode.workspace.onDidOpenTextDocument((d) => d.languageId === "mimic" && refresh(d.uri, d.getText())),
  );

  const runHandler = async (request, token) => {
    const run = ctrl.createTestRun(request);
    const chosen = [];
    const add = (item) => {
      if (item.children.size > 0) item.children.forEach(add);
      else chosen.push(item);
    };
    (request.include || [...gather(ctrl.items)]).forEach(add);
    // group by file: one `mimic test` per file (or project)
    const byFile = new Map();
    for (const t of chosen) {
      if (request.exclude?.includes(t)) continue;
      const key = t.uri.fsPath;
      if (!byFile.has(key)) byFile.set(key, []);
      byFile.get(key).push(t);
    }
    await vscode.workspace.saveAll(false);
    for (const [file, items] of byFile) {
      if (token.isCancellationRequested) break;
      items.forEach((t) => run.started(t));
      const root = projectRoot(file);
      const args = root ? ["test", ...items.map((t) => t.label)] : ["test", file, ...items.map((t) => t.label)];
      const started = Date.now();
      const r = await mimic(args, root || path.dirname(file));
      const results = parseTestOutput(r.stdout + r.stderr);
      for (const t of items) {
        const res = results.get(t.label);
        if (!res) {
          run.errored(t, new vscode.TestMessage((r.stderr || r.stdout || "mimic test gave no result").trim()), Date.now() - started);
        } else if (res.ok) {
          run.passed(t, Date.now() - started);
        } else {
          const msg = new vscode.TestMessage(res.detail.join("\n"));
          const left = res.detail.find((l) => l.trim().startsWith("left:"));
          const right = res.detail.find((l) => l.trim().startsWith("right:"));
          if (left && right) {
            msg.actualOutput = left.trim().slice(5).trim();
            msg.expectedOutput = right.trim().slice(6).trim();
          }
          msg.location = new vscode.Location(t.uri, t.range);
          run.failed(t, msg, Date.now() - started);
        }
      }
    }
    run.end();
  };
  ctrl.createRunProfile("Run", vscode.TestRunProfileKind.Run, runHandler, true);
  scan();
}

function* gather(collection) {
  const items = [];
  collection.forEach((i) => items.push(i));
  yield* items;
}

// ---- the manual ---------------------------------------------------------------------

class ManualPages {
  constructor() {
    this.changed = new vscode.EventEmitter();
    this.onDidChange = this.changed.event;
  }
  async provideTextDocumentContent(uri) {
    const topic = decodeURIComponent(uri.path.replace(/^\//, "").replace(/\.md$/, ""));
    const r = await mimic(topic === "index" ? ["man", "--json"] : ["man", topic, "--json"]);
    try {
      return JSON.parse(r.stdout).text;
    } catch {
      return `# ${topic}\n\n${(r.stderr || r.stdout).trim()}\n`;
    }
  }
}

async function showManual(topic) {
  const uri = vscode.Uri.parse(`mimic-man:/${encodeURIComponent(topic)}.md`);
  await vscode.commands.executeCommand("markdown.showPreviewToSide", uri);
}

async function openManual() {
  const r = await mimic(["man", "--list", "--json"]);
  let pages = [];
  try {
    pages = JSON.parse(r.stdout);
  } catch {
    vscode.window.showErrorMessage("Mimic: the manual needs mimic 0.3.2 or newer.");
    return;
  }
  const order = { tutorial: 0, guide: 1, reference: 2, module: 3, function: 4, type: 5, glyph: 6, error: 7 };
  pages.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  const pick = await vscode.window.showQuickPick(
    [{ label: "Contents", description: "index", name: "index" }, ...pages.map((p) => ({ label: p.title, description: `${p.kind} · mimic man ${p.name}`, name: p.name }))],
    { placeHolder: "A page of the manual: a chapter, a function, a glyph, an error code", matchOnDescription: true },
  );
  if (pick) showManual(pick.name);
}

async function manualForWord() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  const pos = editor.selection.active;
  const range = doc.getWordRangeAtPosition(pos, /[A-Za-z_][A-Za-z0-9_]*(::[A-Za-z_][A-Za-z0-9_]*)*|E\d{4}/);
  let word = range ? doc.getText(range) : "";
  if (!word) {
    // a glyph under the cursor
    const ch = doc.getText(new vscode.Range(pos, pos.translate(0, 1)));
    const g = GLYPHS.find((x) => x.glyph.startsWith(ch) && ch.trim() !== "");
    word = g ? (g.kind === "primitive" ? g.word : g.glyph) : "";
  }
  showManual(word || "index");
}

async function searchManual() {
  const text = await vscode.window.showInputBox({ prompt: "Search the Mimic manual" });
  if (!text) return;
  const r = await mimic(["man", "--search", text, "--json"]);
  let hits = [];
  try {
    hits = JSON.parse(r.stdout);
  } catch {}
  if (hits.length === 0) {
    vscode.window.showInformationMessage(`Nothing in the manual mentions "${text}".`);
    return;
  }
  const pick = await vscode.window.showQuickPick(
    hits.slice(0, 300).map((h) => ({ label: h.line.slice(0, 120), description: `${h.page}${h.section ? " › " + h.section : ""}`, page: h.page })),
    { placeHolder: `${hits.length} line(s) mention "${text}"`, matchOnDescription: true },
  );
  if (pick) showManual(pick.page);
}

// ---- activation -------------------------------------------------------------------------

async function activate(context) {
  output = vscode.window.createOutputChannel("Mimic");
  const cmd = (name, f) => context.subscriptions.push(vscode.commands.registerCommand(name, f));
  cmd("mimic.insertGlyph", insertGlyph);
  cmd("mimic.run", run);
  cmd("mimic.test", test);
  cmd("mimic.debug", debug);
  cmd("mimic.check", async () => {
    const file = vscode.window.activeTextEditor?.document.uri.fsPath;
    await vscode.workspace.saveAll(false);
    runInTerminal(file && !projectRoot(file) ? ["check", file] : ["check"], file);
  });
  cmd("mimic.openManual", openManual);
  cmd("mimic.manualForWord", manualForWord);
  cmd("mimic.searchManual", searchManual);
  cmd("mimic.toGlyphs", () => convert(true));
  cmd("mimic.toWords", () => convert(false));
  cmd("mimic.restartServer", () => restartServer(context));
  cmd("mimic.showOutput", () => output.show());
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("mimic-man", new ManualPages()),
    vscode.languages.registerCodeLensProvider({ language: "mimic" }, new Lenses()),
    vscode.debug.registerDebugConfigurationProvider("mimic", new DebugConfigs()),
    vscode.debug.registerDebugAdapterDescriptorFactory("mimic", {
      createDebugAdapterDescriptor: () => new vscode.DebugAdapterExecutable(mimicPath(), ["dap"]),
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("mimic.path")) setup.refresh();
      else if (e.affectsConfiguration("mimic.languageServer")) restartServer(context);
    }),
  );
  setUpTests(context);
  // a different mimic (installed, updated, chosen): its language server
  setup.onChange(() => restartServer(context));
  await setup.start(context, output);
  // for tests and other extensions: the mimic in use
  return { mimic: () => setup.found() };
}

function deactivate() {
  return client ? client.stop() : undefined;
}

module.exports = { activate, deactivate };
