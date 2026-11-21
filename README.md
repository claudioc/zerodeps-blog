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
npm run eject                              # optional: personalize config and clean up starter files
npm run serve                              # http://localhost:8080
```

`npm run build` writes the site to `_site/`, ready to upload to any static host.

## Make it your own

Run `npm run eject` (or `node eject.mjs --dry-run` first to preview) to automate this: it asks for your site details, updates `site.config.json` and `package.json`, replaces `README.md` with a minimal one for your site, removes starter-only files (`LICENSE`, `test.mjs`, and `eject.mjs` itself), and optionally removes the sample posts and `.git`. Note that `eject` can only be run once—if you want to hack on the engine itself and keep the test suite, clone the repo and skip ejecting.

If you prefer doing it by hand, remove what belongs to the starter itself rather than to your website:

- [ ] **`package.json`**: change `name`, `version` and `description`; set `author` to yourself (or remove it); update or remove `repository` and `keywords`; set `license` to your choice (or `UNLICENSED`); consider adding `"private": true` so it can't be published to npm by mistake.
- [ ] **`LICENSE`**: delete it or replace it with your own (see [License](#license)).
- [ ] **`README.md`**: replace this file with notes about *your* site (how to build and deploy it).
- [ ] **Git history**: if you cloned the repository instead of using `degit` or "Use this template", start fresh with `rm -rf .git && git init`.
- [ ] **Sample content**: remove the placeholder author "Jane Doe" and the `example.com` links from `site.config.json`, the sample posts in `src/posts/`, the about page text and the default avatar (see [INSTRUCTIONS.md](INSTRUCTIONS.md#customize)).
- [ ] **`src/robots.txt`**: adjust it to your needs (it currently allows every crawler).

A quick check that nothing was left behind:

```sh
grep -rniE "jane doe|example\.com|zerodeps-blog|claudio" --exclude-dir=_site --exclude-dir=.git .
```

## Documentation

See **[INSTRUCTIONS.md](INSTRUCTIONS.md)** for:

- [Customizing your site](INSTRUCTIONS.md#customize)
- [Writing posts](INSTRUCTIONS.md#writing-posts)
- [Templates & `<zd-*>` tags](INSTRUCTIONS.md#templates)
- [Styling, design & Tailwind](INSTRUCTIONS.md#styling--design)
- [Project layout](INSTRUCTIONS.md#project-layout)
- [Deployment & Nginx example](INSTRUCTIONS.md#deployment)
- [Engine rules & gotchas (for humans and AI agents)](INSTRUCTIONS.md#engine-rules--gotchas-for-humans-and-ai-agents)

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
