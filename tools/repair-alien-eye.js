'use strict';

const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const CELL_WIDTH = 192;
const CELL_HEIGHT = 208;
const ATLAS_WIDTH = CELL_WIDTH * 8;
const ATLAS_HEIGHT = CELL_HEIGHT * 11;
const FRAME_COLUMN = 6;
const FRAME_ROW = 9;

function setBlack(bitmap, localX, localY) {
  const x = FRAME_COLUMN * CELL_WIDTH + localX;
  const y = FRAME_ROW * CELL_HEIGHT + localY;
  const offset = (y * ATLAS_WIDTH + x) * 4;
  bitmap[offset] = 0;
  bitmap[offset + 1] = 0;
  bitmap[offset + 2] = 0;
  bitmap[offset + 3] = 255;
}

function setAntialias(bitmap, localX, localY, coverage) {
  const x = FRAME_COLUMN * CELL_WIDTH + localX;
  const y = FRAME_ROW * CELL_HEIGHT + localY;
  const offset = (y * ATLAS_WIDTH + x) * 4;
  const inverse = 1 - coverage;
  bitmap[offset] = Math.round(bitmap[offset] * inverse);
  bitmap[offset + 1] = Math.round(bitmap[offset + 1] * inverse);
  bitmap[offset + 2] = Math.round(bitmap[offset + 2] * inverse);
  bitmap[offset + 3] = 255;
}

function luminanceAt(bitmap, localX, localY) {
  const x = FRAME_COLUMN * CELL_WIDTH + localX;
  const y = FRAME_ROW * CELL_HEIGHT + localY;
  const offset = (y * ATLAS_WIDTH + x) * 4;
  return bitmap[offset + 2] * 0.2126
    + bitmap[offset + 1] * 0.7152
    + bitmap[offset] * 0.0722;
}

app.whenReady().then(() => {
  const atlasPath = path.join(__dirname, '..', 'assets', 'just-alien-cat.png');
  const image = nativeImage.createFromPath(atlasPath);
  if (image.isEmpty()) throw new Error(`Unable to load ${atlasPath}`);
  const size = image.getSize();
  if (size.width !== ATLAS_WIDTH || size.height !== ATLAS_HEIGHT) {
    throw new Error(`Unexpected atlas size ${size.width}x${size.height}`);
  }

  const bitmap = Buffer.from(image.toBitmap());
  // Direction 6 originally loses the right half of the eye after row 119,
  // producing a visible green crack.  Continue that existing outer curve as
  // one tapered solid shape; no other face or pose pixels are touched.
  const rightEdges = [134, 133, 132, 131, 130, 129, 128];
  for (let row = 0; row < rightEdges.length; row += 1) {
    const y = 120 + row;
    const edge = rightEdges[row];
    for (let x = 127; x <= edge; x += 1) setBlack(bitmap, x, y);
    setAntialias(bitmap, edge + 1, y, 0.62);
  }

  // Fill every core row continuously between its first and last dark pixel.
  // This removes the two one-pixel green columns present inside the malformed
  // source while leaving the antialiased pixels outside the eye untouched.
  for (let y = 106; y <= 127; y += 1) {
    let first = null;
    let last = null;
    for (let x = 101; x <= 140; x += 1) {
      if (luminanceAt(bitmap, x, y) < 80) {
        if (first === null) first = x;
        last = x;
      }
    }
    if (first === null || last === null) continue;
    for (let x = first; x <= last; x += 1) setBlack(bitmap, x, y);
  }

  const repaired = nativeImage.createFromBitmap(bitmap, {
    width: ATLAS_WIDTH,
    height: ATLAS_HEIGHT,
    scaleFactor: 1
  });
  fs.writeFileSync(atlasPath, repaired.toPNG());
  console.log(`OK ${atlasPath}: repaired direction 6 eye`);
  app.exit(0);
});
