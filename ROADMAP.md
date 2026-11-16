# Roadmap

What the extension does and will do. ✅ done, ◐ in progress, · planned.
Items marked **(mimic)** also need work in the compiler, in the
[mimic](https://github.com/mimiccodes/mimic) repository.

## Phase 1: setup that just works

| | Item |
|---|---|
| ✅ | A1. Find `mimic` without asking: the `mimic.path` setting, then `$MIMIC_HOME/bin`, `~/.mimic/bin` (where the installers put it), the login shell's `PATH`, then `PATH` |
| ✅ | A2. Status bar: the Mimic version and what it can do; click for details and actions |
| ✅ | A3. Clear messages when Mimic is missing or too old for a feature, with a button that fixes it |
| ✅ | A4. Errors on save with a Mimic that has no language server (`mimic check --emit-json`) |
| ✅ | A5. **Mimic: Install or Update Mimic**: the right GitHub release for this machine, checked against its SHA256SUMS, installed by its own installer (asks first) |
| ✅ | A6. A daily check for a newer Mimic and a newer extension (can be turned off) |
| ✅ | A7. A Get Started walkthrough |

## Phase 2: performance and the REPL

| | Item |
|---|---|
| ✅ | E33. **Profile** above `fn main` and as a command (`mimic profile --json`) |
| ✅ | E34. Time beside each function (a heat mark in the gutter) and a hot-functions view |
| ✅ | E35. A profile panel: functions, cores, CPU and GPU, memory |
| ✅ | E36. A "where code runs" panel (`mimic why`), click to jump |
| ✅ | E37. Compare two profiles |
| ✅ | H46. **Mimic: Open REPL** and **Send Selection to REPL** (Shift+Enter) |

## Phase 3: seeing interaction nets

| | Item |
|---|---|
| ✅ | N1. `mimic net show --json`: nets as nodes, ports and wires, linked to the source **(mimic)** |
| ✅ | N2. `mimic net trace --json`: reduction step by step, with the redexes ready at each step **(mimic)** |
| ✅ | N3. Statistics: interactions, parallelism, what compile-time reduction removed **(mimic)** |
| ✅ | N4. **Show net** above functions that run as nets, and a preview beside `.mnet` files |
| ✅ | N5. A graph view: nodes by kind, principal ports, layout, zoom, REFs that fold |
| ✅ | N6. Node ↔ source (a node opens its function's code; **Show net** above a function opens its nets) |
| ✅ | N7. Step through a reduction, with the redexes that fire together |
| ✅ | N8. A parallelism chart: ready redexes per step |
| ✅ | N9. Before and after compile-time reduction |
| ✅ | N10. `.mnet` editing: errors on save, hover on node kinds, formatting |
| ✅ | N11. Limits for big nets (sampled traces, said so) |
| ✅ | N12. Export as SVG, and a trace as an SVG that plays its rounds |

## Phase 4: everything else

| | Item |
|---|---|
| ✅ | B11. Glyph input as you type (`\i` becomes `⍳` at once) |
| ✅ | B12. A glyph bar |
| ✅ | B13. More snippets (tests, property tests, contracts, match, types, extern "C") |
| ✅ | B14. Signature help **(mimic)** |
| ✅ | B15. Rename **(mimic)** |
| ✅ | B16. Inferred types as inlay hints **(mimic)** |
| ✅ | B17. Folding by brackets and indentation; smart selection (from `mimic lsp`) |
| ✅ | B18. Format on save: keeping the file's style (`"[mimic]": { "editor.formatOnSave": true }`), or all words or all glyphs (`mimic.format.onSave`) |
| ◐ | B19. More code actions: write an inferred type in ✅, extract into a function ✅; inline a `let` to come **(mimic)** |
| ✅ | C21. Call hierarchy **(mimic)** |
| ✅ | C22. A module tree from `mod.mim` |
| ✅ | C23. `mim.mim`: completion, checks, Install dependencies |
| ✅ | C24. New Project, Add Dependency, workspace members |
| ✅ | D26. Tasks for build, run, test, audit and fmt, with problem matchers |
| ✅ | D27. Launch settings: arguments, the folder, environment, stop on entry |
| ✅ | D28. A property test's smallest failing case on the code, kept as a test of its own in one click (the replay that stays) |
| ✅ | D29. Contract failures linked to `requires`/`ensures` |
| ✅ | D30. Test coverage **(mimic)** |
| ◐ | D31. Debugger: a list or matrix as a table and chart from the Variables view ✅; watch expressions and breakpoint conditions in Mimic syntax to come **(mimic)** |
| ✅ | E38. Target and GPU picker |
| ✅ | F39. `mimic audit` findings in Problems on save |
| ✅ | F40. The Audit view: the counts, new since the baseline, the trend of the last audits, findings by rule |
| ✅ | G42. The Glyphs view: every glyph by group, its word, digraph and meaning, searchable, inserted with a click |
| ✅ | G43. *Run an Example from the Manual…* |
| ✅ | G44. `mimic doc` preview |
| ✅ | G45. The tutorial as a walkthrough |
| ✅ | H47. Mimic notebooks (`.mimnb`, on `mimic repl --json`) |
| ✅ | I48. `mimic mcp` registered with VS Code for agents |
| ✅ | I49. Agent guide and prompts |
| ✅ | J50. Live preview of UI programs (`mimic run --web`) |
| · | K52. Marketplace and Open VSX (needs the publisher tokens) |
| ✅ | K53. Installing a newer extension from GitHub inside VS Code |

Already there: the language server (errors as you type, hover, definitions,
references, completion, formatting, outline, C names in their own colour),
the glyph palette and conversion, Run, Debug and Run test, the Test
Explorer, the manual, "where code runs" labels, debugging with `mimic dap`,
and a `.vsix` on GitHub for each version.
