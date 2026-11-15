// Runs inside VS Code (see integration.mjs).
const vscode = require("vscode");
const assert = require("assert");
const path = require("path");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(what, f, ms = 30000) {
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
  assert.equal(doc.languageId, "mimic");
  const ext = vscode.extensions.all.find((e) => e.packageJSON.name === "mimic");
  await until("activation", () => ext.isActive || ext.activate().then(() => true));

  // hover from mimic lsp: signature, effects and comment
  const hover = await until("hover", async () => {
    const h = await vscode.commands.executeCommand("vscode.executeHoverProvider", uri, new vscode.Position(6, 12));
    const text = (h || []).flatMap((x) => x.contents.map((c) => c.value || c)).join("\n");
    return text.includes("fn double") ? text : undefined;
  });
  assert.ok(hover.includes("pure") && hover.includes("twice the value"), hover);

  // the Run lens and the test lens
  const lenses = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", uri);
  const titles = lenses.map((l) => l.command && l.command.title);
  assert.ok(titles.includes("▶ Run") && titles.includes("▶ Run test"), JSON.stringify(titles));

  // glyph input: `\i` completes to ⍳
  await editor.edit((e) => e.insert(new vscode.Position(7, 0), "    \\i\n"));
  const list = await vscode.commands.executeCommand("vscode.executeCompletionItemProvider", uri, new vscode.Position(7, 6), "\\");
  const glyph = list.items.find((i) => i.textEdit ? i.textEdit.newText === "⍳" : i.insertText === "⍳");
  assert.ok(glyph, list.items.slice(0, 5).map((i) => JSON.stringify(i.label)).join(", "));

  // errors as you type
  await editor.edit((e) => e.replace(new vscode.Range(7, 0, 8, 0), "    print(dubble(1))\n"));
  const diags = await until("diagnostics", () => {
    const d = vscode.languages.getDiagnostics(uri);
    return d.length > 0 ? d : undefined;
  });
  assert.equal(String(diags[0].code), "E0303", diags[0].message);
  await vscode.commands.executeCommand("workbench.action.files.revert");
  await until("no diagnostics", () => vscode.languages.getDiagnostics(uri).length === 0);
};
