'use strict';

const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// "file:line:col: error: message" is what zevic prints (see the problem matcher in package.json).
const DIAGNOSTIC = /^(.+?):(\d+):(\d+): (error|warning): (.*)$/;

function config() {
  return vscode.workspace.getConfiguration('zevic');
}

// The environment the Zevic tools run in: ZEVIC (the compiler) and ZEVIC_HOME come from the settings.
function toolEnv() {
  const env = Object.assign({}, process.env);
  const zevic = config().get('zevicPath');
  if (zevic && zevic !== 'zevic') env.ZEVIC = zevic;
  const home = config().get('home');
  if (home) env.ZEVIC_HOME = home;
  return env;
}

// The nearest directory above `file` that has a zevic.toml, or undefined.
function packageRoot(file) {
  let dir = path.dirname(file);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'zevic.toml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function activeRoot() {
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.uri.scheme === 'file') {
    const root = packageRoot(editor.document.uri.fsPath);
    if (root) return root;
  }
  for (const folder of vscode.workspace.workspaceFolders || []) {
    if (fs.existsSync(path.join(folder.uri.fsPath, 'zevic.toml'))) return folder.uri.fsPath;
  }
  return undefined;
}

// ---- tasks (zevpm build / run / test ...) ----

function zevpmTask(root, command, args) {
  const exe = config().get('zevpmPath') || 'zevpm';
  const label = ['zevpm', command].concat(args || []).join(' ');
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(root));
  const execution = new vscode.ShellExecution(exe, [command].concat(args || []), {
    cwd: root,
    env: toolEnv(),
  });
  const task = new vscode.Task(
    { type: 'zevpm', command, args: args || [] },
    folder || vscode.TaskScope.Workspace,
    label,
    'zevpm',
    execution,
    '$zevic'
  );
  if (command === 'build') task.group = vscode.TaskGroup.Build;
  if (command === 'test') task.group = vscode.TaskGroup.Test;
  return task;
}

class ZevpmTaskProvider {
  provideTasks() {
    const tasks = [];
    for (const folder of vscode.workspace.workspaceFolders || []) {
      const root = folder.uri.fsPath;
      if (!fs.existsSync(path.join(root, 'zevic.toml'))) continue;
      for (const command of ['build', 'run', 'test', 'clean', 'fmt']) {
        tasks.push(zevpmTask(root, command, []));
      }
    }
    return tasks;
  }

  resolveTask(task) {
    const def = task.definition;
    if (!def || def.type !== 'zevpm' || !def.command) return undefined;
    const folder = task.scope && task.scope.uri ? task.scope.uri.fsPath : activeRoot();
    if (!folder) return undefined;
    return zevpmTask(folder, def.command, def.args);
  }
}

function runCommand(command) {
  const root = activeRoot();
  if (!root) {
    vscode.window.showWarningMessage('Zevic: no zevic.toml found. Create a package with "zevpm new".');
    return;
  }
  return vscode.tasks.executeTask(zevpmTask(root, command, []));
}

// ---- formatting (zevfmt) ----

function runZevfmt(text, token) {
  return new Promise((resolve, reject) => {
    // zevfmt reads files, so the text of the editor goes through a temporary file.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zevfmt-'));
    const file = path.join(dir, 'buffer.zev');
    const cleanup = () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (e) {
        /* ignore */
      }
    };
    fs.writeFileSync(file, text);
    const exe = config().get('zevfmtPath') || 'zevfmt';
    const child = cp.execFile(exe, [file], { env: toolEnv(), maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      cleanup();
      if (err) {
        const detail = (stderr || stdout || err.message || '').toString().replace(file, 'buffer').trim();
        reject(new Error(detail || String(err)));
      } else {
        resolve(stdout);
      }
    });
    if (token) token.onCancellationRequested(() => child.kill());
  });
}

class ZevicFormatter {
  async provideDocumentFormattingEdits(document, options, token) {
    const text = document.getText();
    let formatted;
    try {
      formatted = await runZevfmt(text, token);
    } catch (e) {
      vscode.window.setStatusBarMessage('Zevic: cannot format: ' + String(e.message).split('\n')[0], 5000);
      return [];
    }
    if (formatted === text) return [];
    const whole = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
    return [vscode.TextEdit.replace(whole, formatted)];
  }
}

function formatPackage() {
  const root = activeRoot();
  if (!root) {
    vscode.window.showWarningMessage('Zevic: no zevic.toml found.');
    return;
  }
  return vscode.tasks.executeTask(zevpmTask(root, 'fmt', []));
}

// ---- errors in the Problems panel (compile on save) ----

function parseDiagnostics(output, base) {
  const byFile = new Map();
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const m = DIAGNOSTIC.exec(line);
    if (!m) continue;
    const file = path.isAbsolute(m[1]) ? m[1] : path.resolve(base, m[1]);
    const row = Math.max(0, parseInt(m[2], 10) - 1);
    const col = Math.max(0, parseInt(m[3], 10) - 1);
    const range = new vscode.Range(row, col, row, col + 1);
    const severity = m[4] === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
    const diagnostic = new vscode.Diagnostic(range, m[5], severity);
    diagnostic.source = 'zevic';
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(diagnostic);
  }
  return byFile;
}

class Checker {
  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('zevic');
    this.running = new Map(); // root -> child process
    this.reported = new Map(); // root -> Set of files that have diagnostics
  }

  dispose() {
    for (const child of this.running.values()) child.kill();
    this.collection.dispose();
  }

  check(document) {
    if (!config().get('checkOnSave')) return;
    if (document.uri.scheme !== 'file') return;
    const root = packageRoot(document.uri.fsPath);
    if (!root) return;

    const previous = this.running.get(root);
    if (previous) previous.kill();

    const exe = config().get('zevpmPath') || 'zevpm';
    const child = cp.execFile(exe, ['build'], { cwd: root, env: toolEnv(), maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (this.running.get(root) !== child) return; // replaced by a newer run
      this.running.delete(root);
      if (err && err.killed) return;
      if (err && err.code === 'ENOENT') {
        vscode.window.setStatusBarMessage('Zevic: zevpm was not found (see the zevic.zevpmPath setting)', 8000);
        return;
      }
      this.publish(root, parseDiagnostics(String(stdout) + '\n' + String(stderr), root));
    });
    this.running.set(root, child);
  }

  publish(root, byFile) {
    for (const file of this.reported.get(root) || []) {
      if (!byFile.has(file)) this.collection.delete(vscode.Uri.file(file));
    }
    for (const [file, diagnostics] of byFile) {
      this.collection.set(vscode.Uri.file(file), diagnostics);
    }
    this.reported.set(root, new Set(byFile.keys()));
  }
}

// ---- activation ----

function activate(context) {
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider({ language: 'zevic' }, new ZevicFormatter()),
    vscode.tasks.registerTaskProvider('zevpm', new ZevpmTaskProvider()),
    vscode.commands.registerCommand('zevic.build', () => runCommand('build')),
    vscode.commands.registerCommand('zevic.run', () => runCommand('run')),
    vscode.commands.registerCommand('zevic.test', () => runCommand('test')),
    vscode.commands.registerCommand('zevic.formatPackage', formatPackage)
  );

  const checker = new Checker();
  context.subscriptions.push(checker);
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId === 'zevic') checker.check(document);
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate, parseDiagnostics, packageRoot };
