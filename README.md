![Mimic](images/banner.png)

# Mimic for Visual Studio Code

**Everything that can run in parallel will run in parallel.**

Support for [Mimic](https://github.com/mimiccodes/mimic), the compiled array language that is parallel by default. The language features come from `mimic lsp`, the compiler's own analysis, so the editor always agrees with `mimic build`.

## Features

**The language**, from `mimic lsp`, the compiler's own analysis:
* **Highlighting** for `.mim` and `.mnet` files: every glyph and its word, strings with interpolation, the high minus; names from C (`c::sqrt`) in their own colour.
* **Errors as you type**, with the compiler's quick fixes.
* **Hover** (signatures, comments, effects such as `pure`; for a C function, its header; for a glyph, what it does and how to type it), **go to definition**, **find references** (into the standard library too), **rename**, the **call hierarchy**, **signature help**, smart selection, and the **inferred type** after each `let`.
* **Glyphs as you type**: `\i` becomes `⍳` at once. The **glyph palette** (`Cmd+Alt+G` / `Ctrl+Alt+G`) and the **Glyphs** view list every glyph with its word and meaning.
* **Completion**, **formatting** that keeps your file's style (or all words or all glyphs on save), *Convert File to Glyphs / Words*, *Extract into a function*.

**Running and testing:**
* **▶ Run**, **Debug** and **Profile** above `fn main`; **▶ Run test** above every test; the **Test Explorer** for tests and examples in comments (`// > expression`), with both sides of a failed `expect`, each failure on its line, a property test's smallest failing case kept as a test in one click, and **coverage** in the gutter.
* **Debugging** with `mimic dap` (F5): breakpoints, stepping, values as Mimic prints them (`[3 1 4]`, `Point { x: 1.5, y: 2.0 }`, `Some(7)`), and a list or matrix as a table and chart. It needs LLVM's `lldb-dap` (with Xcode on macOS, the `lldb` package on Linux).
* **The REPL** (*Mimic: Open REPL*, **Shift+Enter** sends the selection or line) and **notebooks** (`.mimnb`), whose cells share one session.
* **Tasks** for build, run, test, check, audit, fmt and doc, with the **build target** in the status bar.

**Seeing what Mimic does:**
* **Where the time goes**: a profile panel with each function's share of the time next to where it runs, how busy each core was, GPU time and memory, and the change since the last profile; each function's share in the code; the **Hot Functions** view.
* **Where code runs**: labels after the code (`∥ parallel`, `⇶ fused`, `▣ GPU`, …) and the **Where Code Runs** view, each with the reason.
* **Interaction nets**: **Show net** above a function that compiles to one draws its nets; **Trace** reduces a call round by round, charts how many redexes each round had, plays the rounds, and exports them as SVG.
* **The Audit view** and audit findings in Problems on save.

**The project and the manual:** the **Project** view (modules, functions, types), help with `mim.mim` (completion, *Install dependencies*, *Add a dependency…*), *New Project…*, the manual beside your code (`Cmd+Alt+M` / `Ctrl+Alt+M` on a word), runnable examples, previews of the docs and of UI programs, and the *Get Started* and *Learn Mimic* walkthroughs.

**Agents:** in VS Code 1.101 and newer, `mimic mcp` is offered to agent mode: it checks, builds, runs and tests Mimic and reads the manual, inside your project (the `mimic.mcp.*` settings widen or narrow that).

**Setup that just works:** the extension finds Mimic as your terminal does, or where its installer puts it; the status bar shows its version and what it can do; *Mimic: Install or Update Mimic* installs the release for your machine (checked against its `SHA256SUMS`); a daily check says when a newer Mimic or extension is out.

## Requirements

Mimic, from the [releases](https://github.com/mimiccodes/mimic/releases) or *Mimic: Install or Update Mimic*. The language server needs Mimic 0.3.4 or newer, and the newest features (profiles, net views, notebooks, coverage, rename) Mimic 0.3; with an older Mimic, errors show when you save, and each feature says which Mimic brings it. [ROADMAP.md](ROADMAP.md) lists what is done and what comes next.

## Settings

| Setting | Default | |
|---|---|---|
| `mimic.path` | (empty: found) | The `mimic` program, as a full path. Leave empty to find it as your terminal does (VS Code's `PATH`, then your shell's), then where the installers put it (`~/.mimic/bin`). |
| `mimic.languageServer.enable` | `true` | Run `mimic lsp`: errors as you type, hover, go to definition, completion and formatting. |
| `mimic.checkVersion` | `true` | Check that `mimic` is new enough for this extension, and offer the download when it is not. |
| `mimic.codeLens.enable` | `true` | Show **Run** above `fn main` and **Run test** above each `test` block. |
| `mimic.checkForUpdates` | `true` | Once a day, check GitHub for a newer Mimic and a newer version of this extension. |
| `mimic.profile.showInCode` | `true` | After a profile, show each function's share of the time at the end of its first line. |
| `mimic.glyphInput` | `true` | Turn a backslash digraph into its glyph as you type (`\i` becomes `⍳`), except in strings and comments. |
| `mimic.target` | (empty: this machine) | The target of the Build and Run tasks (`--target`), e.g. `x86_64-linux-musl`; empty for this machine. |
| `mimic.audit.onSave` | `true` | Run `mimic audit` when a Mimic file is saved and show its findings in Problems. |
| `mimic.mcp.enable` | `true` | Offer `mimic mcp` to agents in VS Code (VS Code 1.101 and newer): check, build, run and test Mimic, read the manual. |
| `mimic.mcp.allowOutside` | `false` | Let agents read and write files outside the project (`--allow-outside`). |
| `mimic.mcp.allowInstall` | `false` | Let agents install libraries (`--allow-install`). |
| `mimic.mcp.allowNetwork` | `false` | Let agents run programs that use the network or run other programs (`--allow-network`). |
| `mimic.mcp.readOnly` | `false` | Agents only read, check and look up (`--read-only`). |
| `mimic.mcp.noRun` | `false` | Agents do not run programs or tests (`--no-run`). |
| `mimic.format.onSave` | `off` | Format Mimic files when they are saved (`mimic fmt`), in words or in glyphs. |

## Development

This repository is a submodule of [mimic](https://github.com/mimiccodes/mimic) (`editors/vscode`), developed together with the compiler. `npm run sync` copies the grammars from `editors/syntax` and the glyph table from the compiler; `npm test` checks the extension; `npm run package` builds the `.vsix`.

## Licence

Apache License 2.0. Copyright 2026 Harcorp Industries.
