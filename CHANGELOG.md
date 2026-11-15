# Changelog

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
