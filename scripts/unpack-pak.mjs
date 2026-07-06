#!/usr/bin/env node
/**
 * Decrypt webview/assets.pak and write bundled files to disk.
 *
 * Usage (from repo root):
 *   node scripts/unpack-pak.mjs
 *   node scripts/unpack-pak.mjs --out webview/_extracted
 *   node scripts/unpack-pak.mjs --pak path/to/assets.pak --out /tmp/out
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEFAULT_PAK = path.join(ROOT, 'webview', 'assets.pak');
const DEFAULT_OUT = path.join(ROOT, 'webview', '_extracted');
const VAULT_SEED = 'mybuddy::usagi::asset-vault::v1';

function vaultKey() {
  return crypto.createHash('sha256').update(VAULT_SEED).digest();
}

export function decryptPak(buf) {
  if (buf.length < 17) {
    throw new Error('pak file too short');
  }
  const key = vaultKey();
  const iv = buf.subarray(0, 16);
  const dec = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([dec.update(buf.subarray(16)), dec.final()]);
}

export function loadBundleFromPak(pakPath) {
  const buf = fs.readFileSync(pakPath);
  return JSON.parse(decryptPak(buf).toString('utf8'));
}

export function parseArgs(argv) {
  var pak = DEFAULT_PAK;
  var out = DEFAULT_OUT;
  for (var i = 2; i < argv.length; i++) {
    if (argv[i] === '--pak' && argv[i + 1]) {
      pak = path.resolve(argv[++i]);
      continue;
    }
    if (argv[i] === '--out' && argv[i + 1]) {
      out = path.resolve(argv[++i]);
      continue;
    }
  }
  return { pak: pak, out: out };
}

export function unpackBundle(bundle, outDir) {
  var keys = Object.keys(bundle).sort();
  var totalRaw = 0;

  for (var i = 0; i < keys.length; i++) {
    var rel = keys[i];
    var data = Buffer.from(bundle[rel], 'base64');
    totalRaw += data.length;
    var dest = path.join(outDir, rel.replace(/\//g, path.sep));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
  }

  return { count: keys.length, totalRaw: totalRaw, keys: keys };
}

function main() {
  var opts = parseArgs(process.argv);

  if (!fs.existsSync(opts.pak)) {
    console.error('Missing pak file:', opts.pak);
    process.exit(1);
  }

  var bundle = loadBundleFromPak(opts.pak);
  var result = unpackBundle(bundle, opts.out);

  console.log('Unpacked %s entries from %s', result.count, opts.pak);
  console.log('  output: %s', opts.out);
  console.log('  raw size: %s MB', (result.totalRaw / 1024 / 1024).toFixed(2));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
