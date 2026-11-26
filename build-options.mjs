// Bundles the design-options page (src/options/) into ONE self-contained HTML file, the same way
// build.mjs bundles the demo: JS as an IIFE, CSS with fonts and images as data URIs, no network.
// Added 2026-11-26 for the "2 more design options" request. The demo build (build.mjs) is untouched.
// Usage: node build-options.mjs [--out dist/options.html]
import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
if (outIdx !== -1 && !args[outIdx + 1]) {
  console.error('build-options: --out needs a path');
  process.exit(2);
}
const outFile = resolve(root, outIdx !== -1 ? args[outIdx + 1] : 'dist/options.html');
const TITLE = 'MBA CONSULT · Design options (Demo)';

const common = { bundle: true, write: false, minify: true, logLevel: 'silent', absWorkingDir: root };

const js = await esbuild.build({
  ...common,
  entryPoints: ['src/options/main.js'],
  format: 'iife',
  platform: 'browser',
  target: ['chrome110', 'safari16', 'edge110'],
  loader: { '.svg': 'text', '.png': 'dataurl', '.jpg': 'dataurl' },
  legalComments: 'none',
  outfile: 'dist/.tmp/options.js', // name only; nothing is written (write:false)
});
const css = await esbuild.build({
  ...common,
  entryPoints: ['src/options/styles/index.css'],
  loader: { '.woff2': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl' },
  outdir: 'dist/.tmp', // required by esbuild for CSS assets; nothing is written (write:false)
});

const pick = (res, ext) => {
  const f = res.outputFiles.find((o) => o.path.endsWith(ext));
  if (!f) throw new Error(`build-options: no ${ext} output`);
  return f.text;
};
const jsText = pick(js, '.js').replace(/<\/(script)/gi, '<\\/$1');
const cssText = pick(css, '.css').replace(/<\/(style)/gi, '<\\/$1');
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
<div id="opts"></div>
<script>${jsText}</script>
</body>
</html>
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
const bytes = statSync(outFile).size;
console.log(`build-options: wrote ${outFile} (${bytes.toLocaleString('en-US')} bytes)`);
if (bytes > 4 * 1024 * 1024) {
  console.error(`build-options: WARNING ${bytes} bytes exceeds the 4 MB budget`);
  process.exitCode = 1;
}
