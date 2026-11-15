# Changelog

## 0.4.0

Setup that just works.

- **Finds Mimic by itself.** VS Code started from the Dock, Finder or a desktop menu does not see the PATH your shell's start-up files set, so it asked for `mimic.path` even with Mimic installed. It now looks where your terminal does (VS Code's PATH, then your login shell's), then where the installers put Mimic (`~/.mimic/bin`, `%USERPROFILE%\.mimic\bin`, `$MIMIC_HOME/bin`). `mimic.path` is only for a `mimic` elsewhere.
- **The status bar** shows the Mimic in use and what it can do (the language server, debugging, where code runs, profiling, the REPL); click it to update Mimic, choose another `mimic`, find it again, or see the log.
- **Mimic: Install or Update Mimic** downloads the release for your machine from GitHub, checks it against the release's `SHA256SUMS`, and runs its installer, after asking.
- **Errors on save with an older Mimic.** A Mimic without the language server (before 0.3.4) still shows its errors, when a file is saved (`mimic check`).
- **Clear messages**: a feature this Mimic cannot do says which version brings it, with an **Update Mimic** button.
- **Update checks**, once a day: a newer Mimic, and a newer version of this extension (installed from GitHub in one click). `mimic.checkForUpdates` turns them off.
- **Get Started**: a walkthrough from installing Mimic to running, testing and the manual.

## 0.3.6

The first release. It needs a `mimic` with `mimic lsp` (from 0.3.4; debugging needs `mimic dap`, from 0.3.6).

- Highlighting for `.mim` and `.mnet` (the grammars of [mimic-syntax](https://github.com/mimiccodes/mimic-syntax)), also inside `mimic` code blocks of Markdown files.
- `mimic lsp`: errors as you type with quick fixes, hover, go to definition (into the standard library), find references, completion, glyph input (`\i` → `⍳`), formatting, the outline, workspace symbols, and names from C in their own colour.
- The glyph palette (`Cmd/Ctrl+Alt+G`): every glyph with its word, how to type it and what it does.
- **Run** above `fn main` and **Run test** above each test; the Test Explorer runs `test` blocks and examples in comments, and shows both sides of a failed `expect`.
- The manual beside the code: open a page, search it, or `Cmd/Ctrl+Alt+M` for the word under the cursor.
- Debugging with `mimic dap` (F5, or **Debug** above `fn main`): breakpoints, stepping, and variables shown as Mimic prints them.
- Convert a file to glyphs or to words.
- Checks that `mimic` is installed and has the language server, and offers the download when it does not.
