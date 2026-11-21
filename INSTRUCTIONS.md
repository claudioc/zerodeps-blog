# Instructions

Reference guide for customizing your site, writing posts, editing templates and deploying.

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
draft: false          # set to true to hide from `npm run build` (still visible in `npm run serve`)
---
First paragraph = excerpt.
---

The rest of the post.
```

Put images in `src/img/` and reference them as `/img/...`.

## Templates

HTML templates live in `src/_includes/` (and `.html` pages in `src/`). Expressions use `{{ ... }}` (HTML-escaped by default; append `| safe` for raw HTML, or chain filters like `head(-5)`, `reverse`, `niceDate`, `niceShortDate`, `toHTML`, `url`).

Four custom tags handle control flow and partials (attribute values must be double-quoted; use single quotes for string literals inside expressions):

- **`<zd-include src="..." ... />`** — inserts a partial from `src/_includes/`. Every extra attribute automatically sets a variable for the included template (it expands to `<zd-set>` before the partial):

  ```html
  <zd-include src="head.html" title="'My Links'" styles="'links.css'" />
  <zd-include src="posts-list.html" postslist="collections.post | head(-5)" showExcerpt="true" />
  ```

- **`<zd-set var="name" value="expr" />`** — assigns a variable in the current template scope (closing `</zd-set>` is optional).
- **`<zd-if cond="expr">...</zd-if>`** — conditional block (`and`, `or`, `not` are supported; nesting `<zd-if>` inside `<zd-if>` is not).
- **`<zd-for each="item in list">...</zd-for>`** — loops over an array (nesting `<zd-for>` inside `<zd-for>` is not supported).

## Styling & Design

The default style (`src/css/main.css`, plus `src/css/links.css` as an example of a page-specific stylesheet passed via `<zd-include src="head.html" styles="'links.css'" />`) is intentionally minimal.

### Semantic HTML over classes

Instead of sprinkling classes on every element, the stylesheet targets the **HTML structure** (`#root > header`, `nav`, `main > section`, `article`, `footer`). Only a few functional classes are used across the templates:

- `.skip-to-content` — accessibility skip link
- `.nav-item-active` — active link in the top navigation
- `.posts-list`, `.pinned-posts`, `.excerpt`, `.archive` — post lists and home sections
- `.post-page`, `.about-page` — article layout hooks
- `.token.*` — syntax highlighting spans emitted by `build.mjs`

For quick customization, change the CSS custom properties at the top of `src/css/main.css` (`:root` and `@media (prefers-color-scheme: dark)`): palette, `--font-sans`, `--font-mono`, and `--max-width`.

### Throwing the CSS away and using Tailwind

If you'd rather scrap `src/css/main.css` and use Tailwind CSS (fair enough), you don't need to change `build.mjs`:

