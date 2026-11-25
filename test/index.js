// Why this file exists: package.json's mandated script is `node --test test/`.
// Node >= 21 treats each --test argument as a file/glob, not a directory, so Node
// resolves `test/` as a module directory → this index.js. It imports every
// *.test.js in this folder so all suites run under that one command.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith('.test.js')).sort();
for (const f of files) await import(pathToFileURL(join(here, f)).href);
