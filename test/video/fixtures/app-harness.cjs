const assert = require('node:assert/strict');
const { runInContext, createContext } = require('node:vm');

exports.appHarness = (source, bindings) => {
  const context = createContext({ URLSearchParams, ...bindings });
  function include(name, nextName) {
    let start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'Missing page function: ' + name);
    if (source.slice(start - 6, start) === 'async ') start -= 6;
    const end = source.indexOf('\nfunction ' + nextName + '(', start);
    assert.ok(end > start, 'Missing page function boundary: ' + nextName);
    runInContext(source.slice(start, end), context);
  }
  return { include, run: code => runInContext(code, context) };
};
