![Mimic](images/banner.png)

# Mimic for Visual Studio Code

**Everything that can run in parallel will run in parallel.**

Support for [Mimic](https://github.com/mimiccodes/mimic), the compiled array language that is parallel by default. The language features come from `mimic lsp`, the compiler's own analysis, so the editor always agrees with `mimic build`.

## Features

* **Highlighting** for `.mim` and `.mnet` files: every glyph and its word, strings with interpolation, durations, the high minus; names from C (`c::sqrt`) in their own colour.
* **Errors as you type**, with quick fixes from the compiler.
* **Hover**: signatures, comments and effects (`pure`, `concurrent`, …); for a C function, the header it came from; for a glyph, what it does and how to type it.
* **Go to definition and find references**, into the standard library too.
* **Glyph input**: type `\i` and pick `⍳`. Or open the **glyph palette** (`Cmd+Alt+G` on macOS, `Ctrl+Alt+G` elsewhere), which lists every glyph with its word and meaning.
* **Completion** of names, modules (`fs::`), words and keywords; **formatting** (`mimic fmt`) that keeps your file's style, words or glyphs; **Convert File to Glyphs / Words**.
* **Run and test**: **▶ Run** above `fn main`, **▶ Run test** above every `test` block, and the **Test Explorer** for `test` blocks and examples in comments (`// > expression`), with both sides of a failed `expect`.
* **Debugging**: breakpoints on `.mim` lines, stepping, the call stack, and variables shown as Mimic prints them (`[3 1 4]`, `Point { x: 1.5, y: 2.0 }`, `["a": 1]`, `Some(7)`). Press **F5**, or **Debug** above `fn main`. It runs `mimic dap`, which needs LLVM's `lldb-dap` (with Xcode on macOS, the `lldb` package on Linux).
* **The manual** beside your code: *Mimic: Open the Manual…*, *Search the Manual…*, or `Cmd+Alt+M` / `Ctrl+Alt+M` for the word under the cursor.

* **Where the time goes**: **Profile** above `fn main` opens a panel with each function's share of the time, where it runs, how busy each core was, GPU time and memory, and the change since the last profile; each function's share also shows in the code. The **Mimic** side bar lists the hot functions and every decision about where the open file's code runs.
* **Interaction nets you can see**: **Show net** above a function that compiles to an interaction net draws its nets; **Trace** reduces a call round by round, charts the parallelism and plays the rounds. `.mnet` files get errors, formatting and hovers.
* **Glyphs as you type** (`\i` → `⍳`), the **Glyphs** and **Project** views, `mim.mim` help, tasks with a build target, `mimic audit` on save, previews of the docs and of UI programs, the tutorial as a walkthrough, and `mimic mcp` for agents in VS Code.
* **The REPL**: *Mimic: Open REPL*, and **Shift+Enter** to send the selection or line to it.
* **Setup that just works**: the extension finds Mimic as your terminal does, or where its installer puts it; the status bar shows its version and what it can do; *Mimic: Install or Update Mimic* installs the release for your machine from GitHub (checked against its `SHA256SUMS`); a daily check says when a newer Mimic or extension is out.

## Requirements

Mimic, from the [releases](https://github.com/mimiccodes/mimic/releases), or *Mimic: Install or Update Mimic*. Errors as you type, hover and completion need Mimic 0.3.4 or newer (`mimic lsp`), debugging 0.3.6 (`mimic dap`); with an older Mimic, errors show when you save. [ROADMAP.md](ROADMAP.md) lists what comes next.

## Settings

| Setting | Default | |
|---|---|---|
| `mimic.path` | (empty: found) | The `mimic` program, if it is not where your terminal or the installer finds it |
| `mimic.languageServer.enable` | `true` | Run `mimic lsp` |
| `mimic.codeLens.enable` | `true` | **Run** and **Run test** above functions and tests |
| `mimic.checkVersion` | `true` | Say when `mimic` has no language server |
| `mimic.checkForUpdates` | `true` | Once a day, check GitHub for a newer Mimic and extension |
| `mimic.profile.showInCode` | `true` | After a profile, each function's share of the time in the code |

## Development

This repository is a submodule of [mimic](https://github.com/mimiccodes/mimic) (`editors/vscode`), developed together with the compiler. `npm run sync` copies the grammars from `editors/syntax` and the glyph table from the compiler; `npm test` checks the extension; `npm run package` builds the `.vsix`.

## Licence

Apache License 2.0. Copyright 2026 Harcorp Industries.
