'use strict';

/* eslint-disable */
/**
 * Build-time search index generator.
 *
 * Emits a shared full-text index for posts, pages, projects and site links,
 * fetched lazily by main.js when the search panel first opens. This
 * replaces the old approach of inlining the full index into every page via
 * _partial/search.ejs, which cost O(pages x posts) strip_html calls per
 * `hexo generate` and bloated every page's HTML.
 *
 * Honors `theme.search.limit` (0 / unset = all posts), same as the old inline
 * index did.
 */

const INDEX_PATH = 'flatpaper-search.json';
const searchCore = require('../source/js/search-core');

hexo.extend.generator.register('flatpaper_search_index', function (locals) {
  const searchConfig = (this.theme.config && this.theme.config.search) || {};
  const limit = typeof searchConfig.limit === 'number' ? searchConfig.limit : 0;

  // Same building blocks the template used: Hexo registers these helpers from
  // hexo-util, which isn't directly require()-able from theme scripts under
  // pnpm's strict node_modules layout.
  const stripHtml = this.extend.helper.get('strip_html');
  const urlFor = this.extend.helper.get('url_for').bind(this);

  // strip_html removes tags but keeps entities the markdown renderer emitted
  // (&#x2F;, &amp;, …) — without decoding they show up literally in search
  // snippets. Decoded text is safe here: main.js renders results via
  // textContent only.
  function decodeEntities(s) {
    return s
      .replace(/&#x([0-9a-f]{1,6});/gi, function (m, hex) {
        const cp = parseInt(hex, 16);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      })
      .replace(/&#(\d{1,7});/g, function (m, dec) {
        const cp = parseInt(dec, 10);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      })
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  let posts = locals.posts.sort('date', -1).toArray();
  if (limit > 0) posts = posts.slice(0, limit);

  const index = [];
  const seen = new Set();
  function addEntry(title, path, content, type, date) {
    if (!title || !path) return;
    const url = urlFor(path);
    if (!title || !searchCore.isSafeUrl(url) || seen.has(url)) return;
    seen.add(url);
    index.push({
      title: String(title), url: url, type: type,
      date: date && date.format ? date.format('YYYY-MM-DD') : '',
      text: decodeEntities(stripHtml(String(content || ''))).replace(/\s+/g, ' ').trim()
    });
  }

  posts.forEach(function (post) {
    if (post.search === false || post.published === false) return;
    addEntry(post.title, post.path, post.content || post.excerpt, 'post', post.date);
  });

  const pages = locals.pages ? locals.pages.toArray() : [];
  pages.forEach(function (page) {
    if (page.search === false || page.published === false || /(^|\/)(?:404|README)(?:\.|\/|$)/i.test(page.path)) return;
    const path = String(page.path || '').replace(/^\/+/, '');
    const type = /^rabbit-holes\//.test(path) ? 'learning' : (/^projects\//.test(path) ? 'project' : 'page');
    addEntry(page.title, page.path, page.content, type);
  });

  const data = locals.data || {};
  const groups = Array.isArray(data.projects) ? data.projects : (data.projects ? [data.projects] : []);
  groups.forEach(function (group) {
    if (!group) return;
    (Array.isArray(group.project_list) ? group.project_list : []).forEach(function (project) {
      if (!project) return;
      const path = project.live || project.source;
      if (!path) return;
      addEntry(project.name, path, [project.description, project.eyebrow, group.group_name].concat(project.tags || []).join(' '), 'project');
    });
  });

  const menu = this.theme.config.menu || {};
  function addMenu(label, item) {
    if (!item) return;
    const path = typeof item === 'string' ? item : (item.path || item.href || item.url || item.link);
    if (typeof path === 'string' && path.charAt(0) !== '#') addEntry(item.label || item.name || item.title || label, path, label, 'site');
    if (item.item && !Array.isArray(item.item)) Object.keys(item.item).forEach(function (key) { addMenu(key, item.item[key]); });
    if (Array.isArray(item.item)) item.item.forEach(function (child) { if (child) addMenu(child.name || child.label || String(child), child); });
  }
  Object.keys(menu).forEach(function (label) { addMenu(label, menu[label]); });

  return {
    path: INDEX_PATH,
    data: JSON.stringify(index)
  };
});
