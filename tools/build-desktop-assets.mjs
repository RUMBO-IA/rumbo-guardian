#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'desktop-dist');
const iconDir = resolve(root, 'src-tauri', 'icons');
const iconPath = resolve(iconDir, 'icon.ico');
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

// Deterministic 1x1 PNG wrapped in an ICO container. This is a build placeholder,
// not a branded production icon. A branded icon is a separate release asset gate.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlA7gAAAABJRU5ErkJggg==',
  'base64',
);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry.writeUInt8(1, 0);
entry.writeUInt8(1, 1);
entry.writeUInt8(0, 2);
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(header.length + entry.length, 12);

mkdirSync(iconDir, { recursive: true });
writeFileSync(iconPath, Buffer.concat([header, entry, png]));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const file of files) copyFileSync(resolve(root, file), resolve(out, file));
writeFileSync(resolve(out, 'desktop-build.json'), `${JSON.stringify({
  product: 'RUMBO Guardian',
  version: '1.0.0',
  sourceFiles: files,
  generatedAssets: ['src-tauri/icons/icon.ico'],
}, null, 2)}\n`);

process.stdout.write(`desktop assets staged: ${files.length} files + deterministic icon\n`);
