import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderInline,
  renderMarkdown,
  renderTemplateString,
  parseSimpleYaml,
  buildSite,
} from './build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '_site');

test('renderInline handles emphasis, code, links, images, and escaping', () => {
  assert.equal(
    renderInline('Hello **bold**, _italic_, and `const x = 1 < 2`!'),
    'Hello <strong>bold</strong>, <em>italic</em>, and <code>const x = 1 &lt; 2</code>!',
  );
  assert.equal(
    renderInline('[Example](https://example.com "Title")'),
    '<a href="https://example.com" title="Title">Example</a>',
  );
  assert.equal(
    renderInline('![Alt text](/img/pic.webp){.hero #main-pic width=400}'),
    '<img src="/img/pic.webp" alt="Alt text" class="hero" id="main-pic" width="400">',
  );
});

test('renderMarkdown handles headings, lists, blockquotes, code blocks, and attributes', () => {
  const md = [
    '## Section {.title}',
    '',
    '- first',
    '- second',
    '',
    '> quoted text',
    '',
    '```js',
    'const a = 42;',
    '```',
  ].join('\n');

  const html = renderMarkdown(md);
  assert.match(html, /<h2 class="title">Section<\/h2>/);
  assert.match(html, /<ul>\n<li>first<\/li>\n<li>second<\/li>\n<\/ul>/);
  assert.match(html, /<blockquote>\n<p>quoted text<\/p>\n<\/blockquote>/);
  assert.match(html, /<pre class="language-js"><code class="language-js">/);
  assert.match(html, /<span class="token keyword">const<\/span>/);
});

test('renderTemplateString handles expressions, filters, <zd-if>, <zd-for>, and <zd-set>', () => {
  const tpl = [
    '<zd-set var="greeting" value="\'Hello\'" />',
    '<zd-if cond="items and items.length">',
    '<ul>',
    '<zd-for each="item in items | reverse">',
    '<li>{{ greeting }} {{ item }}</li>',
    '</zd-for>',
    '</ul>',
    '</zd-if>',
  ].join('\n');

  const out = renderTemplateString(tpl, { items: ['a', 'b & c'] });
  assert.equal(out.trim(), '<ul>\n<li>Hello b &amp; c</li>\n<li>Hello a</li>\n</ul>');
});

test('renderTemplateString rejects nested <zd-if> and <zd-for>', () => {
  assert.throws(
    () => renderTemplateString('<zd-if cond="a"><zd-if cond="b"></zd-if></zd-if>', { a: true, b: true }),
    /Nested <zd-if> statements are not supported/,
  );
  assert.throws(
    () =>
      renderTemplateString('<zd-for each="x in list"><zd-for each="y in list"></zd-for></zd-for>', {
        list: [1],
      }),
    /Nested <zd-for> statements are not supported/,
  );
});

test('parseSimpleYaml parses scalars, arrays, booleans, and nested objects', () => {
  const yaml = [
    "title: 'My Post'",
    'draft: true',
    'count: 5',
    "tags: ['post', 'pinned']",
    'author:',
    '  name: Jane',
  ].join('\n');

  assert.deepEqual(parseSimpleYaml(yaml), {
    title: 'My Post',
    draft: true,
    count: 5,
    tags: ['post', 'pinned'],
    author: { name: 'Jane' },
  });
});

test('buildSite generates expected output files including robots.txt and valid <time datetime>', () => {
  buildSite();
  assert.ok(fs.existsSync(path.join(OUT_DIR, 'index.html')));
  assert.ok(fs.existsSync(path.join(OUT_DIR, 'robots.txt')));
  assert.ok(fs.existsSync(path.join(OUT_DIR, 'sitemap.xml')));
  assert.ok(fs.existsSync(path.join(OUT_DIR, 'feed/feed.xml')));

  const indexHtml = fs.readFileSync(path.join(OUT_DIR, 'index.html'), 'utf8');
  assert.match(indexHtml, /<html lang="en">/);
  assert.match(indexHtml, /<time datetime="\d{4}-\d{2}-\d{2}">/);
});
