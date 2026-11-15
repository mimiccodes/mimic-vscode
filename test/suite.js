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

  // the mimic it found, and what that mimic can do
  const found = ext.exports.mimic();
  assert.ok(found.path && found.version && found.commands.has("lsp"), JSON.stringify(found));

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
  assert.ok(titles.includes("▶ Run") && titles.includes("Debug") && titles.includes("▶ Run test"), JSON.stringify(titles));

  // glyph input: `\i` completes to ⍳
  await editor.edit((e) => e.insert(new vscode.Position(7, 0), "    \\i\n"));
  const list = await vscode.commands.executeCommand("vscode.executeCompletionItemProvider", uri, new vscode.Position(7, 6), "\\");
  const glyph = list.items.find((i) => i.textEdit ? i.textEdit.newText === "⍳" : i.insertText === "⍳");
  assert.ok(glyph, list.items.slice(0, 5).map((i) => JSON.stringify(i.label)).join(", "));

  // errors as you type
  await editor.edit((e) => e.replace(new vscode.Range(7, 0, 8, 0), "    print(dubble(1))\n"));
  // (the half-typed `\i` above was an error of its own for a moment)
  const diags = await until("the unknown name reported", () => {
    const d = vscode.languages.getDiagnostics(uri);
    return d.some((x) => String(x.code) === "E0303") ? d : undefined;
  });
  assert.ok(diags.find((x) => String(x.code) === "E0303").message.includes("dubble"));
  await vscode.commands.executeCommand("workbench.action.files.revert");
  await until("no diagnostics", () => vscode.languages.getDiagnostics(uri).length === 0);

  // Profile: a lens above fn main, and a report naming the program's functions
  const lenses2 = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", uri);
  assert.ok(lenses2.some((l) => l.command && l.command.title === "Profile"));
  await vscode.commands.executeCommand("mimic.profile", uri);
  const report = await until("the profile", () => ext.exports.lastProfile(), 300000);
  assert.ok(report.samples >= 0 && Array.isArray(report.functions) && report.threads.length >= 1, JSON.stringify(report).slice(0, 400));

  // Where Code Runs: the decisions of the open file
  await vscode.commands.executeCommand("mimic.refreshWhere");
  const where = await until("where code runs", () => {
    const items = ext.exports.whereItems();
    return items && items.length ? items : undefined;
  });
  // (double is pure and calls nothing: compiled to a net leaf; main decides nothing)
  assert.ok(where.some((i) => i.label === "double" && i.children.length > 0), where.map((i) => i.label).join(", "));

  // Show net above a function compiled to an interaction net, and the view
  const netLens = await until("the Show net lens", async () => {
    const ls = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", uri);
    return ls.find((l) => l.command && l.command.title.startsWith("Show net"));
  });
  assert.equal(netLens.command.arguments[1], "main::double");
  await vscode.commands.executeCommand("mimic.showNet", uri, "main::double");
  await until("the net view", () => vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => t.label.startsWith("Net: main.mim"))));

  // the REPL in a terminal
  await vscode.commands.executeCommand("mimic.openRepl");
  await until("the REPL terminal", () => vscode.window.terminals.some((t) => t.name === "Mimic REPL"));
};
