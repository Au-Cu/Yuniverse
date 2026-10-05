'use strict';

const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const CELL_WIDTH = 192;
const CELL_HEIGHT = 208;

function isVisible(bitmap, index) {
  return bitmap[index * 4 + 3] >= 48;
}

function largestComponent(bitmap, width, height) {
  const size = width * height;
  const visited = new Uint8Array(size);
  const queue = new Int32Array(size);
  let best = null;

  for (let start = 0; start < size; start += 1) {
    if (visited[start] || !isVisible(bitmap, start)) continue;
    let head = 0;
    let tail = 0;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    visited[start] = 1;
    queue[tail++] = start;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      count += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbors = [];
      if (x > 0) neighbors.push(index - 1);
      if (x + 1 < width) neighbors.push(index + 1);
      if (y > 0) neighbors.push(index - width);
      if (y + 1 < height) neighbors.push(index + width);
      for (const next of neighbors) {
        if (!visited[next] && isVisible(bitmap, next)) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }

    if (!best || count > best.count) best = { count, minX, minY, maxX, maxY };
  }
  return best;
}

function sampleFill(atlas) {
  const bitmap = atlas.crop({ x: 0, y: 0, width: CELL_WIDTH, height: CELL_HEIGHT }).toBitmap();
  const offset = (65 * CELL_WIDTH + 96) * 4;
  return { b: bitmap[offset], g: bitmap[offset + 1], r: bitmap[offset + 2] };
}

function blendPixel(target, targetOffset, source, sourceOffset) {
  const sourceAlpha = source[sourceOffset + 3];
  if (sourceAlpha === 0) return;
  const inverse = 255 - sourceAlpha;
  target[targetOffset] = Math.min(255, source[sourceOffset] + Math.round((target[targetOffset] * inverse) / 255));
  target[targetOffset + 1] = Math.min(255, source[sourceOffset + 1] + Math.round((target[targetOffset + 1] * inverse) / 255));
  target[targetOffset + 2] = Math.min(255, source[sourceOffset + 2] + Math.round((target[targetOffset + 2] * inverse) / 255));
  target[targetOffset + 3] = Math.min(255, sourceAlpha + Math.round((target[targetOffset + 3] * inverse) / 255));
}

function buildForPet(reference, pet, outputPath) {
  const atlasPath = path.join(__dirname, '..', 'assets', `just-${pet === 'big' ? 'big' : 'alien'}-cat.png`);
  const atlas = nativeImage.createFromPath(atlasPath);
  if (atlas.isEmpty()) throw new Error(`Unable to read ${atlasPath}`);
  const fill = sampleFill(atlas);

  const referenceSize = reference.getSize();
  const referenceBitmap = reference.toBitmap();
  const component = largestComponent(referenceBitmap, referenceSize.width, referenceSize.height);
  if (!component) throw new Error('No visible character in sitting reference');

  const padding = 4;
  const cropX = Math.max(0, component.minX - padding);
  const cropY = Math.max(0, component.minY - padding);
  const cropWidth = Math.min(referenceSize.width - cropX, component.maxX - component.minX + 1 + padding * 2);
  const cropHeight = Math.min(referenceSize.height - cropY, component.maxY - component.minY + 1 + padding * 2);
  const scale = Math.min(188 / cropWidth, 204 / cropHeight);
  const width = Math.max(1, Math.round(cropWidth * scale));
  const height = Math.max(1, Math.round(cropHeight * scale));
  const resized = reference.crop({ x: cropX, y: cropY, width: cropWidth, height: cropHeight })
    .resize({ width, height, quality: 'best' });
  const resizedBitmap = resized.toBitmap();
  const resizedComponent = largestComponent(resizedBitmap, width, height);
  const body = Buffer.alloc(CELL_WIDTH * CELL_HEIGHT * 4);
  const offsetX = Math.round((CELL_WIDTH - width) / 2);
  const offsetY = CELL_HEIGHT - height - 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = y * width + x;
      const sourceOffset = sourceIndex * 4;
      const alpha = resizedBitmap[sourceOffset + 3];
      if (alpha < 48) continue;
      const absoluteX = offsetX + x;
      const absoluteY = offsetY + y;
      if (absoluteX < 0 || absoluteX >= CELL_WIDTH || absoluteY < 0 || absoluteY >= CELL_HEIGHT) continue;
      const leftPaw = ((absoluteX - 65) / 29) ** 2 + ((absoluteY - 187) / 24) ** 2 <= 1;
      const rightPaw = ((absoluteX - 127) / 29) ** 2 + ((absoluteY - 187) / 24) ** 2 <= 1;
      const seatedTorso = absoluteX >= 57 && absoluteX <= 135 && absoluteY >= 164 && absoluteY <= 187;
      if (!leftPaw && !rightPaw && !seatedTorso) continue;
      const withinMainBounds = resizedComponent
        && x >= resizedComponent.minX && x <= resizedComponent.maxX
        && y >= resizedComponent.minY && y <= resizedComponent.maxY;
      if (!withinMainBounds) continue;

      const unpremultiply = alpha > 0 ? 255 / alpha : 0;
      const blue = Math.min(255, resizedBitmap[sourceOffset] * unpremultiply);
      const green = Math.min(255, resizedBitmap[sourceOffset + 1] * unpremultiply);
      const red = Math.min(255, resizedBitmap[sourceOffset + 2] * unpremultiply);
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const outputOffset = (absoluteY * CELL_WIDTH + absoluteX) * 4;
      if (luminance < 95) {
        body[outputOffset] = 0;
        body[outputOffset + 1] = 0;
        body[outputOffset + 2] = 0;
      } else {
        body[outputOffset] = Math.round((fill.b * alpha) / 255);
        body[outputOffset + 1] = Math.round((fill.g * alpha) / 255);
        body[outputOffset + 2] = Math.round((fill.r * alpha) / 255);
      }
      body[outputOffset + 3] = alpha;
    }
  }

  const neutral = atlas.crop({ x: 0, y: 0, width: CELL_WIDTH, height: CELL_HEIGHT });
  const neutralBitmap = neutral.toBitmap();
  for (let y = 0; y < 167; y += 1) {
    for (let x = 0; x < CELL_WIDTH; x += 1) {
      const pixelOffset = (y * CELL_WIDTH + x) * 4;
      blendPixel(body, pixelOffset, neutralBitmap, pixelOffset);
    }
  }

  const output = nativeImage.createFromBitmap(body, { width: CELL_WIDTH, height: CELL_HEIGHT, scaleFactor: 1 });
  fs.writeFileSync(outputPath, output.toPNG());
  console.log(`OK ${outputPath} fill=rgb(${fill.r},${fill.g},${fill.b}) reference=${referenceSize.width}x${referenceSize.height} crop=${cropWidth}x${cropHeight}`);
}

app.whenReady().then(() => {
  const referencePath = process.argv[2];
  if (!referencePath) throw new Error('Usage: electron tools/build-sitting-assets.js <reference.png>');
  const reference = nativeImage.createFromPath(path.resolve(referencePath));
  if (reference.isEmpty()) throw new Error(`Unable to read ${referencePath}`);
  buildForPet(reference, 'big', path.join(__dirname, '..', 'assets', 'just-big-sit.png'));
  buildForPet(reference, 'alien', path.join(__dirname, '..', 'assets', 'just-alien-sit.png'));
  app.exit(0);
});
