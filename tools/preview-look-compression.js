'use strict';

const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const W = 192;
const H = 208;
const HEAD_BOTTOM = 139;
const BODY_TOP = 132;

function blend(target, targetOffset, source, sourceOffset) {
  const alpha = source[sourceOffset + 3];
  if (alpha === 0) return;
  const inverse = 255 - alpha;
  target[targetOffset] = Math.min(255, source[sourceOffset] + Math.round((target[targetOffset] * inverse) / 255));
  target[targetOffset + 1] = Math.min(255, source[sourceOffset + 1] + Math.round((target[targetOffset + 1] * inverse) / 255));
  target[targetOffset + 2] = Math.min(255, source[sourceOffset + 2] + Math.round((target[targetOffset + 2] * inverse) / 255));
  target[targetOffset + 3] = Math.min(255, alpha + Math.round((target[targetOffset + 3] * inverse) / 255));
}

function compose(atlas, index, scale) {
  const row = index < 8 ? 9 : 10;
  const column = index < 8 ? index : index - 8;
  const frame = atlas.crop({ x: column * W, y: row * H, width: W, height: H });
  const headHeight = Math.round(HEAD_BOTTOM * scale);
  const head = frame.crop({ x: 0, y: 0, width: W, height: HEAD_BOTTOM })
    .resize({ width: W, height: headHeight, quality: 'best' });
  const headBitmap = head.toBitmap();
  const neutral = atlas.crop({ x: 0, y: 0, width: W, height: H });
  const neutralBitmap = neutral.toBitmap();
  const output = Buffer.alloc(W * H * 4);
  const headY = HEAD_BOTTOM - headHeight;

  for (let y = 0; y < headHeight; y += 1) {
    for (let x = 0; x < W; x += 1) {
      blend(output, ((headY + y) * W + x) * 4, headBitmap, (y * W + x) * 4);
    }
  }
  for (let y = BODY_TOP; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const offset = (y * W + x) * 4;
      blend(output, offset, neutralBitmap, offset);
    }
  }
  return nativeImage.createFromBitmap(output, { width: W, height: H, scaleFactor: 1 });
}

app.whenReady().then(() => {
  const outputDir = path.join(__dirname, '..', 'assets', 'source', 'look-preview');
  fs.mkdirSync(outputDir, { recursive: true });
  for (const pet of ['big', 'alien']) {
    const atlas = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', `just-${pet === 'big' ? 'big' : 'alien'}-cat.png`));
    for (const scale of [0.76, 0.82, 0.88]) {
      const output = path.join(outputDir, `${pet}-up-${String(scale).replace('.', '')}.png`);
      fs.writeFileSync(output, compose(atlas, 0, scale).resize({ width: W * 4, height: H * 4, quality: 'best' }).toPNG());
      console.log(`OK ${output}`);
    }
  }
  app.exit(0);
});
