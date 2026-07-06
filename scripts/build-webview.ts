/**
 * Build the webview bundle.
 *
 * Runs `Bun.build` on `webview/src/renderer.ts` (browser target, single-file
 * bundle) into `webview/dist/bundle.js`, then writes `dist/index.html` from an
 * inline template (the stage DOM + CSP + a single `<script src="bundle.js">`)
 * and copies `webview/styles.css` into `webview/dist/`.
 *
 * Run via: `bun run build:webview` (see package.json).
 */
import { mkdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'webview', 'src');
const distDir = join(root, 'webview', 'dist');
const entry = join(srcDir, 'renderer.ts');
const bundleOut = join(distDir, 'bundle.js');

const CSP =
  "default-src 'none'; img-src 'self' data: asset: http://asset.localhost; " +
  "media-src 'self' data: asset: http://asset.localhost; " +
  "style-src 'self' 'unsafe-inline'; script-src 'self'; " +
  "connect-src ipc: http://ipc.localhost;";

const INDEX_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${CSP}" />
  <title>MyUsagi</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div id="stage">
    <div id="layer-move">
      <div id="layer-tilt">
        <div id="layer-breathe">
          <div id="pet-content"></div>
        </div>
      </div>
    </div>
    <div id="speech" class="speech" aria-hidden="true"><span class="speech-text"></span></div>
  </div>
  <script src="bundle.js"></script>
</body>
</html>
`;

async function buildBundle(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [entry],
    target: 'browser',
    outfile: bundleOut,
    minify: true,
    format: 'esm',
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error('Bun.build failed');
  }
  // Bun's JS API does not always flush `outfile` to disk reliably; write the
  // emitted code ourselves to guarantee the artifact lands in dist/.
  const out = result.outputs[0];
  if (out) {
    const code = typeof out === 'string' ? out : await new Response(out).text();
    await writeFile(bundleOut, code, 'utf8');
  }
  console.log(`[build:webview] bundled ${result.outputs.length} output(s) → ${bundleOut}`);
}

async function writeIndex(): Promise<void> {
  await writeFile(join(distDir, 'index.html'), INDEX_HTML, 'utf8');
  console.log('[build:webview] wrote dist/index.html');
}

async function copyStyles(): Promise<void> {
  await copyFile(join(root, 'webview', 'styles.css'), join(distDir, 'styles.css'));
  console.log('[build:webview] copied styles.css');
}

async function main(): Promise<void> {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await buildBundle();
  await writeIndex();
  await copyStyles();
  console.log('[build:webview] done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
