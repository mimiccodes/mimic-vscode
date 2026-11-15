# Changelog

## 0.3.5

The first release, with Mimic 0.3.5 (it needs `mimic` 0.3.4 or newer).

- Highlighting for `.mim` and `.mnet` (the grammars of [mimic-syntax](https://github.com/mimiccodes/mimic-syntax)), also inside `mimic` code blocks of Markdown files.
- `mimic lsp`: errors as you type with quick fixes, hover, go to definition (into the standard library), find references, completion, glyph input (`\i` → `⍳`), formatting, the outline, workspace symbols, and names from C in their own colour.
- The glyph palette (`Cmd/Ctrl+Alt+G`): every glyph with its word, how to type it and what it does.
- **Run** above `fn main` and **Run test** above each test; the Test Explorer runs `test` blocks and examples in comments, and shows both sides of a failed `expect`.
- The manual beside the code: open a page, search it, or `Cmd/Ctrl+Alt+M` for the word under the cursor.
- Convert a file to glyphs or to words.
- Checks that `mimic` is installed and new enough, and offers the download when it is not.
