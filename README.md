# Mimic for Visual Studio Code

Support for [Mimic](https://github.com/mimiccodes/mimic), the array language that is parallel by default.

Planned features:

* Highlighting for `.mim` and `.mnet` files, from [mimic-syntax](https://github.com/mimiccodes/mimic-syntax).
* Errors as you type, quick fixes, formatting, hover, go to definition and find references, through `mimic lsp`.
* Glyph input (`\i` becomes `⍳`) and a glyph palette that shows each glyph's word and meaning.
* Run and Test above functions and tests, and the test explorer.
* Debugging, with lists and records shown as values.
* The Mimic manual in a side panel.
* Labels showing where code runs: in parallel, on the GPU, as a task.

The extension needs `mimic` on your `PATH`; it checks the version and offers to update it. Download Mimic from the [releases](https://github.com/mimiccodes/mimic/releases).

The `mimic` repository includes this one as a submodule (`editors/vscode`), so the two are developed side by side.

## Licence

Apache License 2.0. Copyright 2026 Harcorp Industries.
