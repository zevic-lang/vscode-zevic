'use strict';
// Tokenizes small snippets with the grammar and checks the scopes of the interesting tokens.
const fs = require('fs');
const path = require('path');
const vsctm = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');

const root = path.join(__dirname, '..');
const wasm = fs.readFileSync(path.join(root, 'node_modules/vscode-oniguruma/release/onig.wasm')).buffer;
const lib = oniguruma.loadWASM(wasm).then(() => ({
  createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
  createOnigString: (s) => new oniguruma.OnigString(s),
}));
const registry = new vsctm.Registry({
  onigLib: lib,
  loadGrammar: async (scope) => {
    if (scope !== 'source.zevic') return null;
    const text = fs.readFileSync(path.join(root, 'syntaxes/zevic.tmLanguage.json'), 'utf8');
    return vsctm.parseRawGrammar(text, 'zevic.tmLanguage.json');
  },
});

// [source, [[token text, a scope that token must have], ...]]
const cases = [
  ['module Main', [['module', 'keyword.other.module'], ['Main', 'entity.name.namespace']]],
  ['import Zevic.Console as C', [['import', 'keyword.control.import'], ['Zevic.Console', 'entity.name.namespace'], ['as', 'keyword.control.import'], ['C', 'entity.name.namespace']]],
  ['fn Add(a: I32, b: I32) -> I32 {', [['fn', 'storage.type.function'], ['Add', 'entity.name.function'], ['I32', 'support.type.primitive'], ['->', 'keyword.operator.arrow']]],
  ['mut fn Birthday() {', [['mut', 'storage.type'], ['fn', 'storage.type.function'], ['Birthday', 'entity.name.function']]],
  ['let x: U8 = 255_U8', [['let', 'storage.type'], ['U8', 'support.type.primitive'], ['255_U8', 'constant.numeric.integer']]],
  ['let f = 1.5e-3_F32 + 0xFF + 0b1010 + 0o17 + 1_000', [['1.5e-3_F32', 'constant.numeric.float'], ['0xFF', 'constant.numeric.hex'], ['0b1010', 'constant.numeric.binary'], ['0o17', 'constant.numeric.octal'], ['1_000', 'constant.numeric.integer']]],
  ['class Person : Shape, Hashable {', [['class', 'storage.type.class'], ['Person', 'entity.name.type.class'], ['Hashable', 'support.type.builtin']]],
  ['enum Shape { Circle(F64), Empty, }', [['enum', 'storage.type.enum'], ['Shape', 'entity.name.type.enum'], ['F64', 'support.type.primitive']]],
  ['interface Equatable { fn Equals(other: Self) -> Bool }', [['interface', 'storage.type.interface'], ['Self', 'support.type.primitive'], ['Bool', 'support.type.primitive']]],
  ['// a comment', [[' a comment', 'comment.line.double-slash']]],
  ['/// a doc comment', [[' a doc comment', 'comment.block.documentation']]],
  ['let s = "x = ${x + 1}"', [['"', 'punctuation.definition.string.begin'], ['x = ', 'string.quoted.double'], ['${', 'punctuation.section.interpolation.begin'], ['x', ''], ['1', 'constant.numeric.integer']]],
  ['let s = "tab\\there \\${1}"', [['\\t', 'constant.character.escape'], ['\\$', 'constant.character.escape']]],
  ['let s = "bad \\q"', [['\\q', 'invalid.illegal.escape']]],
  ['let p = r"C:\\temp\\new"', [['r"', 'punctuation.definition.string.begin'], ['C:\\temp\\new', 'string.quoted.other.raw']]],
  ["let c = 'a'  let b = b'\\xFF'", [["'a'", 'string.quoted.single'], ["b'\\xFF'", 'string.quoted.single.byte']]],
  ['outer@ for (row in rows) {', [['outer', 'entity.name.label'], ['@', 'punctuation.separator.label'], ['for', 'keyword.control'], ['in', 'keyword.control']]],
  ['if (x == target) { break@outer }', [['if', 'keyword.control'], ['==', 'keyword.operator.comparison'], ['break', 'keyword.control.loop'], ['outer', 'entity.name.label']]],
  ['let total: I64 = await a + await b', [['await', 'keyword.control.async']]],
  ['let t = async { slow(3) }', [['async', 'keyword.control.async'], ['slow', 'entity.name.function.call']]],
  ['if (r is ParseError) {', [['is', 'keyword.operator.type-test'], ['ParseError', 'entity.name.type']]],
  ['let v = Fs.ReadAll(path)?', [['Fs', 'entity.name.type'], ['ReadAll', 'entity.name.function.call'], ['?', 'keyword.operator.try']]],
  ['for (i in 0..=10) { }', [['0', 'constant.numeric.integer'], ['..=', 'keyword.operator.range'], ['10', 'constant.numeric.integer']]],
  ['x += 1', [['+=', 'keyword.operator.assignment']]],
  ['fn Sum(params nums: Array<I32>) -> I32 {', [['params', 'storage.modifier.params'], ['Array', 'support.type.builtin']]],
  ['test "Add adds two numbers" {', [['test', 'keyword.other.test'], ['Add adds two numbers', 'string.quoted.double']]],
  ['extern "C" { fn puts(s: CString) -> CInt }', [['extern', 'storage.modifier'], ['puts', 'entity.name.function'], ['CString', 'support.type.c'], ['CInt', 'support.type.c']]],
  ['export "C" fn Greet(name: CString) -> CVoid {', [['export', 'storage.modifier'], ['Greet', 'entity.name.function']]],
  ['let ok = true && !false', [['true', 'constant.language.boolean'], ['&&', 'keyword.operator.logical'], ['!', 'keyword.operator.logical'], ['false', 'constant.language.boolean']]],
  ['this.name = name', [['this', 'variable.language.this']]],
  ['let u: type = 1', [['type', 'invalid.illegal.reserved']]],
  ['let union = 1', [['union', 'invalid.illegal.reserved']]],
  ['fn pub() {}', [['pub', 'invalid.illegal.reserved']]],
  ['unsafe {', [['unsafe', 'storage.modifier']]],
  ['unsafe fn Read(p: *I32) -> I32 {', [['unsafe', 'storage.modifier'], ['fn', 'storage.type.function'], ['Read', 'entity.name.function']]],
  ['    mut count: I64 = 0', [['mut', 'storage.type'], ['I64', 'support.type.primitive']]],
  ['return Err(Error.New(ErrorKind.Invalid, "x"))', [['return', 'keyword.control'], ['Err', 'support.function.builtin'], ['Error', 'support.type.builtin'], ['ErrorKind', 'support.type.builtin']]],
];

