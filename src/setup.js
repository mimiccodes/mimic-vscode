// The installed Mimic: finding it, showing it in the status bar, installing
// or updating it from GitHub, checking for newer versions, and errors on
// save for a Mimic without a language server.

const vscode = require("vscode");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { exec, locate, installed } = require("./mimic");
const { newer, platformTag, assetName, sumFor, checkProblems, due } = require("./util");

const REPO = "mimiccodes/mimic";
const EXT_REPO = "mimiccodes/mimic-vscode";
const RELEASES = `https://github.com/${REPO}/releases`;

/** What each feature needs from mimic, and the first version with it. */
const NEEDS = {
  lsp: ["errors as you type, hover and completion", "0.3.4"],
  dap: ["debugging", "0.3.6"],
  why: ["where code runs", "0.3.9"],
  profile: ["profiling", "0.3.13"],
  repl: ["the REPL", "0.3.13"],
};

let found = { missing: true, tried: [] };
let status;
let output;
let fallback;
const listeners = [];

function config() {
  return vscode.workspace.getConfiguration("mimic");
}

/** The mimic to run: the one found, else the setting, else `mimic`. */
function mimicPath() {
  return found.path || config().get("path") || "mimic";
}

function has(command) {
  return !!found.commands && found.commands.has(command);
}

function log(line) {
  if (output) output.appendLine(line);
}

/**
 * Before a feature that needs `command`: true if this mimic has it,
 * otherwise say what is missing and offer the fix.
 */
function need(command) {
  if (found.missing) {
    missingMessage();
    return false;
  }
  if (has(command)) return true;
  const [what, since] = NEEDS[command] || [`\`mimic ${command}\``, "a newer version"];
  vscode.window
    .showWarningMessage(`Mimic ${found.version || ""} has no \`mimic ${command}\` (${what}, since Mimic ${since}).`, "Update Mimic", "Release Notes")
    .then((pick) => {
      if (pick === "Update Mimic") installMimic();
      if (pick === "Release Notes") vscode.env.openExternal(vscode.Uri.parse(RELEASES));
    });
  return false;
}

function missingMessage() {
  const tried = found.setting ? `the mimic.path setting (${found.setting}) does not run` : "it is not in ~/.mimic/bin or on your PATH";
  vscode.window.showWarningMessage(`Mimic was not found: ${tried}.`, "Install Mimic", "Choose the mimic Program", "Download Page").then((pick) => {
    if (pick === "Install Mimic") installMimic();
    if (pick === "Choose the mimic Program") choosePath();
    if (pick === "Download Page") vscode.env.openExternal(vscode.Uri.parse(RELEASES));
  });
}

// ---- finding it -------------------------------------------------------------------

/** Find mimic again; tell the status bar and everyone listening. */
async function refresh() {
  // (a bare `mimic`, the old default, means: find it)
  const setting = (config().get("path") || "").trim();
  found = await locate(setting && setting !== "mimic" ? setting : undefined);
  if (found.missing) {
    log(`mimic not found (tried ${found.tried.join(", ")})`);
    retryLater();
  } else {
    retries = 0;
    log(`mimic ${found.version} at ${found.path} (${found.how}); commands: ${[...found.commands].join(" ")}`);
  }
  updateStatus();
  for (const f of listeners) await f(found);
  return found;
}

// Not found: look again a little later, a few times. Right after VS Code
// starts, or after an update, the first run of mimic can be slow or fail
// once; the next look usually finds it, without a reload.
let retries = 0;
let retryTimer;
function retryLater() {
  if (retryTimer || retries >= 3) return;
  const delay = [5000, 20000, 60000][retries++];
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    refresh();
  }, delay);
}

function onChange(f) {
  listeners.push(f);
}

function updateStatus() {
  if (!status) return;
  if (found.missing) {
    status.text = "$(warning) Mimic";
    status.tooltip = "Mimic was not found. Click to install it or choose it.";
    status.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  } else {
    const all = Object.keys(NEEDS).every(has);
    status.text = `${all ? "$(check)" : "$(info)"} Mimic ${found.version || "?"}`;
    const lines = [`**Mimic ${found.version}**`, "", `\`${found.path}\` (${found.how})`, ""];
    for (const [cmd, [what, since]] of Object.entries(NEEDS)) lines.push(`${has(cmd) ? "✓" : "✗"} ${what}${has(cmd) ? "" : ` (Mimic ${since})`}`);
    status.tooltip = new vscode.MarkdownString(lines.join("  \n"));
    status.backgroundColor = undefined;
  }
  status.show();
}

