// Interaction nets in VS Code: the net view (`mimic net show` and
// `mimic net trace`, drawn by media/netview.js), **Show net** above the
// functions that compile to nets, and `.mnet` files: errors on save,
// formatting, and what each node kind is on hover.

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const setup = require("./setup");
const { exec } = require("./mimic");

let panel;
let shown; // { file, before, focus }
let errors;
const cache = new Map(); // file → { version, functions }

function canShow() {
  const f = setup.found();
  return !f.missing && f.net && f.net.has("show");
}

function need() {
  if (canShow()) return true;
  const f = setup.found();
  if (f.missing) return setup.need("net");
  vscode.window.showWarningMessage(`Mimic ${f.version} cannot show nets as graphs: \`mimic net show\` and \`mimic net trace\` come with a newer Mimic.`, "Update Mimic").then((p) => p && setup.installMimic());
  return false;
}

function cwdOf(file) {
  return path.dirname(file);
}

async function showJson(file, before) {
  const args = ["net", "show", "--json", file];
  if (before) args.push("--before");
  const r = await exec(setup.mimicPath(), args, { cwd: cwdOf(file), timeout: 120000 });
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error((r.stderr || r.stdout).trim() || "mimic net show failed");
  }
}

async function open(uri, focus) {
  if (!need()) return;
  const file = uri instanceof vscode.Uri ? uri.fsPath : vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!file) return;
  await vscode.workspace.saveAll(false);
  shown = { file, before: false, focus: typeof focus === "string" ? focus : undefined };
  if (!panel) {
    panel = vscode.window.createWebviewPanel("mimic.net", "Mimic Net", vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(__dirname, "..", "media"))],
    });
    panel.onDidDispose(() => (panel = undefined));
    panel.webview.onDidReceiveMessage(onMessage);
    panel.webview.html = html(panel.webview);
  } else {
    await load();
  }
  panel.title = `Net: ${path.basename(file)}`;
  panel.reveal(vscode.ViewColumn.Beside, true);
}

async function load() {
  if (!panel || !shown) return;
  try {
    const data = await showJson(shown.file, shown.before);
    panel.webview.postMessage({ type: "show", data, focus: shown.focus });
  } catch (e) {
    vscode.window.showErrorMessage(`Mimic: ${e.message}`);
  }
}

async function onMessage(m) {
  if (m.type === "ready") await load();
  else if (m.type === "before") {
    shown.before = m.value;
    await load();
  } else if (m.type === "open" && m.location) {
    const base = path.dirname(shown.file);
    let file = path.isAbsolute(m.location.file) ? m.location.file : path.resolve(base, m.location.file);
    if (!fs.existsSync(file)) {
      // a project's paths are relative to its root
      let dir = base;
      while (dir !== path.dirname(dir) && !fs.existsSync(path.join(dir, "mim.mim"))) dir = path.dirname(dir);
      file = path.resolve(dir, m.location.file);
    }
    const line = Math.max(0, (m.location.line || 1) - 1);
    vscode.window.showTextDocument(vscode.Uri.file(file), { viewColumn: vscode.ViewColumn.One, selection: new vscode.Range(line, 0, line, 0) });
  } else if (m.type === "trace") {
    const args = ["net", "trace", "--json", "--frames", "300", shown.file];
    if (m.fn) args.push("--fn", m.fn, ...String(m.args || "").split(/[\s,]+/).filter(Boolean));
    if (m.before) args.push("--before");
    const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: "Mimic: tracing the net" }, () =>
      exec(setup.mimicPath(), args, { cwd: cwdOf(shown.file), timeout: 300000 }),
    );
    try {
      panel.webview.postMessage({ type: "trace", data: JSON.parse(r.stdout) });
    } catch {
      panel.webview.postMessage({ type: "error", message: (r.stderr || r.stdout).trim().replace(/^error: /, "") });
    }
  } else if (m.type === "export") {
    const to = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(path.join(path.dirname(shown.file), `${m.name.replace(/[^\w.-]+/g, "_")}.svg`)), filters: { SVG: ["svg"] } });
    if (to) {
      fs.writeFileSync(to.fsPath, m.svg);
      vscode.window.showInformationMessage(`Saved ${path.basename(to.fsPath)}`);
    }
  }
}

function html(webview) {
  const media = (f) => webview.asWebviewUri(vscode.Uri.file(path.join(__dirname, "..", "media", f)));
  const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${media("netview.css")}">
</head><body>
<header>
  <select id="fn" title="A function compiled to a net"></select>
  <label title="The nets as compiled from the code, before the compiler reduces what it can"><input type="checkbox" id="before"> before compile-time reduction</label>
  <span class="grow"></span>
  <button id="fitBtn" title="Fit the net to the view">Fit</button>
  <button id="export" title="Save the net as it is drawn, as SVG">Export SVG</button>
</header>
<div id="defs"></div>
<p id="info" class="dim"></p>
<svg id="graph"></svg>
<p class="dim"><span id="count"></span> · Drag to move, wheel to zoom. Orange wires are active pairs: they interact next. Click a reference to see its definition, any other node for its code.</p>
<details><summary>As text</summary><pre id="text"></pre></details>
<section id="tracer">
  <h2>Reduce it, round by round</h2>
  <div class="row"><code id="traceFn"></code><input id="args" placeholder="numbers, e.g. 10" size="14"><code id="close">)</code><button id="trace">Trace</button></div>
  <div id="traceOut" style="display:none">
    <p id="summary"></p>
    <p id="rules" class="dim"></p>
    <svg id="chart"></svg>
    <div id="player"><button id="first">⏮</button><button id="prev">◀</button><button id="play">▶</button><button id="next">▶|</button><button id="last">⏭</button><input type="range" id="slider" min="0" max="0" value="0"><span id="roundNo"></span><button id="exportAnim" title="The rounds as one SVG that plays them">Export as animation</button></div>
    <p id="frameNote" class="dim"></p>
    <p class="dim">Each round fires every redex that is ready, as if each had a core of its own: the bars are the parallelism the net offers. The runtime has as many cores as the machine and runs some calls natively.</p>
  </div>
