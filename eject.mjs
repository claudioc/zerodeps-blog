#!/usr/bin/env node

// eject.mjs: turn the zerodeps-blog starter into *your* project.
//
// Asks a few questions, then:
//   - writes your details into site.config.json
//   - rewrites package.json (name, author, license, private, no repository)
//   - deletes the starter's LICENSE and replaces README.md with a minimal one
//     (keeping INSTRUCTIONS.md for reference)
//   - optionally removes the sample posts and the starter's Git history
//   - deletes itself
//
// Usage: node eject.mjs [--dry-run]
// Zero dependencies, no child processes: only node:fs, node:path, node:readline.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const SELF = fileURLToPath(import.meta.url);
const SAMPLE_POSTS = ['src/posts/2026/hello-world.md', 'src/posts/2026/writing-posts.md'];

const p = (rel) => path.join(ROOT, rel);
const readJson = (rel) => JSON.parse(fs.readFileSync(p(rel), 'utf8'));

// --- Prompting ---------------------------------------------------------------
// An async line iterator (instead of rl.question) also works with piped input.

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
const lines = rl[Symbol.asyncIterator]();

async function ask(question, fallback = '') {
  process.stdout.write(fallback ? `${question} (${fallback}): ` : `${question}: `);
  const { value, done } = await lines.next();
  const answer = done ? '' : String(value).trim();
  if (done) process.stdout.write('\n');
  return answer || fallback;
}

async function confirm(question, fallback) {
  const answer = (await ask(`${question} [${fallback ? 'Y/n' : 'y/N'}]`)).toLowerCase();
  return answer ? answer.startsWith('y') : fallback;
}

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'my-blog';

// --- File operations (honoring --dry-run) ---------------------------------------

function writeFile(rel, content) {
  console.log(`  write   ${rel}`);
  if (!DRY_RUN) fs.writeFileSync(p(rel), content);
}

function remove(rel) {
  if (!fs.existsSync(p(rel))) return;
  console.log(`  delete  ${rel}`);
  if (!DRY_RUN) fs.rmSync(p(rel), { recursive: true, force: true });
}

// --- Main ----------------------------------------------------------------------

async function main() {
  console.log('\nzerodeps-blog eject: make this starter your own.');
  console.log(DRY_RUN ? '(dry run: nothing will be changed)\n' : 'Press Enter to accept the default in brackets.\n');

  const config = readJson('site.config.json');
  const pkg = readJson('package.json');

  const authorName = await ask('Your name', '');
  const authorEmail = await ask('Your email', '');
  const title = await ask('Site title', authorName || config.title);
  const subtitle = await ask('Subtitle', config.subtitle);
  const description = await ask('Short description', `${title}'s personal website`);
  const url = (await ask('Site URL', 'https://example.com')).replace(/\/+$/, '');
  const language = await ask('Language code', config.language || 'en');
  const name = slugify(await ask('Project name (package.json)', slugify(title)));
  const removePosts = await confirm('Remove the sample posts?', true);
  const hasGit = fs.existsSync(p('.git'));
  const resetGit = hasGit && (await confirm("Delete the starter's Git history (.git)?", false));
  rl.close();

  console.log('');

  // site.config.json
  const newConfig = {
    ...config,
    url,
    title,
    subtitle,
    description,
    language,
    author: { ...config.author, name: authorName || title, email: authorEmail },
    social: [],
  };
  writeFile('site.config.json', JSON.stringify(newConfig, null, 2) + '\n');

  // package.json
  const { repository, keywords, author, license, ...rest } = pkg;
  const scripts = { ...rest.scripts };
  delete scripts.eject;
  const newPkg = {
    ...rest,
    name,
    version: '0.1.0',
    private: true,
    description,
    scripts,
    author: authorEmail ? `${authorName} <${authorEmail}>` : authorName,
    license: 'UNLICENSED',
  };
  writeFile('package.json', JSON.stringify(newPkg, null, 2) + '\n');

  // LICENSE and README.md (INSTRUCTIONS.md stays untouched)
  remove('LICENSE');
  writeFile(
    'README.md',
    `# ${title}

${description}

## Development

Requires Node.js >= 22.13.

\`\`\`sh
npm run serve   # dev server on http://localhost:8080
npm run build   # static site in _site/
\`\`\`

Site settings live in \`site.config.json\`, posts in \`src/posts/<year>/\`. See [INSTRUCTIONS.md](INSTRUCTIONS.md) for writing posts, templates, deployment and security notes.

---

Bootstrapped from [zerodeps-blog](https://github.com/claudioc/zerodeps-blog) by [Claudio Cicali](https://claudio.cica.li).
`,
  );

  // Sample posts
  if (removePosts) SAMPLE_POSTS.forEach(remove);

  // Git history
  if (resetGit) remove('.git');

  // Self-destruct
  console.log(`  delete  ${path.relative(ROOT, SELF)}`);
  if (!DRY_RUN) fs.rmSync(SELF);

  console.log('\nDone! Next steps:');
  if (resetGit) console.log('  - git init && git add -A && git commit -m "First commit"');
  console.log('  - add your social links and avatar (site.config.json, src/assets/)');
  console.log('  - write your about page (src/about/index.md) and your first post');
  console.log('  - npm run serve\n');
}

main().catch((err) => {
  console.error(`\neject failed: ${err.message}`);
  process.exit(1);
});
