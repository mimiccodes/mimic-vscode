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

## Requirements

A `mimic` with the language server (`mimic lsp`, from 0.3.4; `mimic dap` for debugging, from 0.3.6), on your `PATH` (or set `mimic.path`). Download it from the [releases](https://github.com/mimiccodes/mimic/releases); the extension offers the download when `mimic` is missing or too old.

## Settings

| Setting | Default | |
|---|---|---|
| `mimic.path` | `mimic` | The `mimic` program |
| `mimic.languageServer.enable` | `true` | Run `mimic lsp` |
| `mimic.codeLens.enable` | `true` | **Run** and **Run test** above functions and tests |
| `mimic.checkVersion` | `true` | Check that `mimic` has the language server |

## Development

This repository is a submodule of [mimic](https://github.com/mimiccodes/mimic) (`editors/vscode`), developed together with the compiler. `npm run sync` copies the grammars from `editors/syntax` and the glyph table from the compiler; `npm test` checks the extension; `npm run package` builds the `.vsix`.

## Licence

Apache License 2.0. Copyright 2026 Harcorp Industries.
