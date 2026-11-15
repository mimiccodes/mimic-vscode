// Mimic notebooks (.mimnb): Markdown and code cells; code runs in a REPL
// session of its own per notebook (`mimic repl --json`), so the `let`s and
// `fn`s of one cell are there for the next.

const vscode = require("vscode");
const cp = require("child_process");
const path = require("path");
const setup = require("./setup");
const { exec } = require("./mimic");

const TYPE = "mimic-notebook";

class Serializer {
  deserializeNotebook(content) {
    let raw = { cells: [] };
    try {
      const text = Buffer.from(content).toString("utf8");
      if (text.trim()) raw = JSON.parse(text);
    } catch {
      raw = { cells: [{ kind: "markdown", source: "This notebook could not be read as JSON." }] };
    }
    const cells = (raw.cells || []).map((c) => {
      const cell = new vscode.NotebookCellData(c.kind === "markdown" ? vscode.NotebookCellKind.Markup : vscode.NotebookCellKind.Code, c.source || "", c.kind === "markdown" ? "markdown" : "mimic");
      if (c.outputs && c.outputs.length) {
        cell.outputs = c.outputs.map((o) => new vscode.NotebookCellOutput([o.error ? vscode.NotebookCellOutputItem.error({ name: "Mimic", message: o.error }) : vscode.NotebookCellOutputItem.text(o.text || "")]));
      }
      return cell;
    });
    return new vscode.NotebookData(cells);
  }
  serializeNotebook(data) {
    const cells = data.cells.map((c) => {
      const out = { kind: c.kind === vscode.NotebookCellKind.Markup ? "markdown" : "code", source: c.value };
      const outputs = (c.outputs || []).flatMap((o) =>
        o.items.map((i) => {
          const s = Buffer.from(i.data).toString("utf8");
          if (i.mime === "application/vnd.code.notebook.error") {
            try {
              return { error: JSON.parse(s).message };
            } catch {
              return { error: s };
            }
          }
          return { text: s };
        }),
      );
      if (outputs.length) out.outputs = outputs;
      return out;
    });
    return Buffer.from(JSON.stringify({ mimic: 1, cells }, null, 1) + "\n", "utf8");
  }
}

/** One `mimic repl --json` per notebook. */
class Session {
  constructor(cwd) {
    this.proc = cp.spawn(setup.mimicPath(), ["repl", "--json"], { cwd, env: { ...process.env, NO_COLOR: "1" } });
    this.buf = "";
    this.waiting = [];
    this.proc.stdout.on("data", (d) => {
      this.buf += d.toString("utf8");
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 1);
        const w = this.waiting.shift();
        if (w) {
          try {
            w(JSON.parse(line));
          } catch {
            w({ ok: false, error: line });
          }
        }
      }
    });
    this.proc.on("exit", () => {
      for (const w of this.waiting.splice(0)) w({ ok: false, error: "the session ended" });
      this.dead = true;
    });
  }
  ask(req) {
    return new Promise((resolve) => {
      if (this.dead) return resolve({ ok: false, error: "the session ended" });
      this.waiting.push(resolve);
      this.proc.stdin.write(JSON.stringify(req) + "\n");
    });
  }
  kill() {
    this.dead = true;
    this.proc.kill();
  }
}

const sessions = new Map();

function sessionFor(notebook) {
  const key = notebook.uri.toString();
  let s = sessions.get(key);
  if (!s || s.dead) {
    const dir = notebook.uri.scheme === "file" ? path.dirname(notebook.uri.fsPath) : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    s = new Session(dir);
    sessions.set(key, s);
  }
  return s;
}

let replJson;
async function canRun() {
  if (setup.found().missing || !setup.has("repl")) return setup.need("repl");
  if (replJson === undefined || replJson.path !== setup.mimicPath()) {
    const r = await exec(setup.mimicPath(), ["repl", "--help"]);
    replJson = { path: setup.mimicPath(), ok: r.stdout.includes("--json") };
  }
  if (!replJson.ok) vscode.window.showWarningMessage(`Mimic ${setup.found().version} cannot run notebooks: \`mimic repl --json\` comes with a newer Mimic.`, "Update Mimic").then((p) => p && setup.installMimic());
  return replJson.ok;
}

function start(context) {
  const ctrl = vscode.notebooks.createNotebookController("mimic-repl", TYPE, "Mimic");
  ctrl.supportedLanguages = ["mimic"];
  ctrl.supportsExecutionOrder = true;
  let order = 0;
  ctrl.executeHandler = async (cells, notebook) => {
    if (!(await canRun())) return;
    const s = sessionFor(notebook);
    for (const cell of cells) {
      const run = ctrl.createNotebookCellExecution(cell);
      run.executionOrder = ++order;
      run.start(Date.now());
      const r = await s.ask({ code: cell.document.getText() });
      const items = [];
      if (r.output) items.push(vscode.NotebookCellOutputItem.text(r.output));
      if (!r.ok) items.push(vscode.NotebookCellOutputItem.error({ name: "Mimic", message: r.error || "error" }));
      run.replaceOutput(items.length ? [new vscode.NotebookCellOutput(items)] : []);
      run.end(r.ok, Date.now());
      if (!r.ok) break;
    }
  };
  ctrl.interruptHandler = (notebook) => {
    const s = sessions.get(notebook.uri.toString());
    if (s) s.kill();
  };
  context.subscriptions.push(
    ctrl,
    vscode.workspace.registerNotebookSerializer(TYPE, new Serializer()),
    vscode.commands.registerCommand("mimic.newNotebook", async () => {
      const data = new vscode.NotebookData([
        new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, "# A Mimic notebook\nEach code cell runs in one session: its `let`s and `fn`s are there for the cells after it.", "markdown"),
        new vscode.NotebookCellData(vscode.NotebookCellKind.Code, "let xs = ⍳ 10\nxs ▷ +/", "mimic"),
        new vscode.NotebookCellData(vscode.NotebookCellKind.Code, "fn square(x: i64) -> i64 { x × x }\nxs ¨ square", "mimic"),
      ]);
      const nb = await vscode.workspace.openNotebookDocument(TYPE, data);
      await vscode.window.showNotebookDocument(nb);
    }),
    vscode.commands.registerCommand("mimic.restartNotebook", () => {
      const nb = vscode.window.activeNotebookEditor?.notebook;
      if (!nb) return;
      const s = sessions.get(nb.uri.toString());
      if (s) s.kill();
      sessions.delete(nb.uri.toString());
      vscode.window.showInformationMessage("The notebook's session is empty: run the cells again.");
    }),
    vscode.workspace.onDidCloseNotebookDocument((nb) => {
      const s = sessions.get(nb.uri.toString());
      if (s) s.kill();
      sessions.delete(nb.uri.toString());
    }),
    { dispose: () => sessions.forEach((s) => s.kill()) },
  );
}

module.exports = { start, Serializer };
