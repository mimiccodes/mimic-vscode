// Start VS Code with this extension on test/workspace and run test/suite.js.
// Needs `mimic` (0.3.4 or newer) on PATH; on Linux without a display, run
// under xvfb-run.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await runTests({
  extensionDevelopmentPath: ext,
  extensionTestsPath: path.join(ext, "test/suite.js"),
  launchArgs: [path.join(ext, "test/workspace"), "--disable-extensions", "--skip-welcome", "--skip-release-notes"],
});
