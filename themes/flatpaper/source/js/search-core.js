(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FlatPaperSearch = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function isSafeUrl(value) {
    return typeof value === 'string' && !/[\s\\\u0000-\u001f\u007f]/.test(value) &&
      (/^\/(?!\/)/.test(value) || /^https?:\/\/[^/]+(?:\/|$)/i.test(value));
  }

  function snippet(text, terms) {
    var lower = text.toLowerCase();
    var positions = terms.map(function (term) { return lower.indexOf(term); }).filter(function (index) { return index >= 0; });
    var start = positions.length ? Math.max(0, Math.min.apply(null, positions) - 36) : 0;
    return (start ? '…' : '') + text.slice(start, start + 150) + (text.length > start + 150 ? '…' : '');
  }

  function search(entries, query, type) {
    var keyword = String(query || '').trim().toLowerCase();
    if (!keyword || !Array.isArray(entries)) return [];
    var terms = keyword.split(/\s+/);
    return entries.map(function (item, order) {
      if (!item || !isSafeUrl(item.url) || (type && (item.type || 'post') !== type)) return null;
      var title = String(item.title || '');
      var text = String(item.text || '');
      var lowerTitle = title.toLowerCase();
      var haystack = lowerTitle + ' ' + text.toLowerCase();
      if (!terms.every(function (term) { return haystack.indexOf(term) !== -1; })) return null;
      var score = lowerTitle === keyword ? 100 : (lowerTitle.indexOf(keyword) === 0 ? 60 : 0);
      terms.forEach(function (term) { if (lowerTitle.indexOf(term) !== -1) score += 20; });
      return { item: item, snippet: snippet(text, terms), score: score, order: order };
    }).filter(Boolean).sort(function (a, b) {
      return b.score - a.score || a.order - b.order;
    }).map(function (hit) {
      return { item: hit.item, snippet: hit.snippet };
    });
  }

  return { isSafeUrl: isSafeUrl, search: search };
});
