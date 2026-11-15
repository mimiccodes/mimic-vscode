// Runs inside VS Code against a Mimic without a language server (0.3.3 or
// older; see integration.mjs --old): errors show when a file is saved.
const vscode = require("vscode");
const assert = require("assert");
const path = require("path");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(what, f, ms = 60000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await f();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await wait(250);
  }
}

exports.run = async function () {
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const uri = vscode.Uri.file(path.join(ws, "src/main.mim"));
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  const ext = vscode.extensions.all.find((e) => e.packageJSON.name === "mimic");
  await until("activation", () => ext.isActive || ext.activate().then(() => true));
  const found = ext.exports.mimic();
  assert.ok(found.path && !found.missing, JSON.stringify(found));
  assert.ok(!found.commands.has("lsp"), "this suite is for a mimic without `mimic lsp`");

  // an error appears when the file is saved
  await editor.edit((e) => e.insert(new vscode.Position(7, 0), "    print(dubble(1))\n"));
  await doc.save();
  const d = await until("the error on save", () => {
    const ds = vscode.languages.getDiagnostics(uri).filter((x) => x.source === "mimic check");
    return ds.find((x) => String(x.code) === "E0303");
  });
  assert.ok(d.message.includes("dubble"), d.message);
  assert.equal(d.range.start.line, 7);
  // and goes when it is fixed
  await editor.edit((e) => e.delete(new vscode.Range(7, 0, 8, 0)));
  await doc.save();
  await until("the error gone", () => vscode.languages.getDiagnostics(uri).filter((x) => x.source === "mimic check").length === 0);
};
