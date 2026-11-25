// Bundles src/ into ONE self-contained HTML file (JS as IIFE, CSS with fonts as data URIs).
// Usage: node build.mjs [--out dist/index.html]
import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
if (outIdx !== -1 && !args[outIdx + 1]) {
  console.error('build: --out needs a path');
  process.exit(2);
}
const outFile = resolve(root, outIdx !== -1 ? args[outIdx + 1] : 'dist/index.html');
const TITLE = 'MBA CONSULT · Payment Portal (Demo)';

const common = { bundle: true, write: false, minify: true, logLevel: 'silent', absWorkingDir: root };

const js = await esbuild.build({
  ...common,
  entryPoints: ['src/main.js'],
  format: 'iife',
  platform: 'browser',
  target: ['chrome110', 'safari16', 'edge110'],
  loader: { '.svg': 'text' },
  legalComments: 'none',
  outfile: 'dist/.tmp/main.js', // name only; nothing is written (write:false)
});
const css = await esbuild.build({
  ...common,
  entryPoints: ['src/styles/index.css'],
  loader: { '.woff2': 'dataurl', '.svg': 'dataurl' },
  outdir: 'dist/.tmp', // required by esbuild for CSS assets; nothing is written (write:false)
});

const pick = (res, ext) => {
  const f = res.outputFiles.find((o) => o.path.endsWith(ext));
  if (!f) throw new Error(`build: no ${ext} output`);
  return f.text;
};
// Prevent the inlined code from closing its own <script>/<style> element.
const jsText = pick(js, '.js').replace(/<\/(script)/gi, '<\\/$1');
const cssText = pick(css, '.css').replace(/<\/(style)/gi, '<\\/$1');

// Inline favicon (MBA's own mark) so no browser ever requests /favicon.ico (Task 10: that request
// was the only console error when the page is served over http).
const favicon = `data:image/svg+xml;base64,${readFileSync(resolve(root, 'src/assets/mba_logo.svg')).toString('base64')}`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${TITLE}</title>
<link rel="icon" type="image/svg+xml" href="${favicon}">
<style>${cssText}</style>
</head>
<body>
<div id="app"></div>
<script>${jsText}</script>
</body>
</html>
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
const bytes = statSync(outFile).size;
console.log(`build: wrote ${outFile} (${bytes.toLocaleString('en-US')} bytes)`);
if (bytes > 3 * 1024 * 1024) {
  console.error(`build: WARNING ${bytes} bytes exceeds the 3 MB budget (3,145,728)`);
  process.exitCode = 1;
}
