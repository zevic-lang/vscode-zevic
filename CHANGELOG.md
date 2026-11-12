# Changelog

## 0.1.0

First release.

- Syntax highlighting for `.zev` files: keywords, types (including the C types), literals (integers with suffixes, decimals, characters, bytes), strings with `${...}` interpolation, raw strings and multi-line strings, nested block comments, doc comments, loop labels (`name@`, `break@name`), `extern` / `export` blocks and `test` blocks.
- Language configuration: comments, brackets, auto-closing pairs, indentation rules and folding markers.
- 27 snippets (`main`, `fn`, `class`, `struct`, `enum`, `match`, `forr`, `test`, `externc` and more).
- Formatting with `zevfmt` ("Format Document").
- `zevpm` tasks (build, run, test, clean, fmt) with a problem matcher, and the commands "Zevic: Build the package", "Run the package", "Run the tests" and "Format all files in the package".
- Compile errors in the Problems panel when a file is saved (`zevic.checkOnSave`).