</section>
<div class="legend">${Object.entries({ con: "constructor", dup: "duplicator", era: "eraser", num: "number", ref: "reference", opr: "operator", swi: "switch" }).map(([k, v]) => `<span><i class="k-${k}"></i>${v}</span>`).join("")}</div>
<script nonce="${nonce}" src="${media("netview.js")}"></script>
</body></html>`;
}

// ---- Show net above functions ---------------------------------------------------------

class Lenses {
  constructor() {
    this.changed = new vscode.EventEmitter();
    this.onDidChangeCodeLenses = this.changed.event;
  }
  async provideCodeLenses(doc) {
    if (!canShow() || doc.uri.scheme !== "file" || !vscode.workspace.getConfiguration("mimic").get("codeLens.enable")) return [];
    const file = doc.uri.fsPath;
    let c = cache.get(file);
    if (!c || c.version !== doc.version) {
      try {
        const data = await showJson(file, false);
        c = { version: doc.version, functions: data.functions || [] };
      } catch {
        c = { version: doc.version, functions: [] };
      }
      cache.set(file, c);
    }
    const base = path.basename(file);
    return c.functions
      .filter((f) => f.location && path.basename(f.location.file) === base && f.location.line >= 1 && f.location.line <= doc.lineCount)
      .map((f) => {
        const r = new vscode.Range(f.location.line - 1, 0, f.location.line - 1, 0);
        return new vscode.CodeLens(r, { title: `Show net (${f.nodes} nodes)`, command: "mimic.showNet", arguments: [doc.uri, f.function] });
      });
  }
}

// ---- .mnet files --------------------------------------------------------------------------

const KINDS = [
  [/^\$[^\s(]+/, (m) => `**operator \`${m}\`**: waits for a number on its principal port and one on port 1, then puts the result on port 2`],
  [/^\?\(/, () => "**switch**: when a number arrives, `(r *)` goes to the branch pair if it is not zero, `(* r)` if it is: one branch is kept, the other erased unevaluated"],
  [/^@[\w.·]+/, (m) => `**reference \`${m}\`**: the definition is expanded when another node meets it (laziness and recursion)`],
  [/^#[^\s()]+/, (m) => `**number \`${m}\`**`],
  [/^\{/, () => "**duplicator** `{a b}`: shares a value between two uses; `{3 a b}` has a label"],
  [/^\(/, () => "**constructor** `(a b)`: a function (argument, result), or a pair"],
  [/^\*/, () => "**eraser**: a value nobody uses"],
  [/^&/, () => "**active pair** `a ~ b`: these two interact first"],
];

class NetHover {
  provideHover(doc, pos) {
    const line = doc.lineAt(pos.line).text;
    for (let start = pos.character; start >= Math.max(0, pos.character - 40); start--) {
      const rest = line.slice(start);
      for (const [re, say] of KINDS) {
        const m = re.exec(rest);
        if (m && pos.character < start + m[0].length) {
          return new vscode.Hover(new vscode.MarkdownString(say(m[0])), new vscode.Range(pos.line, start, pos.line, start + m[0].length));
        }
      }
    }
    return undefined;
  }
}

async function checkNet(doc) {
  if (doc.languageId !== "mimic-net" || doc.uri.scheme !== "file" || setup.found().missing) return;
  const r = await exec(setup.mimicPath(), ["net", "fmt", doc.uri.fsPath], { cwd: cwdOf(doc.uri.fsPath) });
  if (r.code === 0) {
    errors.delete(doc.uri);
    return;
  }
  const m = /:(\d+):(\d+): (.*)$/m.exec(r.stderr);
  if (!m) return;
  const line = Math.max(0, Math.min(doc.lineCount - 1, Number(m[1]) - 1));
  const col = Math.max(0, Number(m[2]) - 1);
  const d = new vscode.Diagnostic(new vscode.Range(line, col, line, col + 1), m[3], vscode.DiagnosticSeverity.Error);
  d.source = "mimic net";
  errors.set(doc.uri, [d]);
}

class NetFormat {
  async provideDocumentFormattingEdits(doc) {
    if (setup.found().missing) return [];
    const r = await exec(setup.mimicPath(), ["net", "fmt", doc.uri.fsPath], { cwd: cwdOf(doc.uri.fsPath) });
    if (r.code !== 0) return [];
    return [vscode.TextEdit.replace(new vscode.Range(0, 0, doc.lineCount, 0), r.stdout)];
  }
}

function start(context) {
  errors = vscode.languages.createDiagnosticCollection("mimic-net");
  const lenses = new Lenses();
  context.subscriptions.push(
    errors,
    vscode.commands.registerCommand("mimic.showNet", open),
    vscode.languages.registerCodeLensProvider({ language: "mimic" }, lenses),
    vscode.languages.registerHoverProvider({ language: "mimic-net" }, new NetHover()),
    vscode.languages.registerDocumentFormattingEditProvider({ language: "mimic-net" }, new NetFormat()),
    vscode.workspace.onDidSaveTextDocument(async (d) => {
      await checkNet(d);
      if (panel && shown && d.uri.fsPath === shown.file) await load();
      cache.delete(d.uri.fsPath);
      lenses.changed.fire();
    }),
    vscode.workspace.onDidOpenTextDocument(checkNet),
  );
  setup.onChange(() => lenses.changed.fire());
}

module.exports = { start };
