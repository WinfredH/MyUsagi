#!/usr/bin/env node
/**
 * Bake Usagi dance frames: re-canvas cartoon_dance sources to 840x910 and
 * expand the 33-step playback sequence into numbered PNGs for assets.pak.
 *
 * Framing matches usagi body.png / usagi_roll (foot Y and body height).
 *
 * Usage (from repo root):
 *   node scripts/bake-usagi-dance.mjs
 *   node scripts/bake-usagi-dance.mjs --src path/to/cartoon_dance
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const OUT_W = 840;
const OUT_H = 910;
// Measured from OhMyChiikawa src/images/usagi/body.png and usagi_roll_01.png
export const REF = { footY: 876, bodyH: 797, canvasW: OUT_W, canvasH: OUT_H };

export const DANCE_SEQUENCE = [
  0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2,
  3, 4, 5, 6, 7, 8, 9, 10, 11,
  5, 6, 7, 8, 9, 10, 11, 5
];

export function parseArgs(argv) {
  var src = path.join(ROOT, '..', 'Usagi_chiikawa_Desktop-virtual-pet', 'cartoon_dance');
  var out = path.join(ROOT, 'webview', 'images', 'usagi_dance');
  for (var i = 2; i < argv.length; i++) {
    if (argv[i] === '--src' && argv[i + 1]) { src = path.resolve(argv[++i]); continue; }
    if (argv[i] === '--out' && argv[i + 1]) { out = path.resolve(argv[++i]); continue; }
  }
  return { src: src, out: out };
}

export async function alphaBbox(input) {
  var { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  var minX = info.width, minY = info.height, maxX = 0, maxY = 0;
  for (var y = 0; y < info.height; y++) {
    for (var x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) throw new Error('Empty alpha bbox');
  return {
    minX: minX, minY: minY, maxX: maxX, maxY: maxY,
    bw: maxX - minX + 1, bh: maxY - minY + 1,
    cx: (minX + maxX) / 2
  };
}

async function compositeFrame(sourcePath) {
  var meta = await sharp(sourcePath).metadata();
  var srcBox = await alphaBbox(sourcePath);
  // Scale each frame so character height matches standing pose (stable across frames).
  var scale = REF.bodyH / srcBox.bh;
  var drawW = Math.round(meta.width * scale);
  var drawH = Math.round(meta.height * scale);
  // Wide dance poses must fit inside the canvas — shrink instead of cropping sides.
  var maxW = Math.round(REF.canvasW * 0.96);
  if (drawW > maxW) {
    scale *= maxW / drawW;
    drawW = Math.round(meta.width * scale);
    drawH = Math.round(meta.height * scale);
  }
  var left = Math.round(REF.canvasW / 2 - srcBox.cx * scale);
  var top = Math.round(REF.footY - srcBox.maxY * scale);
  // Clamp horizontal position — shift pose instead of cropping arms/legs.
  if (left < 0) left = 0;
  if (left + drawW > REF.canvasW) left = REF.canvasW - drawW;

  var resized = await sharp(sourcePath)
    .resize(drawW, drawH, { fit: 'fill' })
    .png()
    .toBuffer();

  var extractLeft = 0, extractTop = 0;
  if (top < 0) { extractTop = -top; top = 0; }
  var extractWidth = drawW - extractLeft;
  var extractHeight = Math.min(drawH - extractTop, REF.canvasH - top);
  if (extractWidth < 1 || extractHeight < 1) {
    throw new Error('Frame layout overflow at ' + sourcePath);
  }
  if (extractLeft > 0 || extractTop > 0 || extractWidth !== drawW || extractHeight !== drawH) {
    resized = await sharp(resized)
      .extract({ left: extractLeft, top: extractTop, width: extractWidth, height: extractHeight })
      .png()
      .toBuffer();
  }

  return sharp({
    create: {
      width: OUT_W,
      height: OUT_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: resized, left: left, top: top }])
    .png()
    .toBuffer();
}

async function loadSourceFrames(srcDir) {
  var frames = [];
  for (var n = 1; n <= 12; n++) {
    var p = path.join(srcDir, n + '.png');
    if (!fs.existsSync(p)) throw new Error('Missing source frame: ' + p);
    frames.push(p);
  }
  return frames;
}

async function main() {
  var opts = parseArgs(process.argv);
  if (!fs.existsSync(opts.src)) {
    console.error('Source directory not found:', opts.src);
    console.error('Pass --src path/to/cartoon_dance');
    process.exit(1);
  }

  if (DANCE_SEQUENCE.length !== 33) {
    throw new Error('DANCE_SEQUENCE must have 33 entries, got ' + DANCE_SEQUENCE.length);
  }

  fs.mkdirSync(opts.out, { recursive: true });
  var sources = await loadSourceFrames(opts.src);

  for (var i = 0; i < DANCE_SEQUENCE.length; i++) {
    var srcIdx = DANCE_SEQUENCE[i];
    var outName = 'usagi_dance_' + String(i + 1).padStart(2, '0') + '.webp';
    var outPath = path.join(opts.out, outName);
    var buf = await compositeFrame(sources[srcIdx]);
    await sharp(buf).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(outPath);
    console.log(outName + ' ← ' + (srcIdx + 1) + '.png');
  }

  var sample = await alphaBbox(path.join(opts.out, 'usagi_dance_01.webp'));
  console.log('\nBaked ' + DANCE_SEQUENCE.length + ' frames → ' + opts.out);
  console.log('Sample frame 01 bbox: bh=' + sample.bh + ' footY=' + sample.maxY + ' (ref bodyH=' + REF.bodyH + ' footY=' + REF.footY + ')');
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch(function (err) {
    console.error(err);
    process.exit(1);
  });
}