async function choosePath() {
  const pick = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: "Use this mimic", defaultUri: vscode.Uri.file(path.dirname(installed()[installed().length - 1])) });
  if (pick && pick[0]) await config().update("path", pick[0].fsPath, vscode.ConfigurationTarget.Global);
}

async function statusMenu() {
  const items = [];
  if (found.missing) items.push({ label: "$(cloud-download) Install Mimic", run: installMimic });
  else items.push({ label: "$(sync) Check for a Newer Mimic", run: () => checkForUpdates(true) });
  items.push(
    { label: "$(file-binary) Choose the mimic Program…", run: choosePath },
    { label: "$(refresh) Find Mimic Again", run: refresh },
    { label: "$(output) Show the Mimic Log", run: () => output.show() },
    { label: "$(book) Get Started", run: () => vscode.commands.executeCommand("workbench.action.openWalkthrough", "mimiccodes.mimic#mimic.start", false) },
    { label: "$(link-external) Mimic Releases", run: () => vscode.env.openExternal(vscode.Uri.parse(RELEASES)) },
  );
  const pick = await vscode.window.showQuickPick(items, { placeHolder: found.missing ? "Mimic was not found" : `Mimic ${found.version} at ${found.path}` });
  if (pick) await pick.run();
}

// ---- GitHub releases --------------------------------------------------------------

async function latest(repo) {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "mimic-vscode" } });
  if (!r.ok) throw new Error(`GitHub answered ${r.status} for ${repo}`);
  return r.json();
}