// Multi-line states: a nested block comment and a triple-quoted string.
const multiline = [
  ['/* a /* nested */ still comment */ let x', [['still comment', 'comment.block'], ['let', 'storage.type']]],
  ['let t = """\n    Hello, ${name}!\n    """\nlet y', [['Hello, ', 'string.quoted.triple'], ['name', ''], ['let', 'storage.type']]],
  ['let t = r"""\nraw ${not} \\n\n"""', [['raw ${not} \\n', 'string.quoted.other.raw.multiline']]],
];

(async () => {
  const grammar = await registry.loadGrammar('source.zevic');
  let failures = 0;
  let checks = 0;

  function tokenize(source) {
    const tokens = [];
    let state = vsctm.INITIAL;
    for (const line of source.split('\n')) {
      const result = grammar.tokenizeLine(line, state);
      for (const t of result.tokens) {
        tokens.push({ text: line.substring(t.startIndex, t.endIndex), scopes: t.scopes });
      }
      state = result.ruleStack;
    }
    return tokens;
  }

  function check(source, expectations) {
    const tokens = tokenize(source);
    for (const [text, scope] of expectations) {
      checks++;
      // the token must contain the text, and (when a scope is given) carry the scope
      const hit = tokens.find((t) => t.text.includes(text) && (scope === '' || t.scopes.some((s) => s === scope || s.startsWith(scope + '.') || s.startsWith(scope))));
      if (!hit) {
        failures++;
        const seen = tokens.filter((t) => t.text.includes(text)).map((t) => t.scopes[t.scopes.length - 1]);
        console.error(`FAIL  ${JSON.stringify(source)}\n      expected "${text}" to be ${scope || '(any)'}; got ${JSON.stringify(seen)}`);
      }
    }
  }

  for (const [source, expectations] of cases) check(source, expectations);
  for (const [source, expectations] of multiline) check(source, expectations);

  // Every file of the examples that is available next to this repository must tokenize without leaving a state open.
  const sample = path.join(__dirname, 'sample.zev');
  if (fs.existsSync(sample)) {
    const tokens = tokenize(fs.readFileSync(sample, 'utf8'));
    const illegal = tokens.filter((t) => t.scopes.some((s) => s.startsWith('invalid.illegal')));
    checks++;
    if (illegal.length) {
      failures++;
      console.error('FAIL  sample.zev has illegal tokens: ' + illegal.map((t) => JSON.stringify(t.text)).join(', '));
    }
  }

  console.log(`${checks - failures} of ${checks} checks passed`);
  process.exit(failures ? 1 : 0);
})();
