import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const fontFiles = (await readdir(new URL('../../source/video/assets/fonts/', import.meta.url))).map(file => 'assets/fonts/' + file);

const html = await readFile(new URL('../../source/video/index.html', import.meta.url), 'utf8');
const script = html.match(/<script data-video-theme>([\s\S]*?)<\/script>/)[1];

test('cinema fonts load from complete local subsets with immediate system fallbacks and no font-service dependency', async () => {
  assert.match(html, /href="\.\/assets\/fonts\/fonts\.css"/);
  const fontCSS = await readFile(new URL('../../source/video/assets/fonts/fonts.css', import.meta.url), 'utf8');
  assert.doesNotMatch(fontCSS, /https?:|@import|data:/i);
  const urls = [...fontCSS.matchAll(/url\(\.\/([^)'"\s]+)\)/g)].map(match => match[1]);
  const allowed = fontFiles.filter(file => file.endsWith('.woff2'));
  assert.equal(new Set(urls).size, allowed.length);
  for (const file of urls) {
    assert.ok(allowed.includes('assets/fonts/' + file));
    const data = await readFile(new URL('../../source/video/assets/fonts/' + file, import.meta.url));
    assert.equal(data.subarray(0, 4).toString(), 'wOF2');
  }
  for (const face of fontCSS.match(/@font-face\s*\{[^}]+\}/g)) assert.match(face, /font-display:\s*swap/);
  assert.match(fontCSS, /unicode-range:/);
  assert.match(fontCSS, /font-weight:\s*400 600/);
  const theme = await readFile(new URL('../../source/video/theme.css', import.meta.url), 'utf8');
  assert.match(theme, /--font-body:InterVariable,"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif/);
  for (const name of ['Inter.LICENSE', 'NotoSansSC.LICENSE', 'NotoSerifSC.LICENSE']) {
    assert.match(await readFile(new URL('../../source/video/assets/fonts/' + name, import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE/i);
  }
});

test('screen proportions form a labelled native radio group with one default choice', () => {
  const group = html.match(/<div id="screen-mode"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(group); assert.match(group[0], /role="radiogroup" aria-labelledby="screen-mode-label"/);
  assert.match(html, /id="screen-mode-label">画面比例<\/span>/);
  const inputs = [...group[1].matchAll(/<input\b([^>]+)>/g)].map(match => match[1]);
  assert.equal(inputs.length, 3);
  for (const input of inputs) { assert.match(input, /type="radio"/); assert.match(input, /name="screen-mode"/); }
  assert.deepEqual(inputs.map(input => input.match(/value="([^"]+)"/)[1]), ['auto', 'portrait', 'wide']);
  assert.equal(inputs.filter(input => /\bchecked\b/.test(input)).length, 1); assert.match(inputs[0], /\bchecked\b/);
});

test('Blue Hour keeps small text readable in both modes regardless of an inherited blog accent', async () => {
  const css = await readFile(new URL('../../source/video/theme.css', import.meta.url), 'utf8');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  function luminance(hex) {
    assert.match(hex, /^#[\da-f]{6}$/i);
    return hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  }
  function contrast(first, second) {
    const values = [luminance(first), luminance(second)];
    return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
  }
  for (const accent of ['green', 'orange', 'purple', 'sakura', 'blue', 'pink', 'black']) for (const dark of [false, true]) {
    const selectors = new Set([':root', 'html[data-accent="' + accent + '"]']);
    if (dark) { selectors.add('html.dark-mode'); selectors.add('html.dark-mode[data-accent="' + accent + '"]'); }
    const tokens = new Map();
    for (const [, selector, body] of rules) {
      if (!selectors.has(selector.replace(/\/\*[\s\S]*?\*\//g, '').trim())) continue;
      for (const [, key, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens.set(key, value.trim());
    }
    const color = key => {
      const value = tokens.get(key);
      assert.ok(value, 'Missing color ' + key);
      const alias = value.match(/^var\((--[\w-]+)\)$/);
      return alias ? color(alias[1]) : value;
    };
    for (const [text, surface] of [['--button-ink', '--accent'], ['--muted', '--paper'], ['--muted', '--paper-warm'], ['--muted', '--accent-soft'], ['--accent', '--accent-soft'], ['--promo-ink', '--paper'], ['--error-ink', '--paper'], ['--error-ink', '--paper-warm']]) {
      assert.ok(contrast(color(text), color(surface)) >= 4.5, accent + ' ' + (dark ? 'dark' : 'light') + ' ' + text + ' on ' + surface);
    }
  }
});


function preview({ cookie = '', mode = null, blocked = false, readOnly = false, cookieBlocked = false, control = true } = {}) {
  const attributes = new Map(), classes = new Set(), handlers = new Map(), clicks = new Map();
  const values = new Map([['flatpaper-mode', mode], ['video-favorites', 'keep-favorites'], ['video-history', 'keep-history']]);
  const root = {
    setAttribute: (key, value) => attributes.set(key, value),
    classList: {
      contains: name => classes.has(name),
      toggle(name, force = !classes.has(name)) { if (force) classes.add(name); else classes.delete(name); return force; },
    },
  };
  const button = { setAttribute: (key, value) => attributes.set('button:' + key, value), addEventListener: (key, fn) => clicks.set(key, fn) };
  let reads = 0;
  const document = { documentElement: root, getElementById: () => control ? button : null, get cookie() { reads++; if (cookieBlocked) throw Error('blocked'); return cookie; } };
  const localStorage = { getItem(key) { if (blocked) throw Error('blocked'); return values.get(key) ?? null; }, setItem(key, value) { if (blocked || readOnly) throw Error('blocked'); values.set(key, value); } };
  runInNewContext(script, { document, localStorage, window: { addEventListener: (key, fn) => handlers.set(key, fn) } });
  handlers.get('DOMContentLoaded')();
  return { attributes, classes, values, handlers, clicks, reads: () => reads, cookie: value => { cookie = value; } };
}

test('video reads all supported blog accents and both modes without changing saved media data', () => {
  for (const accent of ['orange', 'purple', 'sakura', 'blue', 'pink', 'green', 'black']) for (const mode of ['light', 'dark']) {
    const page = preview({ cookie: 'unrelated=value; flatpaper-accent=' + encodeURIComponent(accent), mode });
    assert.equal(page.attributes.get('data-accent'), accent); assert.equal(page.classes.has('dark-mode'), mode === 'dark');
    assert.equal(page.attributes.get('button:aria-pressed'), String(mode === 'dark'));
    assert.equal(page.values.get('video-favorites'), 'keep-favorites'); assert.equal(page.values.get('video-history'), 'keep-history');
  }
});

test('missing, malformed and blocked preferences use the approved dark cinema without changing saved data', () => {
  for (const cookie of ['', 'flatpaper-accent=%E0%A4%A', 'flatpaper-accent=constructor', 'flatpaper-accent=__proto__', 'flatpaper-accent=unknown']) {
    const page = preview({ cookie, mode: 'unexpected' }); assert.equal(page.attributes.get('data-accent'), 'green'); assert.equal(page.classes.has('dark-mode'), true);
  }
  const blocked = preview({ blocked: true, cookieBlocked: true, control: false });
  assert.equal(blocked.attributes.get('data-accent'), 'green'); assert.equal(blocked.classes.has('dark-mode'), true);
});

test('theme control shares only the blog mode preference and keeps its accessible state current', () => {
  const page = preview({ cookie: 'flatpaper-accent=sakura', mode: 'light' });
  page.clicks.get('click')();
  assert.equal(page.classes.has('dark-mode'), true); assert.equal(page.values.get('flatpaper-mode'), 'dark');
  assert.equal(page.attributes.get('button:aria-label'), '切换到浅色主题'); assert.equal(page.attributes.get('button:title'), '切换到浅色主题');
  page.clicks.get('click')();
  assert.equal(page.classes.has('dark-mode'), false); assert.equal(page.values.get('flatpaper-mode'), 'light');
  assert.equal(page.attributes.get('button:aria-label'), '切换到深色主题');
  assert.equal(page.values.get('video-favorites'), 'keep-favorites'); assert.equal(page.values.get('video-history'), 'keep-history');
});

test('focus, page restoration and relevant storage events synchronize settings changed on the blog', () => {
  const page = preview();
  page.cookie('flatpaper-accent=purple'); page.handlers.get('focus')(); assert.equal(page.attributes.get('data-accent'), 'purple');
  page.values.set('flatpaper-mode', 'dark'); page.handlers.get('storage')({ key: 'flatpaper-mode' }); assert.equal(page.classes.has('dark-mode'), true);
  const before = page.reads(); page.handlers.get('storage')({ key: 'video-history' }); assert.equal(page.reads(), before);
  page.values.clear(); page.handlers.get('storage')({ key: null }); assert.equal(page.classes.has('dark-mode'), true);
  page.cookie('flatpaper-accent=blue'); page.handlers.get('pageshow')(); assert.equal(page.attributes.get('data-accent'), 'blue');
});

test('blocked storage still permits an in-page mode change through focus and page restoration', () => {
  const page = preview({ blocked: true }); page.clicks.get('click')(); page.handlers.get('focus')(); page.handlers.get('pageshow')();
  assert.equal(page.classes.has('dark-mode'), false); assert.equal(page.attributes.get('button:aria-pressed'), 'false');
});

test('readable but full storage keeps a manual mode until a new shared preference arrives', () => {
  const page = preview({ readOnly: true, mode: 'light' }); page.clicks.get('click')(); page.handlers.get('focus')();
  assert.equal(page.classes.has('dark-mode'), true); assert.equal(page.values.get('flatpaper-mode'), 'light');
  page.handlers.get('storage')({ key: 'flatpaper-mode' }); assert.equal(page.classes.has('dark-mode'), false);
});
