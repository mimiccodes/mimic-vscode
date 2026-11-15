// Finding the installed `mimic` and what it can do.
//
// VS Code started from the Dock, Finder or a desktop menu does not read the
// shell's start-up files, so the PATH that the installers extend (in
// ~/.zshrc, ~/.bashrc, …) is not its PATH. Mimic is looked for as the
// user's terminal finds it (VS Code's PATH, then a login shell's), then
// where the installers put it.

const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseVersion, parseCommands } = require("./util");

const exe = process.platform === "win32" ? "mimic.exe" : "mimic";

/** Run a program; resolves to { code, stdout, stderr, missing }. */
function exec(file, args, opts = {}) {
  return new Promise((resolve) => {
    cp.execFile(file, args, { maxBuffer: 64 * 1024 * 1024, timeout: opts.timeout, cwd: opts.cwd, env: { ...process.env, NO_COLOR: "1", ...(opts.env || {}) } }, (err, stdout, stderr) => {
      resolve({
        code: err ? (typeof err.code === "number" ? err.code : -1) : 0,
        stdout: String(stdout),
        stderr: String(stderr),
        missing: !!err && (err.code === "ENOENT" || err.code === "EACCES"),
      });
    });
  });
}

/** Where the installers put mimic. */
function installed() {
  const out = [];
  if (process.env.MIMIC_BIN) out.push(path.join(process.env.MIMIC_BIN, exe));
  if (process.env.MIMIC_HOME) out.push(path.join(process.env.MIMIC_HOME, "bin", exe));
  out.push(path.join(os.homedir(), ".mimic", "bin", exe));
  return out;
}

/** `mimic` as the user's login shell finds it (macOS and Linux). */
async function fromLoginShell() {
  if (process.platform === "win32") return undefined;
  const shell = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/sh");
  const r = await exec(shell, ["-ilc", "command -v mimic"], { timeout: 5000 });
  const line = r.stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("/")).pop();
  return line && fs.existsSync(line) ? line : undefined;
}

/**
 * Find mimic: the setting (if any), VS Code's PATH, the login shell's PATH,
 * the installers' folders. Resolves to
 * { path, how, version, commands } or { missing, tried }.
 */
async function locate(setting) {
  const tried = [];
  const probe = async (file, how) => {
    tried.push(file);
    const v = await exec(file, ["--version"], { timeout: 15000 });
    if (v.missing || v.code !== 0) return undefined;
    const h = await exec(file, ["--help"], { timeout: 15000 });
    return { path: file, how, version: parseVersion(v.stdout), commands: parseCommands(h.stdout) };
  };
  if (setting) return (await probe(setting, "the mimic.path setting")) || { missing: true, tried, setting };
  const onPath = await probe("mimic", "VS Code's PATH");
  if (onPath) return onPath;
  const shell = await fromLoginShell();
  if (shell) {
    const r = await probe(shell, "your shell's PATH");
    if (r) return r;
  }
  for (const f of installed()) {
    if (fs.existsSync(f)) {
      const r = await probe(f, "where the installer puts it");
      if (r) return r;
    }
  }
  return { missing: true, tried };
}

module.exports = { exec, locate, installed };
