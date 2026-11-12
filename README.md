# Zevic for Visual Studio Code

Language support for [Zevic](https://github.com/zevic-lang/zevic), a small, easy-to-write native language that can use C code as it is.

## Features

- **Syntax highlighting** for `.zev` files: keywords, types, numbers with type suffixes, strings with `${...}` interpolation, raw and multi-line strings, nested comments, loop labels and more.
- **Snippets**: type `main`, `fn`, `class`, `struct`, `enum`, `match`, `matchopt`, `matchres`, `forr`, `fori`, `label`, `test`, `externc`, `exportc` and press Tab.
- **Formatting** with `zevfmt` (Format Document, or format on save).
- **Tasks and commands** for `zevpm`: build, run, test, clean and fmt. Open the command palette and type "Zevic".
- **Errors in the Problems panel**: the package is built when you save a file, and the compiler errors are shown at their line and column.

## Requirements

Install the Zevic tools (`zevic`, `zevpm` and `zevfmt`) and put them on your `PATH`. See the [Zevic repository](https://github.com/zevic-lang/zevic) for how to build them (`make` is enough, and it needs only `clang`).

If they are not on your `PATH`, set the paths in the settings below.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `zevic.zevpmPath` | `zevpm` | the `zevpm` executable |
| `zevic.zevfmtPath` | `zevfmt` | the `zevfmt` executable |
| `zevic.zevicPath` | `zevic` | the compiler (passed to `zevpm` through `ZEVIC`) |
| `zevic.home` | empty | the value of `ZEVIC_HOME` (where `packages/Zevic` and `runtime/` are) |
| `zevic.checkOnSave` | `true` | build the package on save and show the errors |

## Using the tasks

Run "Tasks: Run Task" and pick `zevpm: build`, or bind the commands to keys. To use a task in `tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    { "type": "zevpm", "command": "test", "group": "test" }
  ]
}
```

## Building the extension

```sh
npm install
npm test            # checks the grammar
npx vsce package    # makes zevic-<version>.vsix
code --install-extension zevic-0.1.0.vsix
```

## Not included yet

A language server (completion, go to definition, hover, rename) is not part of this extension. It needs the compiler to report several errors with their positions, which is planned for later.

## License

Apache-2.0 (see `LICENSE`).
