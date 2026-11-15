# Changelog

## 0.9.0

- **The Audit view** in the Mimic side bar: errors, warnings and notes, how many are new since the baseline, the trend of the last audits, and the findings by rule (click to jump).
- **Format on save in words or glyphs** (`mimic.format.onSave`: `words` or `glyphs`); formatting that keeps the file's style stays VS Code's own `editor.formatOnSave`.
- **Export as animation**: a trace's rounds as one SVG that plays them.

## 0.8.0

- **Notebooks** (`.mimnb`, *Mimic: New Notebook*): Markdown and code cells; the code cells of a notebook share one session (`mimic repl --json`), so a cell's `let`s and `fn`s are there for the next. *Restart the Notebook's Session* empties it.
- **Coverage** in the Test Explorer (*Run with Coverage*, VS Code 1.88 and newer): `mimic test --coverage`, with the lines run and not run in the editor's gutter and a percentage per file.
- **Failures where they happened**: each line a failed test names gets its own message there, and a broken contract points at its `requires` or `ensures`. A property test that fails shows its smallest failing case above it (`✗ fails for x = 100`), and one click keeps that case as a test of its own.
- With a Mimic that has them, from `mimic lsp`: **signature help**, **rename**, the **call hierarchy**, **smart selection**, and **inferred types** after each `let` (with a code action that writes one in).
- Glyph input works while another panel (the net view, a notebook) has the focus.

## 0.7.0

- **Glyphs as you type**: `\i` becomes `⍳` at once, `\e` `¨`, `\k` `⌿` … (not inside strings or comments; `mimic.glyphInput`).
- **The Glyphs view** in the Mimic side bar: every glyph by group with its word, digraph and meaning, searchable; a click puts it in the code.
- **The Project view**: the project's modules with their functions and types (signature and comment on hover), refreshed on save.
- **`mim.mim`**: completion of blocks and keys, **Install dependencies** and **Add a dependency…** above `dependencies` (a git URL with `@tag`, written into `mim.mim` and installed).
- **Mimic: New Project…** (a program or a library, then opened).
- **Tasks** for build, run, test, check, audit, fmt and doc, with a problem matcher for Mimic's errors; **the build target** in the status bar (this machine, or any target `mimic targets` knows), used by Build and Run.
- **`mimic audit` on save**: findings in Problems, with the rule's manual page as the link (`mimic.audit.onSave`).
- **Preview the Docs** (`mimic doc` beside the code), **Preview the UI** (`mimic run --web` in VS Code's browser), **Run an Example from the Manual…**, and a **Learn Mimic** walkthrough through the tutorial.
- **Agents**: VS Code 1.101 and newer get `mimic mcp` as an MCP server for agent mode (full access inside the project, the rest as settings: `mimic.mcp.*`); *Writing Mimic with Agents* opens the guide.
- Snippets for property tests, contracts, unions, `extern "C"`, `¨`, `let … else` and modules; `env` in debug launch settings.

## 0.6.0

Interaction nets you can see (with a Mimic that has `mimic net show` and `mimic net trace`).

- **Show net** above every function that compiles to an interaction net, and *Mimic: Show Interaction Net* (also for `.mnet` files): its definitions drawn as graphs. Nodes are triangles with the principal port on top (references, numbers and erasers are circles), active pairs are orange, and a reference opens its definition when clicked; any other node opens the function's code. Drag and zoom; **Fit**; the definitions as text.
- **Before compile-time reduction**: the nets as compiled from the code, and how many nodes the compiler removed.
- **Trace**: give the arguments and the call is reduced round by round with the runtime's rules: the result, the interactions, the rules that fired, a chart of how many redexes each round had (the parallelism the net offers), and a player that steps through the rounds while the net is small enough to draw.
- **Export SVG** of the net as drawn.
- **`.mnet` files**: errors on save, formatting, and what each kind of node is on hover.

## 0.5.0

Where the time goes, where code runs, and the REPL (with Mimic 0.3.13 or newer).

- **Profile** above `fn main`, and *Mimic: Profile*: runs `mimic profile` and opens a panel with each function's share of the time (self, and with what it calls) next to where the compiler runs it, the runtime functions that took it, a bar per core showing how busy it was, GPU time and memory. Profile again and the panel shows each function's change since the last run.
- **The share of time in the code**: after a profile, each function's first line ends with its share (🔥 25% and more), with the details on hover (`mimic.profile.showInCode`).
- **The Mimic side bar**: **Hot Functions** (the last profile, click to jump) and **Where Code Runs** (every decision of `mimic why` for the open file: `∥ parallel`, `⇶ fused`, `≋ SIMD`, `▣ GPU`, … with the reason on hover).
- **The REPL**: *Mimic: Open REPL* runs `mimic repl` in a terminal; **Shift+Enter** sends the selection, or the current line, to it.

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
