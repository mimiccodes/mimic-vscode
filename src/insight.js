// Where the time goes and where code runs: `mimic profile` and `mimic why`
// inside VS Code. A profile shows as a panel (functions, cores, CPU and GPU,
// memory, and the change since the last profile), as a share of time beside
// each function in the code, and in the Hot Functions view; Where Code Runs
// lists the compiler's decisions for the open file.

const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");
const setup = require("./setup");
const { exec } = require("./mimic");
const { compareProfiles, heatOf, escapeHtml, newer } = require("./util");

let last; // { report, cwd, at }
let previous;
let panel;
let heat;
let hotView;
let whereView;
let state;

function projectRoot(file) {
  let dir = path.dirname(file);
  for (;;) {
    if (fs.existsSync(path.join(dir, "mim.mim"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

/** The project of `file` (run in its folder), or the file alone. */
function target(file) {
  const root = projectRoot(file);
  return root ? { cwd: root, args: [] } : { cwd: path.dirname(file), args: [file] };
}

function activeFile(uri) {
  if (uri instanceof vscode.Uri) return uri.fsPath;
  const d = vscode.window.activeTextEditor?.document;
  return d && d.languageId === "mimic" ? d.uri.fsPath : undefined;
}

// ---- profiling ------------------------------------------------------------------------

async function profile(uri) {
  const file = activeFile(uri);
  if (!file || !setup.need("profile")) return;
  await vscode.workspace.saveAll(false);
  const t = target(file);
  // a server never ends by itself: Mimic 0.3.15 and later stop the program
  // when a file appears, and still write its profile (the notification's
  // Cancel button)
  const version = setup.found().version;
  const stop = version && !newer("0.3.15", version) ? path.join(os.tmpdir(), `mimic-profile-stop-${process.pid}-${Date.now()}`) : undefined;
  const r = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Mimic: profiling", cancellable: !!stop },
    (progress, token) => {
      const run = exec(setup.mimicPath(), ["profile", "--json", ...(stop ? ["--stop-file", stop] : []), ...t.args], { cwd: t.cwd });
      if (stop) {
        progress.report({ message: "Cancel stops the program and shows its profile so far." });
        token.onCancellationRequested(() => {
          try {
            fs.writeFileSync(stop, "");
          } catch {
            // (the folder is gone: the program ends with VS Code)
          }
          vscode.window.setStatusBarMessage("$(sync~spin) Mimic: stopping the program and reading its profile…", run);
        });
      }
      return run;
    },
  );
  let report;
  try {
    report = JSON.parse(r.stdout);
  } catch {
    setup.log(r.stderr || r.stdout);
    vscode.window.showErrorMessage(`mimic profile failed: ${(r.stderr || r.stdout).trim().split("\n").slice(-3).join(" ")}`, "Show Log").then((p) => p && vscode.commands.executeCommand("mimic.showOutput"));
    return;
  }
  // the program's own output (stderr with --json)
  setup.log(`---- ${path.basename(file)}: the program's output ----\n${r.stderr.split("\n").filter((l) => !/^\s+(Profiling|Saved|Compiling|Finished)\b/.test(l)).join("\n")}`);
  if (last && last.cwd === t.cwd) previous = last;
  last = { report, cwd: t.cwd, at: new Date() };
  if (state) state.update("mimic.lastProfile", last);
  showPanel();
  refreshHeat();
  hotView.fire();
}

function showPanel() {
  if (!last) {
    vscode.window.showInformationMessage("No profile yet: run Mimic: Profile first.");
    return;
  }
  if (!panel) {
    panel = vscode.window.createWebviewPanel("mimic.profile", "Mimic Profile", vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
    panel.onDidDispose(() => (panel = undefined));
    panel.webview.onDidReceiveMessage((m) => {
      if (m.open) openAt(path.resolve(last.cwd, m.open.file), m.open.line);
    });
  }
  const same = previous && previous.cwd === last.cwd ? previous : undefined;
  panel.webview.html = profileHtml(last, same, panel.webview.cspSource);
  panel.reveal(vscode.ViewColumn.Beside, true);
}

function openAt(file, line) {
  vscode.window.showTextDocument(vscode.Uri.file(file), { selection: new vscode.Range(Math.max(0, line - 1), 0, Math.max(0, line - 1), 0), preview: false });
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function bytes(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} kB`;
  return `${n} B`;
}

const MARKS = { parallel: "∥ parallel", net: "∥ net", fused: "⇶ fused", simd: "≋ SIMD", gpu: "▣ GPU", task: "◷ task", ordered: "→ in order", waits: "⏸ waits" };

function profileHtml(cur, prev, csp) {
  const r = cur.report;
  const delta = prev ? compareProfiles(prev.report, r) : new Map();
  const rows = (r.functions || [])
    .map((f) => {
      const name = escapeHtml(f.function + (f.part ? ` (${f.part})` : ""));
      const where = (f.where || []).map((k) => MARKS[k] || k).join(", ") || "one core, in order";
      const d = delta.get(f.function + (f.part ? `#${f.part}` : ""));
      const change = d === undefined ? "" : `<span class="${d > 0.005 ? "worse" : d < -0.005 ? "better" : ""}">${d > 0 ? "+" : ""}${(d * 100).toFixed(1)}</span>`;
      const loc = escapeHtml(JSON.stringify({ file: f.location.file, line: f.location.line }));
      return `<tr><td class="num">${pct(f.self)}</td><td class="num">${pct(f.total)}</td><td><div class="bar" style="width:${Math.round(f.self * 100)}%"></div></td><td><a href="#" data-open='${loc}'>${name}</a><div class="dim">${escapeHtml(f.location.file)}:${f.location.line}</div></td><td>${escapeHtml(where)}</td>${prev ? `<td class="num">${change}</td>` : ""}</tr>`;
    })
    .join("\n");
  const runtime = (r.runtime || [])
    .filter((x) => x.self >= 0.01)
    .slice(0, 8)
    .map((x) => `<tr><td class="num">${pct(x.self)}</td><td>${escapeHtml(x.function)}</td></tr>`)
    .join("\n");
  const threads = r.threads || [];
  const cores = threads
    .map((t, i) => `<div class="core" title="${escapeHtml(t.name)} ${i}: working ${pct(t.working)}"><div class="fill" style="height:${Math.round(t.working * 100)}%"></div><span>${i}</span></div>`)
    .join("");
  const avg = threads.length ? threads.reduce((a, t) => a + t.working, 0) / threads.length : 0;
  const gpu = r.gpu && r.gpu.kernels > 0 ? `${r.gpu.kernels} kernel(s), ${r.gpu.seconds.toFixed(3)} s (${pct(r.gpu.seconds / Math.max(r.wall_seconds, 1e-9))} of the run), ${bytes(r.gpu.bytes)} moved` : "nothing ran on the GPU";
  const m = r.memory || {};
  const was = prev ? `<p class="dim">Compared with the profile of ${prev.at.toLocaleTimeString ? prev.at.toLocaleTimeString() : prev.at}: ${prev.report.wall_seconds.toFixed(3)} s → ${r.wall_seconds.toFixed(3)} s on the clock. The last column is the change in each function's share, in points.</p>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${csp}; script-src 'unsafe-inline';">
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0 16px 24px; }
h1 { font-size: 1.3em; margin-bottom: 4px; } h2 { font-size: 1.05em; margin-top: 22px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
table { border-collapse: collapse; width: 100%; } td, th { padding: 3px 8px; vertical-align: top; text-align: left; } th { font-weight: 600; color: var(--vscode-descriptionForeground); }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dim { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
.bar { height: 10px; margin-top: 4px; background: #E24B04; border-radius: 2px; min-width: 1px; } td:nth-child(3) { width: 18%; }
a { color: var(--vscode-textLink-foreground); text-decoration: none; } a:hover { text-decoration: underline; }
.cores { display: flex; gap: 4px; align-items: flex-end; height: 90px; margin: 8px 0 22px; flex-wrap: wrap; }
table.small { width: auto; }
.core { position: relative; width: 22px; height: 80px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); display: flex; align-items: flex-end; }
.core .fill { width: 100%; background: #E24B04; } .core span { position: absolute; bottom: -16px; width: 100%; text-align: center; font-size: 0.75em; color: var(--vscode-descriptionForeground); }
.worse { color: var(--vscode-errorForeground); } .better { color: var(--vscode-testing-iconPassed); }
</style></head><body>
<h1>Profile</h1>
<p class="dim">${r.wall_seconds.toFixed(3)} s on the clock, ${r.cpu_seconds.toFixed(3)} s of CPU time on ${threads.length} thread(s), ${r.samples} samples at ${r.rate_hz} Hz${r.lost_samples > 0 ? ` (${r.lost_samples} dropped: lower the rate)` : ""}.</p>
${was}
<h2>Functions</h2>
<table><tr><th class="num">self</th><th class="num">total</th><th></th><th>function</th><th>where it runs</th>${prev ? '<th class="num">change</th>' : ""}</tr>
${rows}
</table>
<p class="dim">self: time in the function and the runtime calls it makes; total: with the Mimic functions it calls. ${r.outside_mimic > 0 ? `${pct(r.outside_mimic)} had no Mimic function on the stack (start-up, the runtime's own threads).` : ""}</p>
${runtime ? `<h2>Inside the runtime and the system</h2><table class="small">${runtime}</table><p class="dim">Part of the self time above: a lot of alloc and release means many small values made and dropped.</p>` : ""}
<h2>Cores</h2>
<div class="cores">${cores}</div>
<p class="dim">Each thread's share of its time working rather than waiting for work: ${pct(avg)} on average, ${(r.cpu_seconds / Math.max(r.wall_seconds, 1e-9)).toFixed(1)} of ${threads.length} cores kept busy.</p>
<h2>CPU and GPU</h2><p>${gpu}; CPU ${r.cpu_seconds.toFixed(3)} s.</p>
<h2>Memory</h2><p>${bytes(m.allocated_bytes || 0)} allocated in ${m.allocations || 0} value(s); ${bytes(m.copied_bytes || 0)} copied in ${m.copies || 0} copy-on-write copies.</p>
<script>
const vscode = acquireVsCodeApi();
document.querySelectorAll("a[data-open]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); vscode.postMessage({ open: JSON.parse(a.dataset.open) }); }));
</script>
</body></html>`;
}

// ---- the share of time beside each function ------------------------------------------

function refreshHeat() {
  for (const ed of vscode.window.visibleTextEditors) decorate(ed);
}

function decorate(ed) {
  if (!ed || ed.document.languageId !== "mimic") return;
  if (!last || !vscode.workspace.getConfiguration("mimic").get("profile.showInCode")) {
    ed.setDecorations(heat, []);
    return;
  }
  const file = ed.document.uri.fsPath;
  const marks = [];
  for (const f of last.report.functions || []) {
    if (path.resolve(last.cwd, f.location.file) !== file) continue;
    const line = f.location.line - 1;
    if (line < 0 || line >= ed.document.lineCount) continue;
    const h = heatOf(f.self);
    marks.push({
      range: new vscode.Range(line, ed.document.lineAt(line).text.length, line, ed.document.lineAt(line).text.length),
      renderOptions: { after: { contentText: `  ${h.icon} ${pct(f.self)} self${f.part ? ` (${f.part})` : ""}, ${pct(f.total)} total`, color: h.color } },
      hoverMessage: new vscode.MarkdownString(`**${f.function}**${f.part ? ` (${f.part})` : ""}: ${pct(f.self)} of the CPU time in itself, ${pct(f.total)} with what it calls.  \nWhere it runs: ${(f.where || []).map((k) => MARKS[k] || k).join(", ") || "one core, in order"}.  \n[Open the profile](command:mimic.showProfile)`, true),
    });
  }
  ed.setDecorations(heat, marks);
}

// ---- views --------------------------------------------------------------------------------

class HotFunctions {
  constructor() {
    this.changed = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changed.event;
  }
  fire() {
    this.changed.fire();
  }
  getTreeItem(x) {
    return x;
  }
  getChildren() {
    if (!last) return [];
    return (last.report.functions || []).map((f) => {
      const it = new vscode.TreeItem(`${pct(f.self)}  ${f.function}${f.part ? ` (${f.part})` : ""}`);
      it.description = (f.where || []).map((k) => MARKS[k] || k).join(", ");
      it.tooltip = `${f.location.file}:${f.location.line}: ${pct(f.self)} self, ${pct(f.total)} total`;
      it.iconPath = new vscode.ThemeIcon("flame", new vscode.ThemeColor(f.self >= 0.25 ? "charts.red" : f.self >= 0.05 ? "charts.orange" : "charts.yellow"));
      it.command = { command: "mimic.openAt", title: "Open", arguments: [path.resolve(last.cwd, f.location.file), f.location.line] };
      return it;
    });
  }
}

class WhereCodeRuns {
  constructor() {
    this.changed = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changed.event;
    this.items = [];
    this.note = "";
  }
  getTreeItem(x) {
    return x;
  }
  getChildren(parent) {
    if (parent) return parent.children;
    if (!this.items.length) {
      const it = new vscode.TreeItem(this.note || "Open a Mimic file");
      return [it];
    }
    return this.items;
  }
  async refresh() {
    const file = activeFile();
    if (!file) return;
    if (!setup.has("why")) {
      this.items = [];
      this.note = setup.found().missing ? "Mimic was not found" : `Mimic ${setup.found().version} has no mimic why (0.3.9)`;
      this.changed.fire();
      return;
    }
    const t = target(file);
    const r = await exec(setup.mimicPath(), t.args.length ? ["why", "--in", file, "--json"] : ["why", "--json"], { cwd: t.cwd });
    let list;
    try {
      list = JSON.parse(r.stdout);
    } catch {
      this.items = [];
      this.note = (r.stderr || r.stdout).includes("errors") ? "The program has errors" : "mimic why failed";
      this.changed.fire();
      return;
    }
    const byFn = new Map();
    for (const d of list) {
      if (path.resolve(t.cwd, d.location.file) !== file) continue;
      if (!byFn.has(d.function)) byFn.set(d.function, []);
      byFn.get(d.function).push(d);
    }
    this.items = [...byFn.entries()].map(([fn, ds]) => {
      const it = new vscode.TreeItem(fn, vscode.TreeItemCollapsibleState.Expanded);
      it.iconPath = new vscode.ThemeIcon("symbol-function");
      it.children = ds.map((d) => {
        const c = new vscode.TreeItem(`${MARKS[d.kind] || d.kind}  ${d.code}`);
        c.description = `line ${d.location.line}`;
        c.tooltip = new vscode.MarkdownString(`**${MARKS[d.kind] || d.kind}**: ${d.why}`);
        c.command = { command: "mimic.openAt", title: "Open", arguments: [file, d.location.line] };
        return c;
      });
      return it;
    });
    this.note = this.items.length ? "" : "Nothing to decide: this file runs in order, as written";
    this.changed.fire();
  }
}

// ---- start --------------------------------------------------------------------------------

function start(context) {
  state = context.workspaceState;
  last = state.get("mimic.lastProfile");
  if (last && typeof last.at === "string") last.at = new Date(last.at);
  heat = vscode.window.createTextEditorDecorationType({});
  hotView = new HotFunctions();
  whereView = new WhereCodeRuns();
  let timer;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => whereView.refresh(), 400);
  };
  context.subscriptions.push(
    heat,
    vscode.commands.registerCommand("mimic.profile", profile),
    vscode.commands.registerCommand("mimic.showProfile", showPanel),
    vscode.commands.registerCommand("mimic.openAt", openAt),
    vscode.commands.registerCommand("mimic.refreshWhere", () => whereView.refresh()),
    vscode.window.registerTreeDataProvider("mimic.hot", hotView),
    vscode.window.registerTreeDataProvider("mimic.where", whereView),
    vscode.window.onDidChangeVisibleTextEditors(refreshHeat),
    vscode.window.onDidChangeActiveTextEditor(soon),
    vscode.workspace.onDidSaveTextDocument((d) => d.languageId === "mimic" && soon()),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("mimic.profile") && refreshHeat()),
  );
  setup.onChange(() => whereView.refresh());
  refreshHeat();
  soon();
}

module.exports = { start, lastProfile: () => last && last.report, whereItems: () => whereView && whereView.items };
