// The REPL: `mimic repl` in a terminal, and lines of code sent to it
// (Shift+Enter: the selection, or the current line).

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const setup = require("./setup");

let term;

function open() {
  if (!setup.need("repl")) return undefined;
  if (!term || term.exitStatus !== undefined) {
    const file = vscode.window.activeTextEditor?.document.uri.fsPath;
    const cwd = file && fs.existsSync(file) ? path.dirname(file) : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    term = vscode.window.createTerminal({ name: "Mimic REPL", shellPath: setup.mimicPath(), shellArgs: ["repl"], cwd });
    vscode.commands.executeCommand("setContext", "mimic.replOpen", true);
  }
  term.show(true);
  return term;
}

/** Send the selection (or the current line, then move down) to the REPL. */
function send() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return;
  const t = open();
  if (!t) return;
  const sel = ed.selection;
  let code;
  if (sel.isEmpty) {
    code = ed.document.lineAt(sel.active.line).text;
    const next = Math.min(sel.active.line + 1, ed.document.lineCount - 1);
    ed.selection = new vscode.Selection(next, 0, next, 0);
  } else {
    code = ed.document.getText(sel);
  }
  if (!code.trim()) return;
  // the REPL reads on while a bracket is open; blank lines end nothing there
  t.sendText(code.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim()).join("\n"), true);
}

function start(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("mimic.openRepl", open),
    vscode.commands.registerCommand("mimic.sendToRepl", send),
    vscode.window.onDidCloseTerminal((t) => {
      if (t === term) {
        term = undefined;
        vscode.commands.executeCommand("setContext", "mimic.replOpen", false);
      }
    }),
  );
}

module.exports = { start };
