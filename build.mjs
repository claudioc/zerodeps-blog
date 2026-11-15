#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, 'src');
const INCLUDES_DIR = path.join(SRC_DIR, '_includes');
const OUT_DIR = path.join(__dirname, '_site');
const CONFIG_FILE = path.join(__dirname, 'site.config.json');

// ---------------------------------------------------------------------------
// Site Configuration & Defaults (exposed as `metadata` in templates)
// Edit `site.config.json` to customize your site.
// ---------------------------------------------------------------------------

function loadMetadata() {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const url = String(config.url || 'http://localhost:8080').replace(/\/+$/, '');
  return {
    navigation: [],
    social: [],
    ...config,
    url,
    domain: config.domain || url.replace(/^https?:\/\//i, ''),
    feed: {
      filename: 'feed.xml',
      path: '/feed/feed.xml',
      id: url,
      ...(config.feed || {}),
    },
    jsonfeed: {
      path: '/feed/feed.json',
      url: `${url}/feed/feed.json`,
      ...(config.jsonfeed || {}),
    },
    author: { name: config.title || '', ...(config.author || {}) },
    publisher: config.publisher || { name: config.author?.name || config.title || '' },
  };
}

const METADATA = loadMetadata();
const BASE_URL = METADATA.url;

// Default frontmatter values automatically applied to every Markdown file in `src/posts/`
const POST_DEFAULTS = {
  layout: 'post-layout.html',
  showDate: true,
  className: 'post-page',
  tags: ['post'],
};

// ---------------------------------------------------------------------------
// Precompiled Regular Expressions
// ---------------------------------------------------------------------------

// HTML & URL Filters
const RE_AMP = /&/g;
const RE_LT = /</g;
const RE_GT = />/g;
const RE_QUOT = /"/g;
const RE_ISO_MS = /\.\d{3}Z$/;
const RE_HTTP_PREFIX = /^https?:\/\//i;
const RE_TRAILING_SLASHES = /\/+$/;
const RE_LEADING_SLASHES = /^\/+/;
const RE_HTML_HREF_SRC = /\b(href|src)="([^"]+)"/g;
const RE_SCHEME_PREFIX = /^(https?:|mailto:|tel:|data:)/i;

// Micro-Template Engine
const RE_TAG_ATTRS = /([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/g;
// Attribute values are double-quoted and may contain `>` (e.g. cond="count > 0"):
// `(?:"[^"]*"|[^>"])*` skips over quoted strings when looking for the end of a tag.
const RE_ZD_INCLUDE = /<zd-include\s+((?:"[^"]*"|[^>"])*?)\s*(?:\/>|><\/zd-include>)/g;
const RE_LOGICAL_OPS = /('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|\b(or|and|not)\b/g;
const RE_PIPE_SPLIT = /(?<!\|)\|(?!\|)/;
const RE_FILTER_CALL = /^([a-zA-Z0-9_]+)(?:\((.*)\))?$/;
const RE_ZD_BLOCK_LINE = /^[ \t]*(<\/?zd-(?:if|for|set)\b(?:"[^"]*"|[^>"])*>)[ \t]*\r?\n/gm;
const RE_TEMPLATE_TOKENS = /(\{\{[\s\S]*?\}\}|<\/?zd-(?:if|for|set)\b(?:"[^"]*"|[^>"])*>)/g;
const RE_ZD_FOR_EACH = /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s+in\s+([\s\S]+)$/;

// Syntax Highlighter
const RE_TRAILING_NEWLINE = /\n$/;
const RE_HIGHLIGHT_JSON =
  /("(?:\\.|[^"\\])*")\s*(?=:)|("(?:\\.|[^"\\])*")|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\]:,])/g;
