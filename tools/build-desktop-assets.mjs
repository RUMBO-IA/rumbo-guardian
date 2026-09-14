#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'desktop-dist');
const files = [
  'index.html',
  'styles.css',
  'guardian-core.js',
  'evidence-chain.js',
  'app.js',
  'manifest.webmanifest',
  'sw.js',
];

for (const file of files) {
  if (!existsSync(resolve(root, file))) {
    throw new Error(`desktop_source_missing:${file}`);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const file of files) copyFileSync(resolve(root, file), resolve(out, file));
writeFileSync(resolve(out, 'desktop-build.json'), `${JSON.stringify({
  product: 'RUMBO Guardian',
  version: '1.0.0',
  sourceFiles: files,
}, null, 2)}\n`);

process.stdout.write(`desktop assets staged: ${files.length} files\n`);