1. **Without `node_modules` (Tailwind Standalone CLI):** grab the single [Tailwind standalone executable](https://tailwindcss.com/blog/standalone-cli), replace `src/css/main.css` with `@import "tailwindcss";` (Tailwind v4), and let the CLI write the compiled CSS into `_site/css/main.css` (or into `src/css/main.css` so `build.mjs` copies it over).
2. **With npm (`@tailwindcss/cli`):** run `npm i -D @tailwindcss/cli`, put `@import "tailwindcss";` in `src/css/input.css`, and compile it to `src/css/main.css` (`npx @tailwindcss/cli -i src/css/input.css -o src/css/main.css --watch`).

Because Tailwind scans your `src/**/*.html` and `src/**/*.md` files directly, utility classes added to `src/_includes/*.html`—or attached to Markdown elements via the built-in `{.my-class}` attribute syntax—will be picked up automatically. Note that Markdown content inside `{{ content | safe }}` is rendered as bare `<p>`, `<h2>`, `<ul>`, `<pre>` tags, so you'll either want `@tailwindcss/typography` (`class="prose"` on `<article>`) or a handful of base element rules.

## Project layout

```
build.mjs            the whole generator + dev server
site.config.json     your site settings
src/_includes/       layouts and partials
src/posts/           blog posts (Markdown)
src/css, src/assets  styles, icons
```

## Deployment

`npm run build` produces a plain folder of HTML, CSS and assets in `_site/`. Anything that can serve static files can host it. Remember to set `url` in `site.config.json` to your real domain first: it's used for the feed, the sitemap and canonical links.

### Options

- **Static hosts** (Cloudflare Pages, Netlify, GitHub Pages, Vercel): connect the repository, set the build command to `npm run build` and the output directory to `_site`. Make sure the build image uses Node.js ≥ 22.13 (e.g. a `NODE_VERSION=22` environment variable or an `.nvmrc` file).
- **Your own server via rsync**: build locally and upload the result:

  ```sh
  npm run build
  rsync -avz --delete _site/ user@example.com:/var/www/example.com/
  ```

- **Push to deploy**: on your server, a bare Git repository with a `post-receive` hook can check out the code, run `npm run build` and `rsync` the output into the web root. No `npm install` needed, since there are no dependencies.
- **Apache**: the included `src/.htaccess` already maps 404 errors to `/404.html`.

### Example Nginx configuration

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name example.com;

    root /var/www/example.com;
    index index.html;

    # TLS certificates, e.g. from Let's Encrypt / Certbot
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # Security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "interest-cohort=()" always;
    add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'" always;

    # Pretty URLs: /posts/2026/hello-world/ -> /posts/2026/hello-world/index.html
    location / {
        try_files $uri $uri/ =404;
    }

    # Long-lived caching for static assets
    location ~* \.(css|woff2|svg|png|jpe?g|webp|ico)$ {
        expires 30d;
        add_header Cache-Control "public";
        access_log off;
    }

    # Quiet logs for common files
    location = /robots.txt  { access_log off; log_not_found off; }
    location = /favicon.ico { access_log off; log_not_found off; }

    # Never serve hidden files (.git, .htaccess, ...)
    location ~ /\. { deny all; access_log off; log_not_found off; }

    error_page 404 /404.html;

    gzip on;
    gzip_types text/css application/javascript application/xml application/atom+xml image/svg+xml;
}
```

Replace `example.com` and the paths with your own. If you add external scripts or fonts, adjust the `Content-Security-Policy` accordingly. Note that an `add_header` inside a `location` block replaces the server-level headers, so repeat the security headers there if you need them on assets too.

## Security notes

- **Templates are code.** Expressions inside `{{ }}` and `<zd-*>` attributes are compiled to JavaScript (`new Function`) and run at build time. Only build templates and content you trust.
- **Markdown can contain raw HTML.** Inline `<script>`, `<iframe>` or `on*=` handlers in a post end up verbatim in the output. Don't publish content from others without sanitizing it.
- **`| safe` disables escaping.** Use it only for HTML that you generated yourself (e.g. rendered post content), never for user-supplied data.
- **Keep third-party scripts to a minimum.** Prefer self-hosted assets and set a `Content-Security-Policy` header on your web server.

## Engine rules & gotchas (for humans and AI agents)

Because `build.mjs` is a lightweight, regex-driven single-file generator rather than a full SSG framework, keep these constraints in mind when modifying templates, content, or the build script:

1. **No front matter in `.html` files:** Only `.md` files are parsed for YAML front matter. Adding `---` blocks to `.html` files will render them literally as text. Layouts for `.html` pages are assigned in `buildSite()` inside `build.mjs`.
2. **Single-line YAML front matter only:** The front matter parser reads single-line `key: value` pairs. Write arrays inline (`tags: ['post', 'pinned']`), never as multi-line `- item` lists.
3. **Three `---` delimiters define an excerpt:** In `.md` files, if a third `---` line is present, the block between the second and third `---` is extracted as `data.excerpt` (and also kept as the first paragraph of the body). Use `***` instead of `---` if you want a horizontal rule (`<hr>`) inside a post.
4. **`<zd-*>` template compiler limits:**
   - **No `<zd-else>` tag:** use two complementary `<zd-if>` blocks or a ternary inside `{{ cond ? 'a' : 'b' }}`.
   - **No nesting of `<zd-if>` or `<zd-for>`:** nesting `<zd-if>` inside `<zd-if>` (or `<zd-for>` inside `<zd-for>`) throws a build-time error. Combine conditions with `and` / `or`, or extract the inner block into a `<zd-include>` partial.
   - **Quoting:** attribute values must use double quotes (`cond="..."`), so string literals inside expressions must use single quotes (`styles="'links.css'"`).
5. **Static passthrough whitelist & Node permission sandbox:**
   - Only directories listed in `PASSTHROUGH_DIRS` in `build.mjs` (`assets`, `img`, `fonts`, `css`, plus `src/.htaccess` and `src/robots.txt`) are copied verbatim to `_site/`. Add any new static folder (e.g. `js`) to `PASSTHROUGH_DIRS`.
   - `npm run build` and `npm run serve` run under `node --permission --allow-fs-read=./ --allow-fs-write=./_site/`. The `_site/` directory must exist before Node starts (`mkdir -p _site`), and `build.mjs` cannot write outside `_site/` or spawn child processes.
