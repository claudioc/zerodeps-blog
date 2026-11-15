# zerodeps-blog

A tiny, **zero-dependency** static blog starter. One Node.js script (`build.mjs`) turns Markdown and HTML templates into a fast static site: no frameworks, no `node_modules`.

## Why

A personal blog is just a handful of static pages, a feed, a sitemap and some Markdown posts. Yet most static site generators pull in hundreds of transitive packages to produce it. Come back to write a post after a few months and you're greeted by outdated dependencies, `npm audit` warnings and plugins that changed their conventions.

zerodeps-blog takes the opposite approach:

- **Zero dependencies.** Only stock Node.js (`node:fs`, `node:path`, `node:http`, `node:url`). No `node_modules`, no `package-lock.json`, nothing to audit or upgrade.
- **Built to last.** A single `node build.mjs` that should still run untouched ten years from now.
- **Safer by design.** Every dependency is code written by someone you don't control, running on your machine. Packages get hijacked, maintainers' accounts get compromised and malicious versions (or `postinstall` scripts) slip into the tree. With no dependencies there is simply no third-party code to trust: what you read in `build.mjs` is all that runs.
- **Small enough to own.** You don't need a general-purpose SSG, just the features a blog actually uses. The whole generator fits in one readable file you can change freely.
- **HTML-native templates.** Control flow uses explicit custom elements (`<zd-if>`, `<zd-for>`, …) instead of a foreign template DSL, and templates are kept flat on purpose. Usage of custom elements is limited and explicit and allows for normal syntax highlighting in editors.
- **Fast.** Full cold builds take around 100 ms.

The story behind it: [Moving away from Eleventy](https://claudio.cica.li/posts/2026/moving-away-from-eleventy/).

## Features

- Markdown posts with front matter and excerpts
- Minimal template engine (`{{ }}`, `<zd-if>`, `<zd-for>`, `<zd-set>`, `<zd-include>`)
- Home, archive, about, links and 404 pages
- Atom feed and sitemap
- Built-in dev server with `npm run serve`

## Requirements

- **Node.js ≥ 22.13.** No other software is needed. The minimum version comes from security, not features: `npm run build` and `npm run serve` run the generator inside the stable [Node.js permission model](https://nodejs.org/api/permissions.html) (`--permission`), available without experimental flags only from 22.13 on (see [Security](#security)). On older versions you can still use `npm run build:unsafe`, without the sandbox.

## Quick start

```sh
npx degit claudioc/zerodeps-blog my-blog   # or click "Use this template" on GitHub
cd my-blog
npm run serve                              # http://localhost:8080
```

`npm run build` writes the site to `_site/`, ready to upload to any static host.

## Make it your own

Once you've started your site from this kit, remove what belongs to the starter itself rather than to your website:

- [ ] **`package.json`**: change `name`, `version` and `description`; set `author` to yourself (or remove it); update or remove `repository` and `keywords`; set `license` to your choice (or `UNLICENSED`); consider adding `"private": true` so it can't be published to npm by mistake.
- [ ] **`LICENSE`**: delete it or replace it with your own (see [License](#license)).
- [ ] **`README.md`**: replace this file with notes about *your* site (how to build and deploy it).
- [ ] **Git history**: if you cloned the repository instead of using `degit` or "Use this template", start fresh with `rm -rf .git && git init`.
- [ ] **Sample content**: remove the placeholder author "Jane Doe" and the `example.com` links from `site.config.json`, the sample posts in `src/posts/`, the about page text and the default avatar (see [Customize](#customize)).
- [ ] **`robots.txt`**: adjust it to your needs (it currently allows every crawler).

A quick check that nothing was left behind:

```sh
grep -rniE "jane doe|example\.com|zerodeps-blog|claudio" --exclude-dir=_site --exclude-dir=.git .
```

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

## Security

A static site has no server-side code at runtime, but it isn't automatically safe. Avoid executing arbitrary scripts, both when building and in the generated pages.

### Trusting `build.mjs` without auditing it by hand

You shouldn't have to read 1,000 lines of code to run it safely. A few layers help:

- **Sandboxed by default.** `npm run build` and `npm run serve` use the [Node.js permission model](https://nodejs.org/api/permissions.html): the script can only *read* the project folder and only *write* into `_site/`. Spawning processes, worker threads and native addons are blocked. Even if `build.mjs` (or a template) were tampered with, it couldn't touch your home directory, SSH keys or other projects. Requires Node.js ≥ 22.13; `npm run build:unsafe` runs without restrictions.
- **Check where it comes from.** Start from the official repository or a tagged release, not from a random fork or a copy-pasted gist. Pin a specific tag or commit instead of tracking `main`.
- **Diff, don't audit.** Since it's a single file, upgrading means reviewing `git diff` of `build.mjs`, which is usually a few lines. Anything unexpected (network calls, `child_process`, reading outside the project) is easy to spot. A quick `grep -nE "child_process|fetch\(|import\(|process\.env" build.mjs` should return nothing.
- **Isolate if in doubt.** Run the build in a container or a CI job (e.g. GitHub Actions) with no secrets, and only deploy the generated `_site/`.

### General advice
- **Templates are code.** Expressions inside `{{ }}` and `<zd-*>` attributes are compiled to JavaScript (`new Function`) and run with full Node.js privileges at build time. Only build templates and content you trust, and never run `build.mjs` on untrusted pull requests or third-party themes without reviewing them first.
- **Markdown can contain raw HTML.** Inline `<script>`, `<iframe>` or `on*=` handlers in a post end up verbatim in the output. Don't publish content from others without sanitizing it.
- **`| safe` disables escaping.** Use it only for HTML that you generated yourself (e.g. rendered post content), never for user-supplied data.
- **Keep third-party scripts to a minimum.** Every external `<script src>` (analytics, widgets, CDNs) runs with full access to your pages. Prefer self-hosted assets and consider a `Content-Security-Policy` header on your web server.
- **Zero dependencies helps.** Without `node_modules` there is no supply-chain surface to audit, so don't add `npm` packages to the build lightly.

## Author

Claudio Cicali <claudio.cicali@gmail.com>

## License

[MIT No Attribution (MIT-0)](LICENSE). When you start your own site from this kit, you don't need to keep my name or the license file: feel free to delete `LICENSE` or replace it with your own, and to update the `author` and `license` fields in `package.json`. The sample content is yours to replace.
