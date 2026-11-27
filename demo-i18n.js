/* Sprachschicht der öffentlichen Demo: Deutsch ist die Standardsprache, Französisch (die Originalsprache der App) wählt man mit ?lang=fr.
   Die echten Oberflächendateien bleiben unverändert (Quelltext französisch, gespeicherte Werte wie 'envoyée' oder 'haute' sind sprachunabhängige interne Werte).
   Dieses Skript übersetzt nur die Anzeige: Textknoten und sichtbare Attribute werden anhand des Wörterbuchs (i18n-woerterbuch.js) ersetzt,
   Zahlen- und Datumsformate wechseln zwischen de-DE und fr-FR. Es lädt nichts nach und läuft vor den Oberflächenskripten. */
(function () {
  'use strict';
  var W = window.VIE_I18N || { de: {}, fr: {} };
  var param = '';
  try { param = (new URLSearchParams(location.search).get('lang') || '').toLowerCase(); } catch (e) { /* ohne Parameter: Standard */ }
  var lang = param === 'fr' ? 'fr' : 'de';
  window.VieLang = lang;
  window.VieLocale = lang === 'fr' ? 'fr-FR' : 'de-DE';
  document.documentElement.lang = lang;

  var dict = lang === 'de' ? W.de : W.fr;
  var exact = Object.create(null), strong = [], weak = [], subs = [];
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  Object.keys(dict).forEach(function (k) {
    var key = k.replace(/\s+/g, ' ').trim();
    if (key.indexOf('{}') < 0) { exact[key] = dict[k]; if (key.length >= 6) subs.push(key); return; }
    var parts = key.split('{}');
    var lit = parts.join('').length;
    var p = { re: new RegExp('^' + parts.map(esc).join('([\\s\\S]*?)') + '$'), to: dict[k], lit: lit };
    (lit >= 12 ? strong : weak).push(p);
  });
  strong.sort(function (a, b) { return b.lit - a.lit; });
  weak.sort(function (a, b) { return b.lit - a.lit; });
  subs.sort(function (a, b) { return b.length - a.length; });

  var cache = Object.create(null);
  function swapCase(s, up) { return s ? (up ? s.charAt(0).toUpperCase() : s.charAt(0).toLowerCase()) + s.slice(1) : s; }
  function viaPatterns(list, s, depth) {
    for (var i = 0; i < list.length; i++) {
      var p = list[i], m = p.re.exec(s);
      if (!m) continue;
      var k = 0, caps = m.slice(1).map(function (c) { return depth < 4 ? translateText(c, depth + 1) : c; });
      return p.to.replace(/\{(\d*)\}/g, function (_, d) { return d === '' ? (caps[k++] || '') : (caps[Number(d)] || ''); });
    }
    return null;
  }
  function core(s, depth) {
    if (s in exact) return exact[s];
    if (!/[A-Za-zÀ-ÿ]/.test(s)) return s;
    var r = viaPatterns(strong, s, depth);
    if (r !== null) return r;
    // Satzzeichen am Rand abtrennen und den Kern übersetzen (": nombre de …", "idées.")
    var edge = /^([\s:;,.·…]*)([\s\S]*?)([\s:;,.·…]*)$/.exec(s), pre = edge[1], kern = edge[2], suf = edge[3];
    if ((pre || suf) && kern) {
      if (kern in exact) return pre + exact[kern] + suf;
      r = viaPatterns(strong, kern, depth);
      if (r !== null) return pre + r + suf;
    }
    // Zusammengesetzte Texte mit Trennzeichen: jeden Teil einzeln übersetzen
    var seps = [' ; ', ' · ', ' : ', ', '];
    for (var j = 0; j < seps.length; j++) {
      if (s.indexOf(seps[j]) < 0 || depth > 3) continue;
      var joined = s.split(seps[j]).map(function (x) { return translateText(x, depth + 1); }).join(seps[j]);
      if (joined !== s) return joined;
    }
    if ((pre || suf) && kern && depth < 5) { var inner = core(kern, depth + 1); if (inner !== kern) return pre + inner + suf; }
    r = viaPatterns(weak, s, depth);
    if (r !== null) return r;
    // Groß- und Kleinschreibung am Wortanfang (z. B. „envoyée“ und „Envoyée“); die deutsche Übersetzung bleibt unverändert
    var first = s.charAt(0), flipped = swapCase(s, first === first.toLowerCase());
    if (flipped !== s && flipped in exact) return exact[flipped];
    // Letzter Ausweg: bekannte französische Wendungen innerhalb eines längeren Textes ersetzen (längste zuerst)
    var out = s;
    var letter = /[A-Za-zÀ-ÿ]/;
    for (var q = 0; q < subs.length; q++) {
      var key = subs[q], at = out.indexOf(key), from = 0, res = '';
      if (at < 0) continue;
      while (at >= 0) {
        var before = at > 0 ? out.charAt(at - 1) : '', after = out.charAt(at + key.length);
        var ok = !(before && letter.test(before) && letter.test(key.charAt(0))) && !(after && letter.test(after) && letter.test(key.charAt(key.length - 1)));
        res += out.slice(from, at) + (ok ? exact[key] : key);
        from = at + key.length;
        at = out.indexOf(key, from);
      }
      out = res + out.slice(from);
    }
    return out;
  }
  function translateText(str, depth) {
    depth = depth || 0;
    if (typeof str !== 'string' || !str) return str;
    if (depth === 0 && str in cache) return cache[str];
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(str);
    if (!m[2]) return str;
    var res = m[1] + core(m[2].replace(/\s+/g, ' '), depth) + m[3];
    if (depth === 0) { if (Object.keys(cache).length > 5000) cache = Object.create(null); cache[str] = res; }
    return res;
  }
  window.VieTranslate = translateText;

  var ATTRS = ['aria-label', 'title', 'placeholder', 'alt', 'aria-description', 'aria-placeholder', 'aria-roledescription'];
  function doAttrs(el) {
    if (!el.getAttribute) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute(ATTRS[i]);
      if (v) { var t = translateText(v); if (t !== v) el.setAttribute(ATTRS[i], t); }
    }
    if (el.tagName === 'INPUT' && /^(button|submit|reset|text|search)$/.test(el.type)) {
      var val = el.getAttribute('value');
      if (val) { var tv = translateText(val); if (tv !== val) el.setAttribute('value', tv); }
    }
  }
  function doText(node) {
    var v = node.nodeValue;
    if (!v || !v.trim()) return;
    var p = node.parentNode;
    if (p && /^(SCRIPT|STYLE|PRE)$/.test(p.nodeName)) return;
    var t = translateText(v);
    if (t !== v) node.nodeValue = t;
  }
  function doTree(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) doAttrs(root);
    var w = document.createTreeWalker(root, 1 | 4);
    var n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  function meta() {
    var d = document.querySelector('meta[name="description"]');
    if (d) { var c = d.getAttribute('content'); var t = translateText(c); if (t !== c) d.setAttribute('content', t); }
  }
  if (lang === 'fr') {
    // Der ausgelieferte HTML-Text ist deutsch (Standard); Titel und Beschreibung für die französische Fassung zurücksetzen.
    document.title = 'VIE — Espace personnel';
    var d0 = document.querySelector('meta[name="description"]');
    if (d0) d0.setAttribute('content', 'VIE — votre poste de pilotage personnel : projets, études, habitudes et objectifs.');
  }

  // Zahlen- und Datumsformate: der Quelltext verlangt fr-FR, in der deutschen Fassung wird daraus de-DE.
  if (lang === 'de' && window.Intl) {
    ['NumberFormat', 'DateTimeFormat', 'ListFormat', 'PluralRules', 'RelativeTimeFormat'].forEach(function (name) {
      var Orig = Intl[name];
      if (!Orig) return;
      Intl[name] = new Proxy(Orig, {
        construct: function (t, a, nt) { if (a[0] === 'fr-FR' || a[0] === 'fr') a = ['de-DE'].concat(Array.prototype.slice.call(a, 1)); return Reflect.construct(t, a, nt === Intl[name] ? t : nt); },
        apply: function (t, th, a) { if (a[0] === 'fr-FR' || a[0] === 'fr') a = ['de-DE'].concat(Array.prototype.slice.call(a, 1)); return Reflect.apply(t, th, a); }
      });
    });
    [[Date.prototype, ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']], [Number.prototype, ['toLocaleString']]].forEach(function (pair) {
      pair[1].forEach(function (fn) {
        var o = pair[0][fn];
        pair[0][fn] = function (loc) { var a = Array.prototype.slice.call(arguments); if (a[0] === 'fr-FR' || a[0] === 'fr') a[0] = 'de-DE'; return o.apply(this, a); };
      });
    });
  }
  // Dialoge des Browsers
  ['alert', 'confirm', 'prompt'].forEach(function (fn) {
    var o = window[fn];
    window[fn] = function (msg) { var a = Array.prototype.slice.call(arguments); if (typeof a[0] === 'string') a[0] = translateText(a[0]); if (typeof a[1] === 'string') a[1] = translateText(a[1]); return o.apply(window, a); };
  });

  function start() {
    meta();
    doTree(document);
    var mo = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'childList') { for (var j = 0; j < m.addedNodes.length; j++) doTree(m.addedNodes[j]); }
        else if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
      }
    });
    mo.observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(['value']) });
  }
  start();
})();
