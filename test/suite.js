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

  // glyphs as you type: \ then i becomes ⍳ (not inside a string)
  // (the net view took the focus: the editor first)
  const ed2 = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  await ed2.edit((e) => e.insert(new vscode.Position(7, 0), "    print(\n"));
  // one character at a time, as typing does
  const typeAt = async (line, text) => {
    for (const ch of text) {
      const at = doc.lineAt(line).text.length;
      await ed2.edit((e) => e.insert(new vscode.Position(line, at), ch));
      await wait(50);
    }
  };
  await typeAt(7, "\\i");
  await until("⍳", () => doc.lineAt(7).text.includes("⍳"), 5000).catch((e) => {
    throw new Error(`${e.message}: the line is ${JSON.stringify(doc.lineAt(7).text)}`);
  });
  await typeAt(7, ' "\\i');
  await wait(300);
  assert.ok(doc.lineAt(7).text.endsWith('"\\i'), doc.lineAt(7).text);
  await vscode.commands.executeCommand("workbench.action.files.revert");

  // tasks for the project
  const tasks = await vscode.tasks.fetchTasks({ type: "mimic" });
  assert.ok(["Build", "Run", "Test", "Audit"].every((n) => tasks.some((t) => t.name === n)), tasks.map((t) => t.name).join(", "));

  // a notebook: cells share one session
  const nbData = new vscode.NotebookData([
    new vscode.NotebookCellData(vscode.NotebookCellKind.Code, "let xs = ⍳ 4", "mimic"),
    new vscode.NotebookCellData(vscode.NotebookCellKind.Code, "xs ▷ +/", "mimic"),
  ]);
  const nb = await vscode.workspace.openNotebookDocument("mimic-notebook", nbData);
  await vscode.window.showNotebookDocument(nb);
  await vscode.commands.executeCommand("notebook.selectKernel", { id: "mimic-repl", extension: "mimiccodes.mimic" });
  await vscode.commands.executeCommand("notebook.execute");
  const out = await until("the notebook's answer", () => {
    const o = nb.cellAt(1).outputs[0];
    return o && Buffer.from(o.items[0].data).toString("utf8");
  }, 120000);
  assert.equal(out.trim(), "6");
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

  // the REPL in a terminal
  await vscode.commands.executeCommand("mimic.openRepl");
  await until("the REPL terminal", () => vscode.window.terminals.some((t) => t.name === "Mimic REPL"));
};