const RE_HIGHLIGHT_JS =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|\b(const|let|var|if|else|for|while|do|return|function|class|new|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of)\b|\b(true|false)\b|\b(null|undefined)\b|\b([A-Z][A-Z0-9_]{2,})\b|(?<=\bnew\s+)([A-Z][A-Za-z0-9_]*)|\b([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()|\b(\d+(?:\.\d+)?)\b|(===|!==|==|!=|<=|>=|=>|\+\+|--|&&|\|\||[+\-*/%=<>!&|^~?:]+)|([{}()\[\].,;])/g;
const RE_HIGHLIGHT_BASH =
  /(#[^\n]*)|("(?:\\.|[^"\\])*"|'[^']*')|(\$\{[^}]+\}|\$[a-zA-Z_][a-zA-Z0-9_]*|\$\(|\))|\b(if|then|else|elif|fi|for|in|do|done|while|case|esac|select|function|return|exit)\b|\b(cd|echo|git|npm|node|rsync|rm|mkdir|tr|awk|curl|ssh|scp|tar|chmod|chown|sudo|apt-get|brew|set|export|source|alias)\b|(&&|\|\||\|+|>>?|<<?|[=;])|(\.{2,}|[{}\[\]])/g;

// Markdown Parser
const RE_ATTR_BLOCK = /\{([^{}]+)\}/g;
const RE_WHITESPACE = /\s+/;
const RE_SURROUNDING_QUOTES = /^['"]|['"]$/g;
const RE_STANDALONE_IMG_WITH_ATTRS = /^!\[[^\]]*\]\([^)]+\)(\{[^{}]+\})+\s*$/;
const RE_TRAILING_BLOCK_ATTRS =
  /^(.*?)\s*(\{(?:[.#a-zA-Z0-9_-]+(?:=[^}\s]+)?(?:\s+[.#a-zA-Z0-9_-]+(?:=[^}\s]+)?)*)\})\s*$/s;
const RE_INLINE_CODE = /`([^`]+)`/g;
const RE_INLINE_HTML_TAG = /<\/?[a-zA-Z][^>]*>/g;
const RE_MD_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)((?:\{[^{}]+\})*)/g;
const RE_MD_LINK = /\[([^\[\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
const RE_AUTOLINK_URL = /\bhttps?:\/\/[^\s<>"')]+/g;
const RE_TRAILING_PUNCT = /([.,;:!?]+)$/;
const RE_AUTOLINK_DOMAIN =
  /(?<![/@a-zA-Z0-9._-])\b([a-zA-Z0-9-]+\.(?:com|org|it|me|gs))\b(?![/a-zA-Z0-9_-])/g;
const RE_BACKSLASH_ESCAPE = /\\([!#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
const RE_UNESCAPED_AMP = /&(?!(?:[a-zA-Z0-9]+|#\d+|#x[0-9a-fA-F]+);)/g;
const RE_BOLD_ASTERISK = /\*\*(.+?)\*\*/gs;
const RE_BOLD_UNDERSCORE = /\b__(.+?)__\b/gs;
const RE_ITALIC_ASTERISK = /\*([^*]+)\*/g;
const RE_ITALIC_UNDERSCORE = /(^|[\s(>]|<strong>)_([^_]+)_(?=$|[\s.,;:!?)<_/]|<\/strong>)/g;
const RE_STASH_TOKEN = /\x00STASH_(\d+)_\x00/g;
const RE_CRLF = /\r\n/g;
const RE_CODE_FENCE_OPEN = /^```([a-zA-Z0-9_-]*)\s*$/;
const RE_CODE_FENCE_CLOSE = /^```\s*$/;
const RE_HORIZONTAL_RULE = /^(?:---+|___+|\*\*\*+)\s*$/;
const RE_HEADING = /^(#{1,6})\s+(.*)$/;
const RE_BLOCKQUOTE_LINE = /^>\s?/;
const RE_BLOCK_INTERRUPTER = /^(?:#{1,6}\s|```|---)/;
const RE_PARA_INTERRUPTER = /^(?:```|#{1,6}\s|>\s?|---+\s*$|[-*]\s+|\d+\.\s+)/;
const RE_LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const RE_ORDERED_MARKER = /^\d+\.$/;
const RE_LIST_CONTINUATION_STOP = /^\s*(?:[-*]|\d+\.)\s+/;
const RE_LIST_BLOCK_STOP = /^(?:```|#{1,6}\s|---+\s*$)/;

// Frontmatter & Build Pipeline
const RE_FM_DELIMITER = /^---$/m;
const RE_TRAILING_WS = /\s+$/;
const RE_LEADING_WS = /^\s+/;
const RE_YAML_KV = /^([a-zA-Z0-9_-]+):\s*(.*)$/;
const RE_INTEGER = /^-?\d+$/;
const RE_CONTENT_EXT = /\.(md|html)$/;
const RE_BACKSLASH = /\\/g;

// ---------------------------------------------------------------------------
// 1. HTML Escaping & Template Filters
// ---------------------------------------------------------------------------

function escapeHtml(str = '') {
  return String(str)
    .replace(RE_AMP, '&amp;')
    .replace(RE_LT, '&lt;')
    .replace(RE_GT, '&gt;')
    .replace(RE_QUOT, '&quot;');
}

const FILTERS = {
  url: (u) => u || '/',
  escape: (s) => escapeHtml(s),
  reverse: (arr) => (Array.isArray(arr) ? [...arr].reverse() : []),
  head: (arr, n) => {
    if (!Array.isArray(arr)) return [];
    return n < 0 ? arr.slice(n) : arr.slice(0, n);
  },
  toHTML: (str) => renderInline(String(str || '')),
  niceDate: (dateObj) =>
    new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(dateObj),
  niceShortDate: (dateObj) =>
    new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(dateObj),
  w3cDate: (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },
  rssDate: (dateObj) => dateObj.toISOString().replace(RE_ISO_MS, 'Z'),
  rssLastUpdatedDate: (posts) => {
    if (!Array.isArray(posts) || posts.length === 0) {
      return new Date().toISOString().replace(RE_ISO_MS, 'Z');
    }
    const latest = posts.reduce((max, p) => (p.date > max ? p.date : max), posts[0].date);
    return latest.toISOString().replace(RE_ISO_MS, 'Z');
  },
  absoluteUrl: (urlPath, base = BASE_URL) => {
    if (!urlPath) return base;
    if (RE_HTTP_PREFIX.test(urlPath)) return urlPath;
    const cleanBase = String(base).replace(RE_TRAILING_SLASHES, '');
    const cleanPath = String(urlPath).startsWith('/') ? urlPath : `/${urlPath}`;
    return `${cleanBase}${cleanPath}`;
  },
  htmlToAbsoluteUrls: (html = '', basePostUrl = BASE_URL) => {
    const origin = new URL(basePostUrl).origin;
    return String(html).replace(RE_HTML_HREF_SRC, (match, attr, val) => {
      if (RE_SCHEME_PREFIX.test(val)) return match;
      if (val.startsWith('#')) return `${attr}="${basePostUrl}${val}"`;
      if (val.startsWith('/')) return `${attr}="${origin}${val}"`;
      return `${attr}="${new URL(val, basePostUrl).href}"`;
    });
  },
};

// ---------------------------------------------------------------------------
// 2. Micro-Template Engine (supports .html files in src/)
// ---------------------------------------------------------------------------

function resolveIncludePath(name) {
  const exact = path.join(INCLUDES_DIR, name);
  if (fs.existsSync(exact)) return exact;
  throw new Error(`Include file not found: ${name} (looked in ${INCLUDES_DIR})`);
}

function parseTagAttributes(attrStr) {
  const attrs = {};
  for (const m of attrStr.matchAll(RE_TAG_ATTRS)) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function expandIncludes(templateStr) {
  return templateStr.replace(RE_ZD_INCLUDE, (_, attrStr) => {
    const attrs = parseTagAttributes(attrStr);
    if (!attrs.src) {
      throw new Error('<zd-include> is missing required "src" attribute');
    }
    const incPath = resolveIncludePath(attrs.src);
    let prefixSets = '';
    for (const [key, val] of Object.entries(attrs)) {
      if (key === 'src') continue;
      prefixSets += `<zd-set var="${key}" value="${val}" />`;
    }
    const body = fs.readFileSync(incPath, 'utf8');
    return prefixSets + expandIncludes(body);
  });
}

function translateLogicalOps(expr) {
  // Replace word-boundary `or`, `and`, `not` outside string literals
  return expr.replace(RE_LOGICAL_OPS, (m, str, op) => {
    if (str) return str;
    if (op === 'or') return '||';
    if (op === 'and') return '&&';
    if (op === 'not') return '!';
    return m;
  });
}

function compileExpression(rawExpr) {
  // Split by single pipe `|` (ignoring `||`)
  const parts = rawExpr.split(RE_PIPE_SPLIT).map((s) => s.trim());
  let jsExpr = translateLogicalOps(parts[0]);
  let isSafe = false;

  for (let i = 1; i < parts.length; i++) {
    const filterPart = parts[i];
    if (filterPart === 'safe') {
      isSafe = true;
      continue;
    }
    if (filterPart === 'escape') {
      isSafe = false;
      continue;
    }
    const fm = filterPart.match(RE_FILTER_CALL);
    if (!fm) continue;
    const fnName = fm[1];
    const args = fm[2] ? fm[2].trim() : '';
    jsExpr = args
      ? `__filters.${fnName}((${jsExpr}), ${translateLogicalOps(args)})`
      : `__filters.${fnName}((${jsExpr}))`;
  }

  return { jsExpr, isSafe };
}

const templateCache = new Map();

export function renderTemplateString(rawTemplate, context) {
  let fn = templateCache.get(rawTemplate);
  if (!fn) {
    // 1. Expand <zd-include src="..." ...></zd-include>
    let src = expandIncludes(rawTemplate);

    // 2. Strip standalone whitespace around block-level <zd-*> tags
    src = src.replace(RE_ZD_BLOCK_LINE, '$1');

    // 3. Tokenize `{{ ... }}` and `<zd-...>` / `</zd-...>`
    let code = 'let __out = "";\nwith (__scope) {\n';
    let lastIdx = 0;
    let ifDepth = 0;
    let forDepth = 0;

    for (const m of src.matchAll(RE_TEMPLATE_TOKENS)) {
      const literal = src.slice(lastIdx, m.index);
      if (literal) code += `__out += ${JSON.stringify(literal)};\n`;

      const tok = m[0];
      if (tok.startsWith('{{')) {
        const inner = tok.slice(2, -2).trim();
        const { jsExpr, isSafe } = compileExpression(inner);
        code += isSafe
          ? `__out += String((${jsExpr}) ?? "");\n`
          : `__out += __escape((${jsExpr}) ?? "");\n`;
      } else if (tok.startsWith('<zd-set')) {
        const attrs = parseTagAttributes(tok);
        if (attrs.var && attrs.value !== undefined) {
          const { jsExpr } = compileExpression(attrs.value.trim());
          code += `var ${attrs.var} = (${jsExpr});\n`;
        }
      } else if (tok === '</zd-set>') {
        // no-op closing tag for <zd-set>
      } else if (tok.startsWith('<zd-if')) {
        if (ifDepth > 0) {
          throw new Error('Nested <zd-if> statements are not supported');
        }
        ifDepth++;
        const attrs = parseTagAttributes(tok);
        const { jsExpr } = compileExpression((attrs.cond || '').trim());
        code += `if (${jsExpr}) {\n`;
      } else if (tok === '</zd-if>') {
        if (ifDepth === 0) {
          throw new Error('Unexpected </zd-if> without matching <zd-if>');
        }
        ifDepth--;
        code += '}\n';
      } else if (tok.startsWith('<zd-for')) {
        if (forDepth > 0) {
          throw new Error('Nested <zd-for> statements are not supported');
        }
        forDepth++;
        const attrs = parseTagAttributes(tok);
        const forMatch = (attrs.each || '').match(RE_ZD_FOR_EACH);
        if (!forMatch) {
          throw new Error(`Invalid <zd-for each="${attrs.each || ''}"> syntax`);
        }
        const { jsExpr } = compileExpression(forMatch[2].trim());
        code += `for (const ${forMatch[1]} of ((${jsExpr}) || [])) {\n`;
      } else if (tok === '</zd-for>') {
        if (forDepth === 0) {
          throw new Error('Unexpected </zd-for> without matching <zd-for>');
        }
        forDepth--;
        code += '}\n';
      }
      lastIdx = m.index + tok.length;
    }

    if (ifDepth !== 0 || forDepth !== 0) {
      throw new Error('Unclosed <zd-if> or <zd-for> tag in template');
    }

    const tail = src.slice(lastIdx);
    if (tail) code += `__out += ${JSON.stringify(tail)};\n`;
    code += '}\nreturn __out;';

    fn = new Function('__scope', '__filters', '__escape', code);
    templateCache.set(rawTemplate, fn);
  }

  const fullContext = {
    thisYear: new Date().getFullYear(),
    generator: 'Custom Node.js SSG',
    ...context,
  };

  // Proxy prevents ReferenceError when templates check optional frontmatter vars (e.g. `if image`)
  const scopeProxy = new Proxy(fullContext, {
    has: (target, prop) => {
      if (typeof prop === 'symbol' || String(prop).startsWith('__')) return false;
      if (prop in globalThis && !(prop in target)) return false;
      return true;
    },
    get: (target, prop) => (prop in target ? target[prop] : undefined),
  });

  return fn(scopeProxy, FILTERS, escapeHtml);
}

/**
 * Renders content wrapped in its layout (post-layout wraps inside base-layout).
 */
function renderWithLayouts(content, pageData, pageObj, collections, metadata) {
  let currentContent = content;
  let layout = pageData.layout;

  while (layout) {
    const layoutPath = resolveIncludePath(layout);
    const layoutBody = fs.readFileSync(layoutPath, 'utf8');
    currentContent = renderTemplateString(layoutBody, {
      ...pageData,
      content: currentContent,
      page: pageObj,
      collections,
      metadata,
    });
    layout = layout === 'post-layout.html' ? 'base-layout.html' : null;
  }

  return currentContent;
}

// ---------------------------------------------------------------------------
// 3. Zero-Dependency Syntax Highlighter (Prism-compatible tokens)
// ---------------------------------------------------------------------------

function highlightCode(code, lang) {
  const cleanCode = code.replace(RE_TRAILING_NEWLINE, '');
  if (!lang) {
    return `<pre><code>${escapeHtml(cleanCode)}\n</code></pre>`;
  }

  let highlighted = '';
  if (lang === 'json') {
    highlighted = highlightJson(cleanCode);
  } else if (lang === 'js' || lang === 'javascript' || lang === 'ts') {
    highlighted = highlightJs(cleanCode);
  } else if (lang === 'bash' || lang === 'shell' || lang === 'sh') {
    highlighted = highlightBash(cleanCode);
  } else {
    highlighted = escapeHtml(cleanCode);
  }

  return `<pre class="language-${lang}"><code class="language-${lang}">${highlighted}</code></pre>`;
}

function highlightJson(code) {
  let lastIndex = 0;
  let out = '';
  for (const m of code.matchAll(RE_HIGHLIGHT_JSON)) {
    out += escapeHtml(code.slice(lastIndex, m.index));
    if (m[1] !== undefined) out += `<span class="token property">${escapeHtml(m[1])}</span>`;
    else if (m[2] !== undefined) out += `<span class="token string">${escapeHtml(m[2])}</span>`;
    else if (m[3] !== undefined) out += `<span class="token boolean">${m[3]}</span>`;
    else if (m[4] !== undefined) out += `<span class="token null">${m[4]}</span>`;
    else if (m[5] !== undefined) out += `<span class="token number">${m[5]}</span>`;
    else if (m[6] !== undefined) out += `<span class="token punctuation">${m[6]}</span>`;
    lastIndex = m.index + m[0].length;
  }
  out += escapeHtml(code.slice(lastIndex));
  return out;
}

function highlightJs(code) {
  let lastIndex = 0;
  let out = '';
  for (const m of code.matchAll(RE_HIGHLIGHT_JS)) {
    out += escapeHtml(code.slice(lastIndex, m.index));
    if (m[1] !== undefined) out += `<span class="token comment">${escapeHtml(m[1])}</span>`;
    else if (m[2] !== undefined) out += `<span class="token string">${escapeHtml(m[2])}</span>`;
    else if (m[3] !== undefined) out += `<span class="token keyword">${m[3]}</span>`;
    else if (m[4] !== undefined) out += `<span class="token boolean">${m[4]}</span>`;
    else if (m[5] !== undefined) out += `<span class="token keyword">${m[5]}</span>`;
    else if (m[6] !== undefined) out += `<span class="token constant">${m[6]}</span>`;
    else if (m[7] !== undefined) out += `<span class="token class-name">${m[7]}</span>`;
    else if (m[8] !== undefined) out += `<span class="token function">${m[8]}</span>`;
    else if (m[9] !== undefined) out += `<span class="token number">${m[9]}</span>`;
    else if (m[10] !== undefined) out += `<span class="token operator">${escapeHtml(m[10])}</span>`;
    else if (m[11] !== undefined) out += `<span class="token punctuation">${m[11]}</span>`;
    lastIndex = m.index + m[0].length;
  }
  out += escapeHtml(code.slice(lastIndex));
  return out;
}

function highlightBash(code) {
  let lastIndex = 0;
  let out = '';
  for (const m of code.matchAll(RE_HIGHLIGHT_BASH)) {
    out += escapeHtml(code.slice(lastIndex, m.index));
    if (m[1] !== undefined) out += `<span class="token comment">${escapeHtml(m[1])}</span>`;
    else if (m[2] !== undefined) out += `<span class="token string">${escapeHtml(m[2])}</span>`;
    else if (m[3] !== undefined) out += `<span class="token variable">${escapeHtml(m[3])}</span>`;
    else if (m[4] !== undefined) out += `<span class="token keyword">${m[4]}</span>`;
    else if (m[5] !== undefined) out += `<span class="token function">${m[5]}</span>`;
    else if (m[6] !== undefined) out += `<span class="token operator">${escapeHtml(m[6])}</span>`;
    else if (m[7] !== undefined) out += `<span class="token punctuation">${escapeHtml(m[7])}</span>`;
    lastIndex = m.index + m[0].length;
  }
  out += escapeHtml(code.slice(lastIndex));
  return out;
}

// ---------------------------------------------------------------------------
// 4. Zero-Dependency Markdown Parser (with markdown-it-attrs support)
// ---------------------------------------------------------------------------

function parseAttrBlocks(attrGroupsStr) {
  const classes = [];
  const attrs = [];
  for (const bm of attrGroupsStr.matchAll(RE_ATTR_BLOCK)) {
    const tokens = bm[1].trim().split(RE_WHITESPACE);
    for (const tok of tokens) {
      if (!tok) continue;
      if (tok.startsWith('.')) {
        classes.push(tok.slice(1));
      } else if (tok.startsWith('#')) {
        attrs.push(`id="${escapeHtml(tok.slice(1))}"`);
      } else if (tok.includes('=')) {
        const [k, ...rest] = tok.split('=');
        const v = rest.join('=').replace(RE_SURROUNDING_QUOTES, '');
        if (k === 'class') classes.push(v);
        else attrs.push(`${k}="${escapeHtml(v)}"`);
      }
    }
  }
  let res = '';
  if (classes.length > 0) res += ` class="${escapeHtml(classes.join(' '))}"`;
  if (attrs.length > 0) res += ` ${attrs.join(' ')}`;
  return res;
}

function extractTrailingBlockAttrs(text) {
  if (RE_STANDALONE_IMG_WITH_ATTRS.test(text.trim())) {
    return { cleanText: text, attrHtml: '' };
  }
  const m = text.match(RE_TRAILING_BLOCK_ATTRS);
  if (m) {
    return {
      cleanText: m[1],
      attrHtml: parseAttrBlocks(m[2]),
    };
  }
  return { cleanText: text, attrHtml: '' };
}

export function renderInline(text = '', { disableAutolink = false } = {}) {
  if (!text) return '';

  const stash = [];
  const putStash = (html) => {
    const id = `\x00STASH_${stash.length}_\x00`;
    stash.push(html);
    return id;
  };

  let s = text;

  // 1. Inline code spans: `code`
  s = s.replace(RE_INLINE_CODE, (_, code) => putStash(`<code>${escapeHtml(code)}</code>`));

  // 2. Preserve existing inline HTML tags like `<br>`, `<a href="...">...</a>`
  s = s.replace(RE_INLINE_HTML_TAG, (tag) => putStash(tag));

  // 3. Images: ![alt](src "optional title"){optional attrs}
  s = s.replace(RE_MD_IMAGE, (_, alt, src, title, attrGroups) => {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    const extraAttrs = attrGroups ? parseAttrBlocks(attrGroups) : '';
    return putStash(
      `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${titleAttr}${extraAttrs}>`,
    );
  });

  // 4. Links: [text](url "optional title")
  s = s.replace(RE_MD_LINK, (_, label, href, title) => {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    const renderedLabel = renderInline(label, { disableAutolink: true });
    return putStash(`<a href="${escapeHtml(href)}"${titleAttr}>${renderedLabel}</a>`);
  });

  // 5. Autolinks: bare http(s):// URLs and bare domains (.com, .org, .it, .me, .gs)
  if (!disableAutolink) {
    s = s.replace(RE_AUTOLINK_URL, (url) => {
      let cleanUrl = url;
      let trailing = '';
      const tm = cleanUrl.match(RE_TRAILING_PUNCT);
      if (tm) {
        trailing = tm[1];
        cleanUrl = cleanUrl.slice(0, -trailing.length);
      }
      return putStash(`<a href="${escapeHtml(cleanUrl)}">${escapeHtml(cleanUrl)}</a>`) + trailing;
    });

    s = s.replace(RE_AUTOLINK_DOMAIN, (_, domain) =>
      putStash(`<a href="http://${escapeHtml(domain)}">${escapeHtml(domain)}</a>`),
    );
  }

  // 6. Backslash escapes: \! \* \_ \- etc.
  s = s.replace(RE_BACKSLASH_ESCAPE, (_, ch) => putStash(escapeHtml(ch)));

  // 7. Escape remaining raw HTML characters (&, <, >, ") before emphasis
  s = s
    .replace(RE_UNESCAPED_AMP, '&amp;')
    .replace(RE_LT, '&lt;')
    .replace(RE_GT, '&gt;')
    .replace(RE_QUOT, '&quot;');

  // 8. Bold: **text** or __text__
  s = s.replace(RE_BOLD_ASTERISK, '<strong>$1</strong>');
  s = s.replace(RE_BOLD_UNDERSCORE, '<strong>$1</strong>');

  // 9. Italic: *text* or _text_
  s = s.replace(RE_ITALIC_ASTERISK, '<em>$1</em>');
  s = s.replace(RE_ITALIC_UNDERSCORE, '$1<em>$2</em>');

  // 10. Restore stashed fragments
  while (s.includes('\x00STASH_')) {
    s = s.replace(RE_STASH_TOKEN, (_, idx) => stash[Number(idx)]);
  }

  return s;
}

export function renderMarkdown(md = '') {
  const lines = md.replace(RE_CRLF, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    const fenceMatch = line.match(RE_CODE_FENCE_OPEN);
    if (fenceMatch) {
      const lang = fenceMatch[1];
      const codeLines = [];
      i++;
      while (i < lines.length && !RE_CODE_FENCE_CLOSE.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      out.push(highlightCode(codeLines.join('\n'), lang));
      continue;
    }

    if (RE_HORIZONTAL_RULE.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    const headingMatch = line.match(RE_HEADING);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const { cleanText, attrHtml } = extractTrailingBlockAttrs(headingMatch[2].trim());
      out.push(`<h${level}${attrHtml}>${renderInline(cleanText)}</h${level}>`);
      i++;
      continue;
    }

    if (RE_BLOCKQUOTE_LINE.test(line)) {
      const bqLines = [];
      while (
        i < lines.length &&
        (RE_BLOCKQUOTE_LINE.test(lines[i]) ||
          (lines[i].trim() !== '' && bqLines.length > 0 && !RE_BLOCK_INTERRUPTER.test(lines[i])))
      ) {
        if (RE_BLOCKQUOTE_LINE.test(lines[i])) {
          bqLines.push(lines[i].replace(RE_BLOCKQUOTE_LINE, ''));
          i++;
        } else {
          break;
        }
      }
      out.push(`<blockquote>\n${renderMarkdown(bqLines.join('\n'))}</blockquote>`);
      continue;
    }

    const listMatch = line.match(RE_LIST_ITEM);
    if (listMatch && listMatch[1].length === 0) {
      const { html, nextIndex } = parseList(lines, i, 0);
      out.push(html);
      i = nextIndex;
      continue;
    }

    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' && !RE_PARA_INTERRUPTER.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    const rawPara = paraLines.join('\n');
    const { cleanText, attrHtml } = extractTrailingBlockAttrs(rawPara);
    out.push(`<p${attrHtml}>${renderInline(cleanText)}</p>`);
  }

  return out.join('\n') + '\n';
}

function parseList(lines, startIndex, baseIndent) {
  const firstMatch = lines[startIndex].match(RE_LIST_ITEM);
  const isOrdered = RE_ORDERED_MARKER.test(firstMatch[2]);
  const startNum = isOrdered ? parseInt(firstMatch[2], 10) : 1;
  const tag = isOrdered ? 'ol' : 'ul';
  const startAttr = isOrdered && startNum !== 1 ? ` start="${startNum}"` : '';
  const items = [];
  let isLoose = false;
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length) {
        const nextMatch = lines[j].match(RE_LIST_ITEM);
        if (nextMatch && nextMatch[1].length >= baseIndent) {
          isLoose = true;
          i = j;
          continue;
        }
      }
      break;
    }

    const m = line.match(RE_LIST_ITEM);
    if (!m) break;
    const indent = m[1].length;
    if (indent < baseIndent) break;

    if (indent > baseIndent) {
      const sub = parseList(lines, i, indent);
      if (items.length > 0) {
        items[items.length - 1].sublists.push(sub.html);
      }
      i = sub.nextIndex;
      continue;
    }

    const itemIsOrdered = RE_ORDERED_MARKER.test(m[2]);
    if (itemIsOrdered !== isOrdered) break;

    const itemLines = [m[3]];
    i++;

    while (i < lines.length && lines[i].trim() !== '' && !RE_LIST_CONTINUATION_STOP.test(lines[i])) {
      if (RE_LIST_BLOCK_STOP.test(lines[i])) break;
      itemLines.push(lines[i].trim());
      i++;
    }

    items.push({ text: itemLines.join('\n'), sublists: [] });
  }

  const renderedItems = items.map((item) => {
    const inlineHtml = renderInline(item.text);
    const subHtml = item.sublists.length > 0 ? '\n' + item.sublists.join('\n') + '\n' : '';
    if (isLoose) {
      return `<li>\n<p>${inlineHtml}</p>${subHtml}\n</li>`;
    }
    return `<li>${inlineHtml}${subHtml}</li>`;
  });

  return {
    html: `<${tag}${startAttr}>\n${renderedItems.join('\n')}\n</${tag}>`,
    nextIndex: i,
  };
}

// ---------------------------------------------------------------------------
// 5. Frontmatter & Excerpt Parser
// ---------------------------------------------------------------------------

function parseFrontMatterFile(filePath, defaults = {}) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(RE_CRLF, '\n');
  const stat = fs.statSync(filePath);

  if (!raw.startsWith('---\n')) {
    return {
      data: { ...defaults },
      excerpt: '',
      body: raw,
      date: stat.mtime,
    };
  }

  const parts = raw.split(RE_FM_DELIMITER);
  const fmRaw = parts[1] || '';
  const data = { ...defaults, ...parseSimpleYaml(fmRaw) };

  let excerpt = '';
  let body = '';

  if (parts.length >= 4) {
    excerpt = parts[2].trim();
    const restBody = parts.slice(3).join('\n---\n').trim();
    body = excerpt ? `${excerpt}\n\n${restBody}` : restBody;
  } else {
    body = parts.slice(2).join('\n---\n').trim();
  }

  data.excerpt = excerpt;
  const date = data.date ? new Date(data.date) : stat.birthtime || stat.mtime;

  return { data, excerpt, body, date };
}

function parseSimpleYaml(yamlStr) {
  const result = {};
  const lines = yamlStr.split('\n');
  let currentObjKey = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(RE_TRAILING_WS, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;

    if (RE_LEADING_WS.test(line) && currentObjKey) {
      const subTrim = line.trim();
      if (subTrim.startsWith('- ')) {
        if (!Array.isArray(result[currentObjKey])) result[currentObjKey] = [];
        result[currentObjKey].push(parseYamlScalar(subTrim.slice(2).trim()));
      } else {
        const kv = subTrim.match(RE_YAML_KV);
        if (kv) {
          if (typeof result[currentObjKey] !== 'object' || Array.isArray(result[currentObjKey])) {
            result[currentObjKey] = {};
          }
          result[currentObjKey][kv[1]] = parseYamlScalar(kv[2]);
        }
      }
      continue;
    }

    const match = line.match(RE_YAML_KV);
    if (match) {
      const key = match[1];
      const valStr = match[2].trim();
      if (valStr === '') {
        currentObjKey = key;
        result[key] = {};
      } else {
        currentObjKey = null;
        result[key] = parseYamlScalar(valStr);
      }
    }
  }
  return result;
}

function parseYamlScalar(valStr) {
  if (valStr.startsWith('[') && valStr.endsWith(']')) {
    const inner = valStr.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => parseYamlScalar(s.trim()));
  }
  if (
    (valStr.startsWith("'") && valStr.endsWith("'")) ||
    (valStr.startsWith('"') && valStr.endsWith('"'))
  ) {
    return valStr.slice(1, -1);
  }
  if (valStr === 'true') return true;
  if (valStr === 'false') return false;
  if (RE_INTEGER.test(valStr)) return Number(valStr);
  return valStr;
}

// ---------------------------------------------------------------------------
// 6. Generic Build Pipeline (discovers all .md / .html pages in src/)
// ---------------------------------------------------------------------------

const PASSTHROUGH_DIRS = new Set(['assets', 'img', 'fonts', 'css']);
const IGNORED_DIRS = new Set(['_includes', ...PASSTHROUGH_DIRS]);

function discoverContentFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === SRC_DIR && IGNORED_DIRS.has(entry.name)) continue;
      results.push(...discoverContentFiles(fullPath));
    } else if (RE_CONTENT_EXT.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function computeUrls(filePath, permalink, metadata) {
  if (permalink) {
    const resolved = renderTemplateString(String(permalink), { metadata }).trim();
    const url = resolved.startsWith('/') ? resolved : `/${resolved}`;
    const outRel = url.endsWith('/') ? path.join(url.slice(1), 'index.html') : url.slice(1);
    return { url, outRel };
  }

  const rel = path.relative(SRC_DIR, filePath).replace(RE_BACKSLASH, '/');
  if (rel === 'sitemap.xml.html') {
    return { url: '/sitemap.xml', outRel: 'sitemap.xml' };
  }
  if (rel === 'feed/feed.html') {
    const url = metadata.feed.path;
    return { url, outRel: url.replace(RE_LEADING_SLASHES, '') };
  }
  if (rel === 'archive/index.html') {
    return { url: '/posts/', outRel: 'posts/index.html' };
  }

  const noExt = rel.replace(RE_CONTENT_EXT, '');
  if (noExt === 'index') {
    return { url: '/', outRel: 'index.html' };
  }
  if (noExt.endsWith('/index')) {
    const dirPart = noExt.slice(0, -'/index'.length);
    return { url: `/${dirPart}/`, outRel: `${dirPart}/index.html` };
  }
  return { url: `/${noExt}/`, outRel: `${noExt}/index.html` };
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

export function buildSite() {
  const startTime = performance.now();
  templateCache.clear();

  const metadata = METADATA;
  const postDefaults = POST_DEFAULTS;

  // 1. Copy static passthrough assets
  for (const dir of PASSTHROUGH_DIRS) {
    copyDirRecursive(path.join(SRC_DIR, dir), path.join(OUT_DIR, dir));
  }
  if (fs.existsSync(path.join(SRC_DIR, '.htaccess'))) {
    fs.copyFileSync(path.join(SRC_DIR, '.htaccess'), path.join(OUT_DIR, '.htaccess'));
  }

  // 2. Discover and parse all pages/posts in src/
  const files = discoverContentFiles(SRC_DIR);
  const pages = files.map((filePath) => {
    const isMarkdown = filePath.endsWith('.md');
    const isPost = filePath.startsWith(path.join(SRC_DIR, 'posts') + path.sep);
    const rel = path.relative(SRC_DIR, filePath).replace(RE_BACKSLASH, '/');

    let data = {};
    let rawBody = '';
    let date;

    if (isMarkdown) {
      const parsed = parseFrontMatterFile(filePath, isPost ? postDefaults : {});
      data = parsed.data;
      rawBody = parsed.body;
      date = parsed.date;
    } else {
      rawBody = fs.readFileSync(filePath, 'utf8').replace(RE_CRLF, '\n');
      const stat = fs.statSync(filePath);
      date = stat.birthtime || stat.mtime;
      if (rel === 'sitemap.xml.html' || rel === 'feed/feed.html') {
        data = { excludeFromCollections: true };
      } else if (rel === 'links/index.html') {
        data = { layout: 'links-layout.html' };
      } else {
        data = { layout: 'base-layout.html' };
      }
    }

    const { url, outRel } = computeUrls(filePath, data.permalink, metadata);

    return {
      filePath,
      isMarkdown,
      url,
      outRel,
      date,
      data,
      rawBody,
      templateContent: '',
    };
  });

  // Sort chronologically
  pages.sort((a, b) => a.date - b.date);

  // 3. Build collections (`all`, `post`, `posts`, `pinned`, etc.)
  const collections = { all: [], post: [], posts: [], pinned: [] };
  for (const p of pages) {
    if (p.data.excludeFromCollections) continue;
    collections.all.push(p);
    const tags = Array.isArray(p.data.tags) ? p.data.tags : p.data.tags ? [p.data.tags] : [];
    for (const tag of tags) {
      if (!collections[tag]) collections[tag] = [];
      collections[tag].push(p);
    }
  }
  collections.posts = collections.post;

  // 4. First pass: render markdown body for each markdown page (needed by RSS feed `templateContent`)
  for (const p of pages) {
    if (p.isMarkdown) {
      p.templateContent = renderMarkdown(p.rawBody);
    }
  }

  // 5. Second pass: render templates and layout chains, then write to _site/
  for (const p of pages) {
    const innerContent = p.isMarkdown
      ? p.templateContent
      : renderTemplateString(p.rawBody, { ...p.data, page: p, collections, metadata });

    const finalOutput = renderWithLayouts(innerContent, p.data, p, collections, metadata);
    const outPath = path.join(OUT_DIR, p.outRel);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, finalOutput, 'utf8');
  }

  const elapsed = (performance.now() - startTime).toFixed(1);
  console.log(`Built ${pages.length} files in ${elapsed}ms -> _site/`);
}

// ---------------------------------------------------------------------------
// 7. Built-in Dev Server + File Watcher (`node build.mjs --serve`)
// ---------------------------------------------------------------------------

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function startDevServer(port = 8080) {
  buildSite();

  let debounceTimer = null;
  fs.watch(SRC_DIR, { recursive: true }, (_event, filename) => {
    if (filename && filename.endsWith('.DS_Store')) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`Change detected (${filename}), rebuilding...`);
      try {
        buildSite();
      } catch (err) {
        console.error('Build error:', err);
      }
    }, 80);
  });

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url, `http://localhost:${port}`);
    const pathname = decodeURIComponent(reqUrl.pathname);
    let filePath = path.join(OUT_DIR, pathname);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    } else if (!path.extname(filePath) && fs.existsSync(path.join(filePath, 'index.html'))) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      const notFound = path.join(OUT_DIR, '404.html');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  server.listen(port, () => {
    console.log(`Dev server listening on http://localhost:${port} (watching src/)`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--serve')) {
    startDevServer();
  } else {
    buildSite();
  }
}
