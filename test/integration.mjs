// Start VS Code with this extension on test/workspace and run test/suite.js.
// Uses the `mimic` (0.3.4 or newer) first on PATH, written into the test
// workspace's settings: VS Code may take its PATH from the login shell, where
// another mimic can come first. On Linux without a display, run under
// xvfb-run.
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { runTests } from "@vscode/test-electron";

const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// `--old PATH`: the suite for a mimic without a language server
const old = process.argv.indexOf("--old");
const which = process.platform === "win32" ? "where" : "which";
const mimic = old > 0 ? process.argv[old + 1] : execFileSync(which, ["mimic"], { encoding: "utf8" }).split(/\r?\n/)[0].trim();
fs.mkdirSync(path.join(ext, "test/workspace/.vscode"), { recursive: true });
fs.writeFileSync(path.join(ext, "test/workspace/.vscode/settings.json"), JSON.stringify({ "mimic.path": mimic }, null, 2));
await runTests({
  extensionDevelopmentPath: ext,
  extensionTestsPath: path.join(ext, old > 0 ? "test/suite-old.js" : "test/suite.js"),
  launchArgs: [path.join(ext, "test/workspace"), "--disable-extensions", "--skip-welcome", "--skip-release-notes"],
});
