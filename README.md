# zerodeps-blog

A tiny, **zero-dependency** static blog starter. One Node.js script (`build.mjs`) turns Markdown and HTML templates into a fast static site: no frameworks, no `node_modules`.

## Features

- Markdown posts with front matter and excerpts
- Minimal template engine (`{{ }}`, `<cc-if>`, `<cc-for>`, `<cc-set>`, `<cc-include>`)
- Home, archive, about, links and 404 pages
- Atom feed and sitemap
- Built-in dev server with `npm run serve`

## Quick start

```sh
npx degit claudioc/zerodeps-blog my-blog   # or click "Use this template" on GitHub
cd my-blog
npm run serve                              # http://localhost:8080
```

`npm run build` writes the site to `_site/`, ready to upload to any static host.

## Customize

1. Edit `site.config.json`: site URL, title, author, navigation, social links, content license.
2. Replace `src/assets/avatar.svg` and `src/assets/favicon.ico`.
3. Write your about page in `src/about/index.md`.
4. Delete the sample posts in `src/posts/` and add your own.
5. Restyle `src/css/main.css` to taste.

## Writing posts

Create `src/posts/<year>/<slug>.md`:

```md
---
title: 'My post'
description: 'Short summary'
date: 2026-01-01
tags: ['post']        # add 'pinned' to show it on the home page
---
First paragraph = excerpt.
---

The rest of the post.
```

Put images in `src/img/` and reference them as `/img/...`.

## Project layout

```
build.mjs            the whole generator + dev server
site.config.json     your site settings
src/_includes/       layouts and partials
src/posts/           blog posts (Markdown)
src/css, src/assets  styles, fonts, icons
```

## License

Code is MIT. The sample content is yours to replace.