async function download(url, file) {
  const r = await fetch(url, { headers: { "User-Agent": "mimic-vscode" }, redirect: "follow" });
  if (!r.ok) throw new Error(`download failed (${r.status}): ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf;
}

/** Download the latest Mimic for this machine and run its installer. */
async function installMimic() {
  const tag = platformTag(process.platform, process.arch);
  if (!tag) {
    vscode.window.showErrorMessage(`There is no Mimic release for ${process.platform} on ${process.arch} yet; build it from source.`, "How").then((p) => {
      if (p) vscode.env.openExternal(vscode.Uri.parse("https://github.com/mimiccodes/mimic#building"));
    });
    return;
  }
  let rel;
  try {
    rel = await latest(REPO);
  } catch (e) {
    vscode.window.showErrorMessage(`Cannot reach GitHub: ${e.message}`);
    return;
  }
  const version = String(rel.tag_name).replace(/^v/, "");
  const name = assetName(version, tag);
  const asset = (rel.assets || []).find((a) => a.name === name);
  const sums = (rel.assets || []).find((a) => a.name === "SHA256SUMS");
  if (!asset) {
    vscode.window.showErrorMessage(`Mimic ${version} has no package for this machine (${name}).`);
    return;
  }
  const where = path.dirname(installed()[installed().length - 1]);
  const what = found.missing ? `Install Mimic ${version}` : found.version === version ? `Reinstall Mimic ${version}` : `Update Mimic ${found.version} to ${version}`;
  const mb = (asset.size / 1e6).toFixed(0);
  const go = await vscode.window.showInformationMessage(
    `${what}? This downloads ${name} (${mb} MB) from github.com/${REPO}, checks it against the release's SHA256SUMS, and runs its installer, which puts mimic in ${where} and on your PATH.`,
    { modal: true },
    "Download and Install",
  );
  if (go !== "Download and Install") return;
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Mimic ${version}`, cancellable: false }, async (progress) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mimic-install-"));
    try {
      progress.report({ message: `downloading ${name}…` });
      const buf = await download(asset.browser_download_url, path.join(dir, name));
      if (sums) {
        const text = (await download(sums.browser_download_url, path.join(dir, "SHA256SUMS"))).toString("utf8");
        const want = sumFor(text, name);
        const got = crypto.createHash("sha256").update(buf).digest("hex");
        if (!want || want !== got) throw new Error(`the download does not match SHA256SUMS (${got})`);
      }
      progress.report({ message: "unpacking…" });
      const windows = tag.startsWith("windows");
      const zip = path.join(dir, name);
      const pkg = path.join(dir, name.replace(/\.(zip|tar\.gz)$/, ""));
      const script = path.join(pkg, windows ? "install.ps1" : "install.sh");
      let unpack;
      if (windows) {
        // Windows' own tar (Windows 10 and later) reads zip files. PowerShell's
        // Expand-Archive is a script module: where the execution policy
        // forbids scripts it does not load, and that failure did not fail
        // the command (the installer was then missing). It is the fallback,
        // with the policy bypassed and errors made fatal.
        const tarExe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
        unpack = fs.existsSync(tarExe) ? await exec(tarExe, ["-xf", zip, "-C", dir]) : { code: -1, stdout: "", stderr: "no tar.exe" };
        if (unpack.code !== 0 || !fs.existsSync(script)) {
          const q = (p) => `'${p.replace(/'/g, "''")}'`;
          unpack = await exec("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", `$ErrorActionPreference = 'Stop'; Expand-Archive -Force -LiteralPath ${q(zip)} -DestinationPath ${q(dir)}`]);
        }
      } else {
        unpack = await exec("tar", ["-xzf", zip, "-C", dir]);
      }
      if (!fs.existsSync(script)) {
        const why = (unpack.stderr || unpack.stdout || "").trim().split("\n").pop();
        throw new Error(`unpacking ${name} did not give ${path.basename(script)}${why ? `: ${why}` : ""}`);
      }
      progress.report({ message: "installing…" });
      const r = windows
        ? await exec("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script])
        : await exec("/bin/sh", [script]);
      log(r.stdout + r.stderr);
      if (r.code !== 0) throw new Error(`the installer failed (see the Mimic log): ${(r.stderr || r.stdout).trim().split("\n").pop()}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }).then(
    async () => {
      // the installer's folder comes first now: forget an older mimic.path
      // only if it pointed somewhere that no longer runs
      await refresh();
      if (!found.missing) vscode.window.showInformationMessage(`Mimic ${found.version} is installed (${found.path}).`);
    },
    (e) => {
      log(String(e && e.stack ? e.stack : e));
      vscode.window.showErrorMessage(`Installing Mimic failed: ${e.message}`, "Show Log").then((p) => p && output.show());
    },
  );
}

/** A newer Mimic or a newer extension: say so (once a day, unless asked). */
async function checkForUpdates(asked, context) {
  if (!asked && !config().get("checkForUpdates")) return;
  const state = context && context.globalState;
  if (!asked && state && !due(state.get("mimic.lastUpdateCheck"), Date.now())) return;
  if (state) state.update("mimic.lastUpdateCheck", Date.now());
  try {
    const rel = await latest(REPO);
    const v = String(rel.tag_name).replace(/^v/, "");
    if (!found.missing && found.version && newer(v, found.version)) {
      vscode.window.showInformationMessage(`Mimic ${v} is out (you have ${found.version}).`, "Update Mimic", "Release Notes").then((p) => {
        if (p === "Update Mimic") installMimic();
        if (p === "Release Notes") vscode.env.openExternal(vscode.Uri.parse(rel.html_url));
      });
    } else if (asked) {
      vscode.window.showInformationMessage(found.missing ? `The latest Mimic is ${v}.` : `Mimic ${found.version} is the latest.`);
    }
  } catch (e) {
    log(`update check: ${e.message}`);
    if (asked) vscode.window.showErrorMessage(`Cannot reach GitHub: ${e.message}`);
  }
  if (context) await checkExtension(context, asked);
}

async function checkExtension(context, asked) {
  try {
    const rel = await latest(EXT_REPO);
    const v = String(rel.tag_name).replace(/^v/, "");
    const mine = context.extension.packageJSON.version;
    const vsix = (rel.assets || []).find((a) => a.name.endsWith(".vsix"));
    if (!vsix || !newer(v, mine)) return;
    const p = await vscode.window.showInformationMessage(`The Mimic extension ${v} is out (you have ${mine}).`, "Install", "Release Notes");
    if (p === "Release Notes") vscode.env.openExternal(vscode.Uri.parse(rel.html_url));
    if (p !== "Install") return;
    const file = path.join(os.tmpdir(), vsix.name);
    await download(vsix.browser_download_url, file);
    await vscode.commands.executeCommand("workbench.extensions.installExtension", vscode.Uri.file(file));
    const r = await vscode.window.showInformationMessage(`The Mimic extension ${v} is installed. Reload to use it.`, "Reload");
    if (r) vscode.commands.executeCommand("workbench.action.reloadWindow");
  } catch (e) {
    log(`extension update check: ${e.message}`);
    if (asked) vscode.window.showErrorMessage(`Updating the extension failed: ${e.message}`);
  }
}

// ---- errors on save, without a language server -------------------------------------

function projectRoot(file) {
  let dir = path.dirname(file);
  for (;;) {
    if (fs.existsSync(path.join(dir, "mim.mim"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

async function checkOnSave(doc) {
  if (doc.languageId !== "mimic" || doc.uri.scheme !== "file" || found.missing || has("lsp")) return;
  const file = doc.uri.fsPath;
  const root = projectRoot(file);
  const cwd = root || path.dirname(file);
  const r = await exec(mimicPath(), root ? ["check", "--emit-json"] : ["check", "--emit-json", file], { cwd, timeout: 120000 });
  let json;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    log(`mimic check: ${r.stderr || r.stdout}`);
    return;
  }
  const byFile = new Map();
  for (const p of checkProblems(json, cwd)) {
    const d = new vscode.Diagnostic(new vscode.Range(p.start[0], p.start[1], p.end[0], p.end[1]), p.message, p.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
    d.code = p.code;
    d.source = "mimic check";
    if (!byFile.has(p.file)) byFile.set(p.file, []);
    byFile.get(p.file).push(d);
  }
  // files checked before and clean now lose their problems
  fallback.forEach((uri) => {
    if (!byFile.has(uri.fsPath) && (!root || uri.fsPath.startsWith(root))) fallback.delete(uri);
  });
  if (!root) fallback.delete(doc.uri);
  for (const [f, ds] of byFile) fallback.set(vscode.Uri.file(f), ds);
}

// ---- start ------------------------------------------------------------------------------

async function start(context, out) {
  output = out;
  status = vscode.window.createStatusBarItem("mimic.status", vscode.StatusBarAlignment.Right, 100);
  status.name = "Mimic";
  status.command = "mimic.status";
  fallback = vscode.languages.createDiagnosticCollection("mimic-check");
  context.subscriptions.push(
    status,
    fallback,
    vscode.commands.registerCommand("mimic.status", statusMenu),
    vscode.commands.registerCommand("mimic.install", installMimic),
    vscode.commands.registerCommand("mimic.checkForUpdates", () => checkForUpdates(true, context)),
    vscode.commands.registerCommand("mimic.choosePath", choosePath),
    vscode.workspace.onDidSaveTextDocument(checkOnSave),
    vscode.workspace.onDidOpenTextDocument(checkOnSave),
  );
  onChange(async (f) => {
    if (f.missing || has("lsp")) {
      fallback.clear();
    } else {
      for (const d of vscode.workspace.textDocuments) await checkOnSave(d);
    }
  });
  await refresh();
  if (found.missing) missingMessage();
  else if (!has("lsp") && config().get("checkVersion")) {
    vscode.window
      .showInformationMessage(
        `Mimic ${found.version} has no language server, so errors show when you save. Mimic ${NEEDS.lsp[1]} and later show them as you type, with hover and completion.`,
        "Update Mimic",
        "Don't Ask Again",
      )
      .then((p) => {
        if (p === "Update Mimic") installMimic();
        if (p === "Don't Ask Again") config().update("checkVersion", false, vscode.ConfigurationTarget.Global);
      });
  }
  // (in the background: activation never waits for the network)
  checkForUpdates(false, context);
}

module.exports = { start, refresh, onChange, mimicPath, has, need, found: () => found, installMimic, log };
